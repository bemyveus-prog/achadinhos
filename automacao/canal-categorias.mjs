#!/usr/bin/env node
// Post diário do canal (@minhasofertarelampago): 2 a 3 ofertas de cada uma de 3 categorias diferentes,
// numa mensagem só, e FIXA no topo do canal (tira a fixação do post de ontem; o seu post de cupons continua fixado).
//   node canal-categorias.mjs                      escolhe, posta e fixa
//   node canal-categorias.mjs --teste              só manda a prévia para você (nada vai ao canal nem à vitrine)
//   node canal-categorias.mjs --cats 100636,100630 escolhe as categorias à mão
// Variáveis: CANAL_N_CATEGORIAS (3), CANAL_POR_CATEGORIA (3), CANAL_PRECO_MAX (150), CANAL_MIN_DESCONTO (20), DIAS_NA_VITRINE (15)
import { createClient } from "@supabase/supabase-js";
import { hasShopeeApi, searchOffers, shortLink } from "./lib/shopee.mjs";
import { normalize } from "./lib/escolha.mjs";
import { brl, shortName } from "./lib/textos.mjs";
import { RODAPE_CUPONS } from "./lib/telegram.mjs";
import { CATEGORIAS, EMOJI_CATEGORIA } from "./lib/categorias-shopee.mjs";
import { BRAND } from "../lib/brand.mjs";

const env = (k, d = "") => (process.env[k] ?? "").trim() || d;
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const teste = args.includes("--teste");
const log = (...a) => console.log(...a);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CANAL = BRAND.canalChat;
const TG = (m) => `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${m}`;
const N_CATS = Number(env("CANAL_N_CATEGORIAS", "3"));
const POR_CAT = Math.max(2, Number(env("CANAL_POR_CATEGORIA", "3")));
const PRECO_MAX = Number(env("CANAL_PRECO_MAX", "150"));
const MIN_DESC = Number(env("CANAL_MIN_DESCONTO", "20"));

