#!/usr/bin/env node
// Carrossel "Top 5" no estilo do post que mais rendeu ("5 achadinhos que parecem bobos..."):
//   capa com gancho que bate na dor + colagem dos 5 produtos → 1 cartão por produto → cartão final (salvar, comentar, link na bio).
// Substitui o carrossel verde de 1 produto. Uma vez por dia; posta no Instagram (+ Threads) quando POSTAR=instagram.
//   node top-carrossel.mjs            escolhe, gera, manda no Telegram e posta
//   node top-carrossel.mjs --teste    só gera e manda a prévia no Telegram
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { escolherTopShopee } from "./lib/toptema.mjs";
import { imageDataUri } from "./lib/carrossel.mjs";
import { shortName } from "./lib/textos.mjs";
import { hasTelegram, sendPreview, sendText } from "./lib/telegram.mjs";
import { hasMeta, publishSocial } from "./lib/social.mjs";
import { BRAND } from "../lib/brand.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = (k, d = "") => (process.env[k] ?? "").trim() || d;
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const teste = process.argv.includes("--teste");
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// título com 1 a 2 palavras em destaque (amarelo): a palavra da dor e o número
function tituloHtml(t) {
  const palavras = String(t).split(/\s+/);
  const alvo = new Set();
  palavras.forEach((w, i) => { if (/^\d+$/.test(w)) alvo.add(i); });
  // destaca a maior palavra da primeira metade (costuma ser a dor)
  let mi = -1, ml = 0;
  palavras.slice(0, Math.ceil(palavras.length * 0.6)).forEach((w, i) => { const l = w.replace(/[^\p{L}]/gu, "").length; if (l > ml && !alvo.has(i)) { ml = l; mi = i; } });
  if (mi >= 0) alvo.add(mi);
  return palavras.map((w, i) => (alvo.has(i) ? `<mark>${esc(w)}</mark>` : esc(w))).join(" ");
}

