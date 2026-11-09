#!/usr/bin/env node
// Reels v2: escolhe um produto na API (ou usa um da vitrine), monta o vídeo curto com a foto da
// categoria e manda para o Telegram (e posta no Instagram com --postar).
//
//   node reels2.mjs --busca "blusa feminina"     produto novo da API (entra na vitrine)
//   node reels2.mjs --oferta 91                   produto que já está na vitrine
//   --postar                                      também posta no Instagram
import path from "path";
import { writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { hasShopeeApi, searchOffers, shortLink } from "./lib/shopee.mjs";
import { normalize, score } from "./lib/escolha.mjs";
import { pickCover, categoriesWithImages } from "./lib/capas.mjs";
import { renderReel2 } from "./lib/reels2.mjs";
import { shortName, brl, salesLabel } from "./lib/textos.mjs";
import { hasTelegram, sendVideo } from "./lib/telegram.mjs";
import { hasMeta, postReel } from "./lib/social.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const env = (k, d) => (process.env[k] ?? "").trim() || d;
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const pct = (v) => (v * 100).toFixed(1).replace(".", ",") + "%";

// o que buscar na Shopee para cada categoria de capa (no modo automático)
const BUSCAS = {
  "moda-feminina": ["blusa feminina", "vestido feminino", "conjunto feminino", "cropped feminino", "calça feminina"],
  "moda-masculina": ["camiseta masculina", "bermuda masculina", "camisa masculina"],
  maquiagem: ["maquiagem", "batom", "rímel", "paleta de sombras", "pincel de maquiagem"],
  skincare: ["skincare", "sérum facial", "protetor solar facial", "hidratante facial"],
  cabelo: ["máscara capilar", "escova secadora", "acessório de cabelo"],
  calcados: ["sandália feminina", "tênis feminino", "chinelo feminino"],
  acessorios: ["bolsa feminina", "óculos de sol feminino", "brinco feminino"],
  infantil: ["roupa infantil", "brinquedo educativo"],
  pet: ["brinquedo pet", "cama pet"],
  celular: ["fone bluetooth", "carregador turbo", "suporte celular"],
  fitness: ["roupa academia feminina", "garrafa academia"],
  organizador: ["organizador", "organizador de gaveta"],
  cozinha: ["utensílio de cozinha", "pote hermético", "air fryer acessório"],
  banheiro: ["organizador banheiro", "tapete banheiro"],
  ferramentas: ["kit ferramentas", "parafusadeira"],
  decoracao: ["decoração quarto", "luminária led"],
  casa: ["limpeza casa", "mop"],
};

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  let p, offerId;

  if (opt("--oferta")) {
    offerId = Number(String(opt("--oferta")).replace("#", ""));
    const { data, error } = await sb.from("offers").select("*").eq("id", offerId).single();
    if (error) throw new Error(`Oferta #${offerId}: ${error.message}`);
    const { data: pick } = await sb.from("auto_picks").select("sales,rating").eq("offer_id", offerId).maybeSingle();
    p = { name: data.title, imageUrl: data.image_url, price: Number(data.price), sales: pick?.sales || 0, rating: pick?.rating || 0 };
  } else {
    if (!hasShopeeApi()) throw new Error("Configure SHOPEE_APP_ID e SHOPEE_APP_SECRET");
    let keyword = opt("--busca") || "blusa feminina";
    if (args.includes("--auto")) {
      // gira entre as categorias que já têm foto de capa, e entre as buscas de cada uma
      const cats = (await categoriesWithImages()).filter((c) => BUSCAS[c]);
      if (!cats.length) throw new Error("Nenhuma categoria tem foto de capa ainda (mande pelo bot: /capa categoria)");
      const turn = Math.floor(Date.now() / 3600000);
      const cat = cats[turn % cats.length];
      const list = BUSCAS[cat];
      keyword = list[Math.floor(turn / cats.length) % list.length];
      args.push("--categoria", cat);
      log(`Modo automático: categoria ${cat}, busca "${keyword}"`);
    }
    // não repete produto que já está na vitrine (Reels, bot, categorias ou achado do dia)
    const { data: have } = await sb.from("offers").select("description").eq("active", true).not("description", "is", null);
    const used = new Set((have || []).map((o) => (o.description.match(/^(?:reel|bot|cat|kit):(\d+)/) || [])[1]).filter(Boolean));
    const { data: picks } = await sb.from("auto_picks").select("item_id");
    for (const r of picks || []) used.add(String(r.item_id));
    const seen = new Map();
    for (const sortType of [2, 5]) for (const page of [1, 2]) {
      try {
        const { nodes = [] } = await searchOffers({ keyword, sortType, page, limit: 50 });
        for (const n of nodes) { const x = normalize(n); if (!seen.has(x.itemId)) seen.set(x.itemId, x); }
      } catch (e) { log(`  busca falhou: ${e.message}`); }
    }
    const ok = [...seen.values()].filter((x) => x.imageUrl && x.price && x.rating >= 4.7 && x.sales >= 100 && x.commission >= 0.1 && !used.has(x.itemId))
      .sort((a, b) => score(b) - score(a));
    if (!ok.length) throw new Error(`Nenhum produto bom para "${keyword}"`);
    p = ok[0];
    log(`Produto: ${p.name}`);
    log(`  ${pct(p.commission)} · ${brl(p.price)} · ${salesLabel(p.sales)} vendas · nota ${p.rating}`);
    let link = p.offerLink;
    try { link = (await shortLink(p.productLink, env("REELS_SUB_ID", "reels"))) || link; } catch (e) { log(`  link curto: ${e.message}`); }
    const dias = Number(env("DIAS_NA_VITRINE", "15"));
    const { data, error } = await sb.from("offers").insert({
      kind: "produto", title: p.name.slice(0, 120), description: `reel:${p.itemId}`, image_url: p.imageUrl,
      price: p.price, link, platform: "shopee", active: true,
      expires_at: dias > 0 ? new Date(Date.now() + dias * 86400000).toISOString() : null,
    }).select("id").single();
    if (error) throw new Error(`Supabase: ${error.message}`);
    offerId = data.id;
    log(`Na vitrine como #${offerId} (subId reelssite)`);
  }

  const cover = await pickCover(p, { log, force: opt("--categoria") });
  if (!cover) throw new Error("Essa categoria ainda não tem foto de capa. Mande uma pelo bot (/capa categoria) ou use --categoria");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const outDir = path.join(HERE, "saida", "reels2", `${today}-${offerId}`);
  const nome = shortName(p.name, 5);
  const { file, seconds, scenes } = await renderReel2(p, { cover, nome, number: `#${offerId}`, outDir, log });
  log(`Vídeo pronto: ${seconds.toFixed(1)} s`);

  const legenda = [
    `${cover.hook.replace(/\*/g, "")} 👀`,
    "",
    "Quanto você chutou? Comenta aí 👇",
    "",
    `🔎 Link na bio! Procura o #${offerId} na busca da vitrine.`,
    "",
    "#achadinhos #achadinhosshopee #shopee #achadosdashopee #comprinhas",
  ].join("\n");
  await writeFile(path.join(outDir, "legenda.txt"), legenda + "\n");

  if (hasTelegram()) {
    await sendVideo(file, `🎬 Reels #${offerId} (${seconds.toFixed(0)} s)\n\nLegenda sugerida:\n\n${legenda}`);
    log("Enviado no Telegram.");
  }
  if (args.includes("--postar")) {
    if (!hasMeta()) throw new Error("Falta META_PAGE_TOKEN para postar.");
    const url = await postReel(file, legenda, `reels2-${offerId}`);
    log(`Postado: ${url}`);
  }
  console.log(scenes.map((s, i) => `${i + 1}. [${s.key}] ${s.say}`).join("\n"));
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