async function tg(method, body) {
  const r = await fetch(TG(method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`);
  return j.result;
}

// ofertas boas de uma categoria: mais vendidas + relevantes, com desconto de verdade e nota alta
async function ofertasDa(catId, usados) {
  const vistos = new Map();
  for (const sortType of [2, 1]) {
    let res = null;
    for (let t = 1; t <= 3 && !res; t++) { // a API às vezes devolve "System Error"; tenta de novo
      try { res = await searchOffers({ catId, sortType, page: 1, limit: 50 }); }
      catch (e) { if (t === 3) log(`  ${CATEGORIAS[catId]}: falhou (${e.message})`); else await new Promise((r) => setTimeout(r, 2000 * t)); }
    }
    for (const n of res?.nodes || []) { const x = normalize(n); if (!vistos.has(x.itemId)) vistos.set(x.itemId, x); }
  }
  return [...vistos.values()]
    .filter((x) => x.imageUrl && x.name && x.price > 0 && x.price <= PRECO_MAX && x.discount >= MIN_DESC && x.rating >= 4.6 && x.sales >= 300 && x.commission >= 0.03 && !usados.has(x.itemId))
    .sort((a, b) => b.discount * Math.log10(b.sales) - a.discount * Math.log10(a.sales));
}

async function main() {
  if (!CANAL && !teste) { log("Sem canal configurado (TELEGRAM_CANAL); nada a fazer."); return; }
  if (!hasShopeeApi()) throw new Error("Faltam SHOPEE_APP_ID/SHOPEE_APP_SECRET");
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  const { data: cfg } = await sb.from("bot_config").select("value").eq("key", "canal_postados").maybeSingle();
  let postados = []; try { postados = JSON.parse(cfg?.value || "[]"); } catch {}
  const usados = new Set(postados.map(String));

  // categorias do dia: gira pela lista, N por dia (ou as que você escolher com --cats)
  const todas = Object.keys(CATEGORIAS);
  const manual = (opt("--cats") || "").split(/[\s,;]+/).filter(Boolean);
  const dia = Math.floor(Date.now() / 86400000);
  const fila = manual.length ? manual : Array.from({ length: todas.length }, (_, i) => todas[(dia * N_CATS + i) % todas.length]);

  const grupos = [];
  for (const id of fila) {
    if (grupos.length >= (manual.length || N_CATS)) break;
    const bons = (await ofertasDa(id, usados)).slice(0, POR_CAT);
    if (bons.length < 2) { log(`  ${CATEGORIAS[id] || id}: só ${bons.length} oferta(s) boa(s); pulando`); continue; }
    bons.forEach((b) => usados.add(b.itemId));
    grupos.push({ id, nome: CATEGORIAS[id] || `Categoria ${id}`, itens: bons });
    log(`${CATEGORIAS[id] || id}: ${bons.length} ofertas`);
  }
  if (grupos.length < 2) throw new Error("Poucas categorias com ofertas boas agora");

  // vitrine + link com contagem de cliques (igual ao post de oferta relâmpago)
  const dias = Number(env("DIAS_NA_VITRINE", "15"));
  for (const g of grupos) {
    for (const p of g.itens) {
      let link = p.offerLink;
      if (teste) { p.destino = link; continue; }
      try { link = (await shortLink(p.productLink, "canal")) || link; } catch (e) { log(`  link curto: ${e.message}`); }
      const { data, error } = await sb.from("offers").insert({
        kind: "produto", title: p.name.slice(0, 120), description: `canal:${p.itemId}`, image_url: p.imageUrl,
        price: p.price, original_price: p.originalPrice, link, platform: "shopee", category: g.nome, active: true,
        expires_at: dias > 0 ? new Date(Date.now() + dias * 86400000).toISOString() : null,
      }).select("id").single();
      if (error) throw new Error(`Supabase: ${error.message}`);
      p.destino = `${BRAND.site}/r/${data.id}`;
    }
  }

  const data = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const linhas = [`🔥 <b>MELHORES OFERTAS DO DIA</b> · ${data}`, `<i>Os achados mais vendidos e com desconto, por categoria</i>`];
  for (const g of grupos) {
    linhas.push("", `${EMOJI_CATEGORIA[g.id] || "🛍️"} <b>${esc(g.nome)}</b>`);
    for (const p of g.itens) {
      const de = p.originalPrice && p.originalPrice > p.price ? `<s>${brl(p.originalPrice)}</s> ` : "";
      linhas.push(`▪️ <a href="${p.destino}">${esc(shortName(p.name, 7))}</a>`, `    ${de}<b>${brl(p.price)}</b> 🔥 -${Math.round(p.discount)}% · ⭐ ${String(p.rating.toFixed(1)).replace(".", ",")}`);
    }
  }
  linhas.push("", RODAPE_CUPONS, `<i>Preços podem mudar a qualquer momento.</i>`);
  const texto = linhas.join("\n");
  log("\n" + texto.replace(/<[^>]+>/g, "") + "\n");

  const meu = env("TELEGRAM_CHAT_ID").split(/[\s,;]+/)[0];
  if (teste) {
    if (meu) await tg("sendMessage", { chat_id: meu, text: `🧪 <b>PRÉVIA</b> (não foi ao canal)\n\n${texto}`, parse_mode: "HTML", disable_web_page_preview: true });
    return;
  }

  // posta, tira a fixação do post de ontem e fixa este
  const msg = await tg("sendMessage", { chat_id: CANAL, text: texto, parse_mode: "HTML", disable_web_page_preview: true });
  log(`Postado no canal ${CANAL} (mensagem ${msg.message_id})`);
  const { data: ant } = await sb.from("bot_config").select("value").eq("key", "canal_fixado_ofertas").maybeSingle();
  if (ant?.value) { try { await tg("unpinChatMessage", { chat_id: CANAL, message_id: Number(ant.value) }); } catch (e) { log(`  desafixar o de ontem: ${e.message}`); } }
  let fixou = true;
  try {
    await tg("pinChatMessage", { chat_id: CANAL, message_id: msg.message_id, disable_notification: true });
    log("Fixado no topo do canal.");
  } catch (e) {
    fixou = false; log(`  não consegui fixar: ${e.message}`);
    if (meu) await tg("sendMessage", { chat_id: meu, text: `⚠️ Postei as ofertas do dia no canal, mas não consegui fixar (${e.message}).\nNo canal: Administradores → @Achadinhos_bot → ligue "Editar mensagens". Depois fixe esta mensagem à mão.` }).catch(() => {});
  }
  await sb.from("bot_config").upsert([
    { key: "canal_postados", value: JSON.stringify([...postados, ...[...usados].filter((u) => !postados.includes(u))].slice(-600)), updated_at: new Date().toISOString() },
    ...(fixou ? [{ key: "canal_fixado_ofertas", value: String(msg.message_id), updated_at: new Date().toISOString() }] : []),
  ]);
  if (meu && fixou) await tg("sendMessage", { chat_id: meu, text: `✅ Ofertas do dia postadas e fixadas no canal (${grupos.map((g) => g.nome).join(", ")}).` }).catch(() => {});
}

main().catch((e) => { console.error("Erro:", e.message); process.exit(1); });
