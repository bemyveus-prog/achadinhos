#!/usr/bin/env node
// Canal de ofertas relâmpago no Telegram (@minhasofertarelampago)
// A cada execução: escolhe 1 oferta boa com desconto de verdade, coloca na vitrine,
// posta no canal (foto + preço de/por + botão) e manda para você a versão pronta para o WhatsApp.
//   node canal.mjs              posta 1 oferta
//   node canal.mjs --n 2        posta 2
//   node canal.mjs --teste      não posta no canal nem grava na vitrine: só manda a prévia para você
import { createClient } from "@supabase/supabase-js";
import { hasShopeeApi, searchOffers, shortLink } from "./lib/shopee.mjs";
import { normalize, DEFAULT_KEYWORDS } from "./lib/escolha.mjs";
import { brl, salesLabel, shortName } from "./lib/textos.mjs";
import { claude, hasIA } from "./lib/ia.mjs";

const env = (k, d = "") => (process.env[k] ?? "").trim() || d;
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const teste = args.includes("--teste");
const N = Math.max(1, Math.min(5, Number(opt("--n") || 1)));
const log = (...a) => console.log(...a);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CANAL = env("TELEGRAM_CANAL", "@minhasofertarelampago");
const VITRINE = env("VITRINE_URL", "https://ofertas.achadinhosincriveis.site").replace(/\/$/, "");
const TG = (m) => `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${m}`;

