#!/usr/bin/env node
// Vídeo do grupo sem link de produto: a IA olha quadros do vídeo, descreve o produto, busca na API de
// afiliados e manda os 3 mais parecidos no Telegram para você confirmar (botões "É esse").
//   node identificar.mjs --id 12   (linha da tabela grupo_pendentes)
import path from "path";
import { mkdir, writeFile, readFile, readdir } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { createClient } from "@supabase/supabase-js";
import { searchOffers } from "./lib/shopee.mjs";
import { normalize } from "./lib/escolha.mjs";
import { hasTelegram, sendText } from "./lib/telegram.mjs";
import { claude as ia } from "./lib/ia.mjs";

const run = promisify(execFile);
const env = (k, d = "") => (process.env[k] ?? "").trim() || d;
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const i = process.argv.indexOf("--id");
const ID = Number(i > 0 ? process.argv[i + 1] : process.env.GRUPO_ID);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const brl = (v) => "R$ " + Number(v).toFixed(2).replace(".", ",");

async function claude(content, maxTokens = 500) {
  const t = await ia({ model: env("ANTHROPIC_MODEL_VISAO", "claude-haiku-5-5"), content, max: maxTokens });
  const m = t.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : t);
}

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json(); if (!j.ok) throw new Error(j.description); return j.result;
}

async function main() {
  if (!env("ANTHROPIC_API_KEY")) throw new Error("Falta ANTHROPIC_API_KEY");
  const { data: row, error } = await sb.from("grupo_pendentes").select("*").eq("id", ID).single();
  if (error) throw new Error(error.message);
  const dir = path.resolve("saida/identificar", String(ID));
  await mkdir(dir, { recursive: true });
  const { data: blob, error: e2 } = await sb.storage.from("reels-videos").download(row.video);
  if (e2) throw new Error(e2.message);
  const vfile = path.join(dir, "video.mp4");
  await writeFile(vfile, Buffer.from(await blob.arrayBuffer()));

  // 4 quadros espalhados pelo vídeo
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", vfile]);
  const dur = Number(stdout.trim()) || 8;
  const frames = [];
  for (const [k, f] of [0.15, 0.4, 0.65, 0.88].entries()) {
    const out = path.join(dir, `q${k}.jpg`);
    await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(dur * f), "-i", vfile, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", out]);
    frames.push(out);
  }
  const images = await Promise.all(frames.map(async (f) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: (await readFile(f)).toString("base64") } })));

  // 1) o que é o produto
  const ident = await claude([...images, { type: "text", text:
`Estes são quadros de um vídeo de divulgação de um produto vendido na Shopee Brasil.
Texto que veio junto: """${String(row.contexto || "").slice(0, 600)}"""
Identifique o produto principal que está sendo vendido (ignore pessoas, cenário e textos de marketing).
Responda só com JSON: {"descricao": "o que é o produto em até 12 palavras", "buscas": ["3 buscas curtas em português como alguém digitaria na Shopee, da mais específica para a mais geral"]}` }]);
  log("Produto:", ident.descricao, "| buscas:", (ident.buscas || []).join(" / "));

  // 2) candidatos na API de afiliados
  const seen = new Map();
  for (const q of (ident.buscas || []).slice(0, 3)) {
    for (const sortType of [1, 2]) {
      try {
        const { nodes = [] } = await searchOffers({ keyword: q, sortType, limit: 20 });
        for (const n of nodes) { const p = normalize(n); if (p.imageUrl && !seen.has(p.itemId)) seen.set(p.itemId, p); }
      } catch (e) { log(`  busca "${q}": ${e.message}`); }
    }
  }
  const list = [...seen.values()].slice(0, 40);
  if (!list.length) throw new Error("Nenhum produto encontrado na busca");

  // 3) a IA escolhe os 3 que mais parecem o produto do vídeo (compara com as fotos dos candidatos)
  const cand = list.slice(0, 15);
  const thumbs = [];
  for (const p of cand) {
    try {
      const r = await fetch(p.imageUrl, { signal: AbortSignal.timeout(15000) });
      thumbs.push(r.ok ? { type: "image", source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(await r.arrayBuffer()).toString("base64") } } : null);
    } catch { thumbs.push(null); }
  }
  const content = [images[1], { type: "text", text: "Quadro do vídeo acima. Abaixo, produtos candidatos numerados:" }];
  cand.forEach((p, k) => { content.push({ type: "text", text: `#${k}: ${p.name}` }); if (thumbs[k]) content.push(thumbs[k]); });
  content.push({ type: "text", text: `Qual(is) candidato(s) é o MESMO produto do vídeo (mesmo tipo, formato e aparência)? Responda só com JSON: {"melhores": [até 3 números dos candidatos, do mais parecido para o menos], "certeza": "alta|media|baixa"}` });
  let melhores = [0, 1, 2], certeza = "baixa";
  try { const r = await claude(content, 200); melhores = (r.melhores || []).filter((n) => cand[n]).slice(0, 3); certeza = r.certeza || certeza; } catch (e) { log("  ranking:", e.message); }
  if (!melhores.length) melhores = [0, 1, 2].filter((n) => cand[n]);
  const escolhidos = melhores.map((n) => cand[n]);
  log("Candidatos:", escolhidos.map((p) => p.name.slice(0, 50)).join(" | "), "| certeza", certeza);

  await sb.from("grupo_pendentes").update({ descricao: ident.descricao, candidatos: escolhidos, status: "escolher" }).eq("id", ID);

  // 4) Telegram: quadro + 3 opções com botão
  if (hasTelegram()) {
    const chat_id = env("TELEGRAM_CHAT_ID").split(/[\s,;]+/)[0];
    await sendText(`🔎 <b>Vídeo do grupo:</b> ${ident.descricao}\nConfiança: ${certeza}. Qual destes é o produto?`, { html: true });
    for (const [k, p] of escolhidos.entries()) {
      const caption = `<b>${k + 1}.</b> ${p.name.slice(0, 150)}\n💰 ${brl(p.price)} · 💸 ${(p.commission * 100).toFixed(1).replace(".", ",")}% · ⭐ ${p.rating || "-"} · ${p.sales} vendas recentes`;
      await tg("sendPhoto", { chat_id, photo: p.imageUrl, caption, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: `✅ É esse (${k + 1})`, callback_data: `gp:${ID}:${k}` }]] } }).catch((e) => log("  envio:", e.message));
    }
    await tg("sendMessage", { chat_id, text: "Não é nenhum desses?", reply_markup: { inline_keyboard: [[{ text: "❌ Nenhum (descartar)", callback_data: `gpx:${ID}` }]] } });
  }
}
main().catch(async (e) => {
  console.error("ERRO:", e.message);
  await sb.from("grupo_pendentes").update({ status: "erro" }).eq("id", ID).then(() => {}, () => {});
  if (hasTelegram()) await sendText(`⚠️ Não consegui identificar o produto do vídeo do grupo: ${e.message}`).catch(() => {});
  process.exit(1);
});
