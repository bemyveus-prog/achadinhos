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
import { gql, hasShopeeApi, searchOffers, shortLink } from "./lib/shopee.mjs";
import { gerarNarracao } from "./lib/narracao.mjs";
import { normalize, score } from "./lib/escolha.mjs";
import { pickCover, categoriesWithImages, coverConfig, categoryOf } from "./lib/capas.mjs";
import { execFile } from "child_process";
import { promisify } from "util";
const run = promisify(execFile);
import { renderReel2 } from "./lib/reels2.mjs";
import { shortName, brl, salesLabel } from "./lib/textos.mjs";
import { hasTelegram, sendVideo } from "./lib/telegram.mjs";
import { hasMeta, postReel, uploadPublic } from "./lib/social.mjs";
import { hasCJ, productBySku, productVideos, bestFreeVideo, downloadVideo } from "./lib/cj.mjs";

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
    // produto que veio do grupo: busca nota e vendas na API (description = "grupo:shopId:itemId")
    const g = String(data.description || "").match(/^grupo:(\d+):(\d+)$/);
    if (g && hasShopeeApi()) {
      try {
        const d = await gql(`{ productOfferV2(shopId: ${g[1]}, itemId: ${g[2]}, limit: 1) { nodes { sales ratingStar } } }`);
        const n = d?.productOfferV2?.nodes?.[0];
        if (n) { p.sales = Number(n.sales) || 0; p.rating = Number(n.ratingStar) || 0; }
      } catch {}
    }
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

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const outDir = path.join(HERE, "saida", "reels2", `${today}-${offerId}`);

  // vídeo real do produto na CJ (--cj SKU) ou enviado pelo bot (REELS_VIDEO)
  let clip = null;
  const own = (process.env.REELS_VIDEO || "").trim();
  if (own) {
    const { mkdir } = await import("fs/promises");
    await mkdir(outDir, { recursive: true });
    const { data, error } = await sb.storage.from("reels-videos").download(own);
    if (error) throw new Error(`Vídeo enviado (${own}): ${error.message}`);
    const f = path.join(outDir, "seu-video" + path.extname(own));
    await writeFile(f, Buffer.from(await data.arrayBuffer()));
    clip = { file: f, maxSec: 12 }; // o seu vídeo pode aparecer mais tempo
    log(`Usando o seu vídeo (${own})`);
  }
  if (opt("--cj")) {
    if (!hasCJ()) throw new Error("Falta o secret CJ_API_KEY");
    const prod = await productBySku(opt("--cj"));
    if (!prod) throw new Error(`Não achei o SKU ${opt("--cj")} na CJ`);
    log(`CJ: ${prod.name}`);
    const vids = await productVideos(prod.pid);
    const best = bestFreeVideo(vids);
    if (!best) throw new Error(`O produto ${opt("--cj")} tem ${vids.length} vídeo(s) na CJ, mas nenhum grátis`);
    const { mkdir } = await import("fs/promises");
    await mkdir(outDir, { recursive: true });
    const cjFile = await downloadVideo(best.url, path.join(outDir, "cj.mp4"));
    log(`  vídeo grátis: ${best.duration.toFixed(0)} s, ${best.w}x${best.h}, ▶${best.plays}`);
    if (clip) {
      // seu vídeo + vídeo da CJ emendados (até 6 s de cada), já no formato do quadro do Reels
      const both = path.join(outDir, "seu-video+cj.mp4");
      const fit = "scale=780:1180:force_original_aspect_ratio=increase,crop=780:1180,fps=30,setsar=1,setpts=PTS-STARTPTS";
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", clip.file, "-i", cjFile, "-filter_complex",
        `[0:v]trim=0:6,${fit}[a];[1:v]trim=0.5:6.5,${fit}[b];[a][b]concat=n=2:v=1:a=0[v]`,
        "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", both]);
      clip = { file: both, maxSec: 12 };
      log("  seu vídeo + vídeo da CJ emendados");
    } else clip = { file: cjFile };
  }
  const nome = shortName(p.name, 5);
  // sem capa no Reels: só o gancho da categoria entra na narração padrão (quando não há texto próprio)
  const cfg = await coverConfig();
  const slug = opt("--categoria") || categoryOf(p.name || "", cfg);
  const c = cfg[slug] || {};
  const ganchos = c.ganchos?.length ? c.ganchos : ["Eu *não acreditei* quando vi isso"];
  const cover = { hook: ganchos[Math.floor(Date.now() / 3600000) % ganchos.length], accent: c.cor || "#D0306F" };
  let fala = (process.env.REELS_FALA || "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (!fala && env("REELS_GERAR_FALA", "") === "1") fala = await gerarNarracao(p, { contexto: env("REELS_CONTEXTO", ""), log });
  if (fala) log(`Narração própria: "${fala}"`);
  // final: "me segue" + link da bio; o cupom só é citado se a vitrine tiver cupom ativo agora
  const agora = new Date().toISOString();
  const { count: cupons } = await sb.from("offers").select("id", { count: "exact", head: true })
    .eq("active", true).eq("kind", "cupom").or(`expires_at.is.null,expires_at.gt.${agora}`);
  const cupom = (cupons || 0) > 0;
  let avatar = null;
  try {
    const { data: av } = await sb.storage.from("capas").list("avatar", { limit: 20, sortBy: { column: "name", order: "desc" } });
    const last = (av || []).find((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    if (last) {
      const { data } = await sb.storage.from("capas").download(`avatar/${last.name}`);
      avatar = path.join(outDir, "avatar" + path.extname(last.name));
      const { mkdir } = await import("fs/promises");
      await mkdir(outDir, { recursive: true });
      await writeFile(avatar, Buffer.from(await data.arrayBuffer()));
    }
  } catch (e) { log(`  avatar: ${e.message}`); }
  log(`  final: ${cupom ? `com cupom (${cupons} ativos)` : "sem cupom ativo"} · ${avatar ? "com foto do perfil" : "sem foto do perfil (mande /avatar no bot)"}`);
  const modo = env("REELS_MODO", "instagram") === "shopee" ? "shopee" : "instagram";
  if (modo === "shopee") log("Modo Shopee Vídeo: final chamando para o produto vinculado");
  const { file, seconds, scenes } = await renderReel2(p, { cover, nome, number: `#${offerId}`, outDir, clip, fala, cupom, avatar, modo, handle: env("INSTAGRAM_HANDLE", "@minh.asofertas"), log });
  log(`Vídeo pronto: ${seconds.toFixed(1)} s`);

  const legenda = [
    `${(fala || cover.hook).replace(/\*/g, "").slice(0, 150)} 👀`,
    "",
    "Você usaria? Comenta aqui 👇",
    "",
    "✅ Me segue que todo dia tem achado novo abaixo de R$ 50!",
    `🔎 Link na bio! Procura o #${offerId} na busca da vitrine${cupom ? " (e tem cupom da Shopee lá 🎟️)" : ""}.`,
    "",
    "#achadinhos #achadinhosshopee #shopee #achadosdashopee #comprinhas",
  ].join("\n");
  await writeFile(path.join(outDir, "legenda.txt"), legenda + "\n");

  // capa vertical para o pin do Pinterest
  const { makePinImage } = await import("./lib/pins.mjs");
  await makePinImage({ id: offerId, title: p.name, image_url: p.imageUrl, price: p.price, sales: p.sales, rating: p.rating }, { log }).catch((e) => log(`  pin: ${e.message}`));

  // Shopee Vídeo: não tem postagem automática; o vídeo vai para o Telegram para você subir no app
  if (modo === "shopee") {
    const { data: off } = await sb.from("offers").select("link").eq("id", offerId).maybeSingle();
    const legShopee = [
      `${(fala || cover.hook).replace(/\*/g, "").slice(0, 120)}`,
      "",
      "👇 Toque no produto aqui embaixo para ver o preço de hoje!",
      "",
      "#achadinhos #achadosdashopee #shopee #comprinhas #oferta",
    ].join("\n");
    await writeFile(path.join(outDir, "legenda-shopee.txt"), legShopee + "\n");
    if (hasTelegram()) {
      await sendVideo(file, `🛍️ Shopee Vídeo #${offerId} (${seconds.toFixed(0)} s)\n\nNo app Shopee: Vídeo → postar → vincule o produto #${offerId}${off?.link ? ` (${off.link})` : ""}.\n\nLegenda:\n\n${legShopee}`.slice(0, 1024));
      log("Enviado no Telegram (Shopee Vídeo).");
    }
    console.log(scenes.map((x, i) => `${i + 1}. [${x.key}] ${x.say}`).join("\n"));
    return;
  }

  const postarJa = args.includes("--postar");
  if (hasTelegram()) {
    // sem "postar": guarda o vídeo e manda com o botão de aprovação
    let markup = null;
    if (!postarJa && hasMeta()) {
      try {
        const [video_url] = await uploadPublic([file], `reels2-${offerId}-${Date.now()}`, "video/mp4");
        const { data, error } = await sb.from("reels_pendentes").insert({ offer_id: offerId, video_url, caption: legenda }).select("id").single();
        if (error) throw new Error(error.message);
        markup = { inline_keyboard: [[{ text: "📤 Postar no Instagram", callback_data: `pub:${data.id}` }], [{ text: "🗑️ Descartar", callback_data: `nopub:${data.id}` }]] };
      } catch (e) { log(`  aprovação: ${e.message}`); }
    }
    await sendVideo(file, `🎬 Reels #${offerId} (${seconds.toFixed(0)} s)${postarJa ? " · postando no Instagram…" : ""}\n\nLegenda:\n\n${legenda}`.slice(0, 1024), markup);
    log("Enviado no Telegram.");
  }
  if (postarJa) {
    if (!hasMeta()) throw new Error("Falta META_PAGE_TOKEN para postar.");
    const url = await postReel(file, legenda, `reels2-${offerId}`);
    log(`Postado: ${url}`);
  }
  console.log(scenes.map((s, i) => `${i + 1}. [${s.key}] ${s.say}`).join("\n"));
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