function pagina(slides, ac) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:P;src:url("${BRAND.site}/fonts/Poppins-Bold.ttf")}
  *{box-sizing:border-box;margin:0;padding:0}body{font-family:P,system-ui,sans-serif;background:#000}
  .s{width:1080px;height:1350px;position:relative;overflow:hidden;color:#fff;background:radial-gradient(circle at 50% 30%,#3a1406 0%,#140804 55%,#070302 100%)}
  .glow{position:absolute;inset:0;background:radial-gradient(circle at 50% 18%,${ac}55,transparent 55%)}
  .tag{position:absolute;top:56px;left:50%;transform:translateX(-50%);background:${ac};color:#fff;font-size:30px;font-weight:800;padding:10px 30px;border-radius:999px;letter-spacing:1px;white-space:nowrap}
  .h{position:absolute;left:60px;right:60px;top:140px;text-align:center;font-size:92px;line-height:1.02;font-weight:900;letter-spacing:-1px;text-shadow:0 8px 0 rgba(0,0,0,.35)}
  .h mark{background:none;color:#FFD54A}
  .grid{position:absolute;left:50px;right:50px;bottom:120px;height:600px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr;gap:22px}
  .c{background:#fff;border-radius:34px;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:14px;box-shadow:0 18px 40px rgba(0,0,0,.45);position:relative}
  .c img{width:100%;height:200px;object-fit:contain}.c b{color:#1c1917;font-size:24px;text-align:center;line-height:1.1;margin-top:8px;height:54px;overflow:hidden}
  .c i{position:absolute;top:-14px;left:-10px;background:#FFD54A;color:#1c1917;font-style:normal;font-weight:900;font-size:30px;width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 14px rgba(0,0,0,.3)}
  .c.big{grid-row:span 2}.c.big img{height:420px}
  .sw{position:absolute;bottom:44px;left:0;right:0;text-align:center;font-size:30px;opacity:.85}
  .handle{position:absolute;top:22px;right:34px;font-size:24px;opacity:.6}
  .n{position:absolute;top:60px;left:60px;font-size:200px;line-height:1;font-weight:900;color:#FFD54A;text-shadow:0 10px 0 rgba(0,0,0,.35)}
  .of{position:absolute;top:96px;right:60px;font-size:34px;background:rgba(255,255,255,.14);padding:10px 24px;border-radius:999px}
  .ph{position:absolute;left:90px;right:90px;top:290px;height:640px;background:#fff;border-radius:48px;display:flex;align-items:center;justify-content:center;box-shadow:0 30px 60px rgba(0,0,0,.5)}
  .ph img{max-width:88%;max-height:88%;object-fit:contain}
  .nm{position:absolute;left:70px;right:70px;top:965px;text-align:center;font-size:50px;font-weight:900;line-height:1.08}
  .bf{position:absolute;left:90px;right:90px;top:1100px;text-align:center;font-size:38px;color:#FFD54A;line-height:1.15}
  .id{position:absolute;left:50%;transform:translateX(-50%);bottom:56px;background:#fff;color:#1c1917;font-size:34px;font-weight:800;padding:12px 30px;border-radius:999px;white-space:nowrap}
  .id span{background:${ac};color:#fff;padding:2px 16px;border-radius:999px;margin-left:8px}
  .cta{position:absolute;left:80px;right:80px;top:180px;text-align:center}
  .cta h2{font-size:84px;line-height:1.05;font-weight:900}.cta h2 mark{background:none;color:#FFD54A}
  .row{display:flex;align-items:center;gap:26px;background:rgba(255,255,255,.1);border-radius:30px;padding:26px 30px;margin-top:28px;text-align:left;font-size:38px}
  .row em{font-style:normal;font-size:60px}
  .tk{display:flex;align-items:center;justify-content:space-between;gap:22px;background:#FFD54A;color:#1c1917;border-radius:30px;padding:26px 34px;margin-top:30px;text-align:left;border:4px dashed rgba(28,25,23,.35)}
  .tk small{display:block;font-size:26px;font-weight:800;letter-spacing:2px;opacity:.75}
  .tk b{display:block;font-size:46px;line-height:1.05;font-weight:900;margin-top:4px}
  .tk i{font-style:normal;background:#229ED9;color:#fff;font-size:30px;font-weight:800;padding:14px 26px;border-radius:999px;white-space:nowrap}
  </style></head><body>${slides.join("")}</body></html>`;
}

async function main() {
  const top = await escolherTopShopee(sb, { log, chave: "top_recentes", subId: "topcarrossel" });
  const { data: offers } = await sb.from("offers").select("id,title,image_url,price").in("id", top.items.map((i) => i.id));
  const byId = new Map((offers || []).map((o) => [o.id, o]));
  const itens = [];
  for (const it of top.items) {
    const o = byId.get(it.id);
    if (!o?.image_url) continue;
    try { itens.push({ ...it, nome: shortName(o.title, 4), img: await imageDataUri(o.image_url) }); }
    catch (e) { log(`  foto do #${it.id}: ${e.message}`); }
  }
  if (itens.length < 3) throw new Error("Produtos com foto insuficientes");
  const ac = BRAND.accent || "#EE4D2D";
  const handle = esc(BRAND.handle || "");

  const capa = `<section class="s"><div class="glow"></div><div class="tag">TOP ${itens.length} ACHADINHOS</div><div class="h">${tituloHtml(top.title)}</div>
    <div class="grid">${itens.map((it, k) => `<div class="c${k === 0 ? " big" : ""}"><i>${k + 1}</i><img src="${it.img}"><b>${esc(it.nome)}</b></div>`).join("")}</div>
    <div class="sw">arrasta pro lado →</div><div class="handle">${handle}</div></section>`;
  const cartoes = itens.map((it, k) => `<section class="s"><div class="glow"></div><div class="handle">${handle}</div><div class="n">${k + 1}</div><div class="of">${k + 1}/${itens.length}</div>
    <div class="ph"><img src="${it.img}"></div><div class="nm">${esc(it.nome)}</div><div class="bf">${esc(it.cartao || "")}</div>
    <div class="id">🔎 Busca na vitrine <span>#${it.id}</span></div></section>`);
  const fim = `<section class="s"><div class="glow"></div><div class="handle">${handle}</div><div class="cta">
    <h2>Qual desses <mark>você levaria?</mark></h2>
    ${BRAND.canalTelegram ? `<div class="tk"><div><small>🎟️ CUPOM PRA RESGATAR</small><b>Entra no grupo VIP do Telegram</b></div><i>link na bio</i></div>` : ""}
    <div class="row"><em>💬</em><div>Comenta o <b>número</b> aqui embaixo</div></div>
    <div class="row"><em>🔖</em><div><b>Salva</b> pra achar depois</div></div>
    <div class="row"><em>🔗</em><div>Link na bio: busca o <b>#número</b> na vitrine</div></div>
    <div class="row"><em>➕</em><div><b>Me segue</b>: achado novo todo dia</div></div></div></section>`;

  const outDir = path.join(HERE, "saida", "top-carrossel", `${Date.now()}`);
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  const files = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    await page.setContent(pagina([capa, ...cartoes, fim], ac), { waitUntil: "load", timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    const secs = await page.$$("section");
    for (let i = 0; i < secs.length; i++) {
      const f = path.join(outDir, `${String(i + 1).padStart(2, "0")}.jpg`);
      await secs[i].screenshot({ path: f, type: "jpeg", quality: 92 });
      files.push(f);
    }
  } finally { await browser.close(); }
  log(`Carrossel: ${files.length} imagens`);

  const legenda = [
    `${top.title} 👀`,
    "",
    ...itens.map((it, k) => `${k + 1}. ${it.nome} → #${it.id}`),
    "",
    "Qual você levaria? Comenta o número 👇",
    "🔖 Salva pra não perder e manda pra quem precisa!",
    "🔎 Link na bio: busca o número na vitrine.",
    `➕ Me segue pra ver um achado novo todo dia${BRAND.canalTelegram ? "\n🎟️ Tem cupom pra resgatar no grupo VIP do Telegram: o link tá na bio" : ""}`,
    "",
    "#achadinhos #achadinhosshopee #achadosdashopee #utilidadesdomesticas #comprinhas",
  ].join("\n");
  await writeFile(path.join(outDir, "legenda.txt"), legenda + "\n");

  if (hasTelegram()) {
    try { await sendPreview(files, legenda, `🗂️ Carrossel Top ${itens.length}${teste ? " (prévia, não postado)" : ""}\nDor: ${top.dor || "-"}`); }
    catch (e) { log(`Telegram: ${e.message}`); }
  }
  const targets = env("POSTAR").split(",").map((s) => s.trim().toLowerCase()).filter((t) => ["instagram", "facebook"].includes(t));
  if (teste || !targets.length || !hasMeta()) { log("Não postado (teste ou POSTAR vazio)."); return; }
  const { results, errors } = await publishSocial(files, { folder: `top-${Date.now()}`, caption: legenda, link: BRAND.site, linkThreads: BRAND.site, targets });
  for (const [k, v] of Object.entries(results)) log(`Postado no ${k}: ${v}`);
  if (hasTelegram()) await sendText([...Object.entries(results).map(([k, v]) => `✅ ${k}: ${v}`), ...errors.map((e) => `❌ ${e}`)].join("\n")).catch(() => {});
  if (errors.length) throw new Error(errors.join(" | "));
}

main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