async function tg(method, body) {
  const r = await fetch(TG(method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`);
  return j.result;
}

// buscas que costumam ter desconto bom; gira a cada execução
const BUSCAS = [...new Set([...DEFAULT_KEYWORDS, "fone bluetooth", "garrafa termica", "organizador de geladeira", "kit skincare", "tenis feminino",
  "bolsa feminina", "luminaria led", "mop", "air fryer acessorio", "carregador turbo", "smartwatch", "perfume feminino", "conjunto feminino",
  "brinquedo educativo", "utensilios de cozinha", "jogo de cama", "toalha de banho", "escova secadora", "relogio masculino", "camiseta masculina"])];

// uma linha de por que vale (IA barata); sem IA, fica sem
async function frase(p) {
  if (!hasIA()) return "";
  try {
    const t = await claude({ max: 120, content: `Escreva UMA frase curta (até 90 caracteres) para um post de oferta no Telegram sobre o produto "${p.name}". Diga para que serve ou o ganho no dia a dia, em tom animado e natural de português do Brasil. Sem preço, sem nota, sem vendas, sem hashtags, sem aspas, no máximo 1 emoji. Não invente características que não estejam no nome.` });
    return t.replace(/\s+/g, " ").replace(/^["']|["']$/g, "").replace(/[—–]/g, ",").trim().slice(0, 120);
  } catch (e) { log(`  frase IA: ${e.message}`); return ""; }
}

async function main() {
  if (!hasShopeeApi()) throw new Error("Faltam SHOPEE_APP_ID/SHOPEE_APP_SECRET");
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  // não repete o que já foi postado no canal (últimos 600)
  const { data: cfg } = await sb.from("bot_config").select("value").eq("key", "canal_postados").maybeSingle();
  let postados = []; try { postados = JSON.parse(cfg?.value || "[]"); } catch {}
  const usados = new Set(postados.map(String));

  const turno = Math.floor(Date.now() / 3600000);
  const escolhidos = [];
  for (let k = 0; k < BUSCAS.length && escolhidos.length < N; k++) {
    const kw = BUSCAS[(turno * 3 + k) % BUSCAS.length];
    const vistos = new Map();
    for (const sortType of [2, 1]) {
      try {
        const { nodes = [] } = await searchOffers({ keyword: kw, sortType, page: 1, limit: 50 });
        for (const n of nodes) { const x = normalize(n); if (!vistos.has(x.itemId)) vistos.set(x.itemId, x); }
      } catch (e) { log(`  busca "${kw}": ${e.message}`); }
    }
    const bons = [...vistos.values()]
      .filter((x) => x.imageUrl && x.price > 0 && x.price <= 200 && x.discount >= 30 && x.rating >= 4.6 && x.sales >= 300 && x.commission >= 0.03 && !usados.has(x.itemId))
      .sort((a, b) => b.discount * Math.log10(b.sales) - a.discount * Math.log10(a.sales));
    if (bons[0]) { escolhidos.push({ ...bons[0], busca: kw }); usados.add(bons[0].itemId); }
    else log(`  "${kw}": nada com desconto bom`);
  }
  if (!escolhidos.length) throw new Error("Nenhuma oferta boa encontrada agora");

  for (const p of escolhidos) {
    log(`Oferta: ${p.name} | ${brl(p.price)} (-${p.discount}%) · ${salesLabel(p.sales)} vendas · nota ${p.rating} · busca "${p.busca}"`);
    let link = p.offerLink;
    try { link = (await shortLink(p.productLink, "canal")) || link; } catch (e) { log(`  link curto: ${e.message}`); }

    let id = null;
    if (!teste) {
      const dias = Number(env("DIAS_NA_VITRINE", "15"));
      const { data, error } = await sb.from("offers").insert({
        kind: "produto", title: p.name.slice(0, 120), description: `canal:${p.itemId}`, image_url: p.imageUrl,
        price: p.price, original_price: p.originalPrice, link, platform: "shopee", active: true,
        expires_at: dias > 0 ? new Date(Date.now() + dias * 86400000).toISOString() : null,
      }).select("id").single();
      if (error) throw new Error(`Supabase: ${error.message}`);
      id = data.id;
    }
    const destino = id ? `${VITRINE}/r/${id}` : link; // pela vitrine conta o clique
    const nome = shortName(p.name, 9);
    const linha = await frase(p);
    const de = p.originalPrice && p.originalPrice > p.price ? p.originalPrice : null;
    const prova = [p.rating >= 4.5 ? `⭐ ${String(p.rating.toFixed(1)).replace(".", ",")}` : "", p.sales >= 100 ? `🛒 ${salesLabel(p.sales)} vendidos` : ""].filter(Boolean).join("  ·  ");

    const html = [
      `⚡ <b>OFERTA RELÂMPAGO</b> ⚡`,
      ``,
      `<b>${esc(nome)}</b>`,
      linha ? `${esc(linha)}` : "",
      ``,
      de ? `De <s>${brl(de)}</s> por <b>${brl(p.price)}</b>  🔥 -${Math.round(p.discount)}%` : `Por <b>${brl(p.price)}</b>`,
      prova,
      ``,
      `👉 <a href="${destino}">Pegar a oferta</a>`,
      `<i>Preço pode mudar a qualquer momento.</i>`,
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");

    // versão WhatsApp: *negrito*, ~riscado~, link direto
    const zap = [
      `⚡ *OFERTA RELÂMPAGO* ⚡`,
      ``,
      `*${nome}*`,
      linha || "",
      ``,
      de ? `De ~${brl(de)}~ por *${brl(p.price)}* 🔥 -${Math.round(p.discount)}%` : `Por *${brl(p.price)}*`,
      prova,
      ``,
      `👉 ${destino}`,
      `_Preço pode mudar a qualquer momento._`,
    ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");

    if (!teste) {
      await tg("sendPhoto", { chat_id: CANAL, photo: p.imageUrl, caption: html, parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "🛒 Ver oferta", url: destino }]] } });
      log(`  postado no canal ${CANAL} (vitrine #${id})`);
    }
    // para você: a versão do WhatsApp com botão de copiar
    const meu = env("TELEGRAM_CHAT_ID").split(/[\s,;]+/)[0];
    if (meu) {
      const cap = `${teste ? "🧪 PRÉVIA (não postada)\n\n" : `✅ Postado no canal${id ? ` · vitrine #${id}` : ""}\n\n`}📲 Para o canal do WhatsApp, toque em copiar e cole lá (a foto é esta):`;
      // o botão de copiar do Telegram aceita até 256 caracteres; texto maior: segure a mensagem de baixo e copie
      const botao = zap.length <= 256 ? { reply_markup: { inline_keyboard: [[{ text: "📋 Copiar texto do WhatsApp", copy_text: { text: zap } }]] } } : {};
      try { await tg("sendPhoto", { chat_id: meu, photo: p.imageUrl, caption: cap, ...botao }); }
      catch (e) { log(`  botão copiar: ${e.message}`); await tg("sendPhoto", { chat_id: meu, photo: p.imageUrl, caption: cap }); }
      await tg("sendMessage", { chat_id: meu, text: zap, disable_web_page_preview: true });
    }
    if (!teste) postados.push(p.itemId);
  }
  if (!teste) {
    await sb.from("bot_config").upsert({ key: "canal_postados", value: JSON.stringify(postados.slice(-600)), updated_at: new Date().toISOString() });
  }
}

main().catch((e) => { console.error("Erro:", e.message); process.exit(1); });
