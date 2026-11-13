#!/usr/bin/env node
// Lê a transcrição (transcricao.txt) e escreve uma narração NOVA, com as nossas palavras,
// inspirada na ideia do vídeo (não copia frases). Manda as duas no Telegram e guarda a nova
// para usar com "/reels NÚMERO roteiro".
import { readFile } from "fs/promises";
import { createClient } from "@supabase/supabase-js";
import { claude } from "./lib/ia.mjs";

const env = (k, d = "") => (process.env[k] ?? "").trim() || d;
const TG = (m) => `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}/${m}`;
const chat = env("TELEGRAM_CHAT_ID").split(/[\s,;]+/)[0];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const tg = (m, body) => fetch(TG(m), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chat, ...body }) }).then((r) => r.json());

const original = (await readFile(process.argv[2] || "transcricao.txt", "utf8").catch(() => "")).replace(/\s+/g, " ").trim();
if (original.length < 15) {
  await tg("sendMessage", { text: "⚠️ Não encontrei fala nesse vídeo (só música ou sem voz). Mande um vídeo em que alguém fala sobre o produto." });
  process.exit(0);
}
const contexto = env("CONTEXTO");
const max = Math.min(420, Math.max(160, Math.round(original.length * 1.05)));
const prompt = `Este é o texto falado num vídeo curto de produto (transcrição automática, pode ter erros):
"""${original.slice(0, 2500)}"""
${contexto ? `Informação extra sobre o produto: """${contexto}"""\n` : ""}
Escreva uma NARRAÇÃO NOVA para um vídeo nosso sobre o mesmo produto, em português do Brasil:
- Aproveite a IDEIA e a estrutura que funciona (gancho forte, a dor ou o desejo, o produto como solução, o ganho no dia a dia), mas com palavras e frases totalmente nossas. Não copie nenhuma frase do original.
- Tom natural, de quem indica um achado pra uma amiga. Ritmo rápido.
- No máximo ${max} caracteres.
- Use só características que aparecem no texto acima; não invente medidas, materiais ou promessas de saúde/resultado.
- Não cite o nome de quem fez o vídeo original, nem fale de link, bio, cupom, preço, seguir ou comentar (o final do vídeo é nosso). Sem emojis, hashtags ou travessão.
Responda só com a narração.`;
let nova = "";
try {
  nova = (await claude({ content: prompt, max: 500 })).replace(/\s+/g, " ").replace(/[—–]/g, ",").replace(/^["']|["']$/g, "").trim();
} catch (e) {
  await tg("sendMessage", { text: `⚠️ A IA não respondeu (${e.message}). Transcrição:\n\n${original.slice(0, 3500)}` });
  process.exit(1);
}
const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
await sb.from("bot_config").upsert({ key: "ultimo_roteiro", value: nova, updated_at: new Date().toISOString() });

await tg("sendMessage", { parse_mode: "HTML", text: `🎧 <b>O que foi falado no vídeo</b>\n<i>${esc(original.slice(0, 1500))}</i>` });
const r = await tg("sendMessage", {
  parse_mode: "HTML",
  text: `✍️ <b>Narração nova (nossas palavras)</b> · ${nova.length} letras\n\n${esc(nova)}\n\nPara gerar o vídeo com ela: <b>/reels NÚMERO roteiro</b> (ou /shopee, /link; com vídeo, coloque isso na legenda). Também dá pra copiar, ajustar e usar com <b>texto:</b>`,
  ...(nova.length <= 256 ? { reply_markup: { inline_keyboard: [[{ text: "📋 Copiar narração", copy_text: { text: nova } }]] } } : {}),
});
console.log("ORIGINAL:", original);
console.log("NOVA:", nova, r.ok ? "(enviada)" : JSON.stringify(r).slice(0, 200));
