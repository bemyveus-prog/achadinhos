import { readFile } from "fs/promises";
import path from "path";
import { BRAND } from "../../lib/brand.mjs";

// Manda os produtos novos da vitrine para o Telegram (para gravar os vídeos).
// Precisa de TELEGRAM_BOT_TOKEN (do @BotFather) e TELEGRAM_CHAT_ID.
// Sem TELEGRAM_CHAT_ID, descobre sozinho pela última mensagem mandada ao bot (/start).

const env = (k, d = "") => (process.env[k] ?? "").trim() || d;
const API = () => `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}`;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const brl = (v) => "R$ " + Number(v).toFixed(2).replace(".", ",");
const pct = (v) => (v * 100).toFixed(1).replace(".", ",").replace(",0", "") + "%";

export const hasTelegram = () => Boolean(env("TELEGRAM_BOT_TOKEN"));

async function call(method, body, timeoutMs = 60000) {
  const form = body instanceof FormData;
  const res = await fetch(`${API()}/${method}`, {
    method: "POST",
    ...(form ? {} : { headers: { "Content-Type": "application/json" } }),
    body: form ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description || res.status}`);
  return json.result;
}

let chatId = null;
export async function getChatId() {
  if (chatId) return chatId;
  chatId = env("TELEGRAM_CHAT_ID");
  if (chatId) return chatId;
  const me = await call("getMe", {});
  const hook = await call("getWebhookInfo", {});
  if (hook.url) throw new Error(`O bot @${me.username} está ligado a outro sistema (webhook). Use um bot só para isto ou crie o secret TELEGRAM_CHAT_ID`);
  const ups = await call("getUpdates", { limit: 100 });
  const chatOf = (u) => (u.message || u.edited_message || u.channel_post || u.my_chat_member || u.callback_query?.message)?.chat?.id;
  const last = [...ups].reverse().find(chatOf);
  chatId = last ? chatOf(last) : null;
  if (!chatId) throw new Error(`O token é do bot @${me.username}, mas ele não recebeu mensagem nenhuma. Abra t.me/${me.username}, mande "oi" e rode de novo`);
  return chatId;
}

// o = { id, title, price, original_price, image_url, link, category }
// p (opcional, dados da API) = { commission, sellerCommission, sales, rating, productLink }
export function caption(o, p = {}, origem = "") {
  const vitrine = BRAND.site;
  const linhas = [
    `🛍️ <b>#${o.id} · ${esc(o.title).slice(0, 180)}</b>`,
    o.price ? `💰 ${brl(o.price)}` : null,
    p.commission ? `💸 Comissão total ${pct(p.commission)}${o.price ? ` ≈ ${brl(o.price * p.commission)} por venda` : ""}${p.sellerCommission ? `\n     (extra da loja ${pct(p.sellerCommission)} + Shopee ${pct(Math.max(p.commission - p.sellerCommission, 0))})` : ""}` : null,
    p.sales != null || p.rating ? `⭐ ${p.rating || "-"} · ${p.sales ?? "?"} vendas recentes` : null,
    o.category ? `📂 ${esc(o.category)}${origem ? ` · ${esc(origem)}` : ""}` : origem ? `📂 ${esc(origem)}` : null,
    "",
    `🎬 No vídeo: <b>"procura o #${o.id} no link da bio"</b>`,
    `🔎 Vitrine: ${vitrine}/?p=${o.id}`,
    p.productLink ? `📷 Fotos/vídeos do produto: ${p.productLink}` : null,
    o.link ? `🔗 Link de afiliado: ${o.link}` : null,
  ];
  return linhas.filter((l) => l !== null).join("\n").slice(0, 1024);
}

export async function sendOffer(o, p = {}, origem = "") {
  const chat_id = await getChatId();
  const text = caption(o, p, origem);
  if (o.image_url) {
    try { return await call("sendPhoto", { chat_id, photo: o.image_url, caption: text, parse_mode: "HTML" }); }
    catch { /* foto recusada: manda só o texto */ }
  }
  return call("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true });
}

export async function sendText(text, { html = false } = {}) {
  return call("sendMessage", { chat_id: await getChatId(), text: String(text).slice(0, 4000), disable_web_page_preview: true, ...(html ? { parse_mode: "HTML" } : {}) });
}

// Achado do dia: manda as imagens do carrossel como álbum (na ordem) e depois a legenda pronta pra copiar
export async function sendPreview(files, legenda, summary) {
  const chat_id = await getChatId();
  const form = new FormData();
  form.append("chat_id", String(chat_id));
  const media = [];
  for (const [i, f] of files.entries()) {
    const name = `foto${i}`;
    form.append(name, new Blob([await readFile(f)], { type: "image/jpeg" }), path.basename(f));
    media.push({ type: "photo", media: `attach://${name}`, ...(i === 0 ? { caption: summary.slice(0, 1000) } : {}) });
  }
  form.append("media", JSON.stringify(media));
  await call("sendMediaGroup", form);
  await sendText(legenda);
}

// Não deixa um erro do Telegram derrubar a automação
export async function notify(o, p, origem, log = console.log) {
  if (!hasTelegram()) return;
  try { await sendOffer(o, p, origem); }
  catch (e) { log(`  Telegram: ${e.message}`); }
}

// Manda um vídeo (ex.: Reels) com legenda
export async function sendVideo(file, caption = "", markup = null) {
  const form = new FormData();
  form.append("chat_id", String(await getChatId()));
  form.append("video", new Blob([await readFile(file)], { type: "video/mp4" }), path.basename(file));
  form.append("supports_streaming", "true");
  if (caption) form.append("caption", caption.slice(0, 1024));
  if (markup) form.append("reply_markup", JSON.stringify(markup));
  // vídeo demora mais para subir: até 5 min, e tenta mais uma vez se cair
  try { return await call("sendVideo", form, 300000); }
  catch (e) { if (!/timeout|aborted|fetch failed/i.test(e.message)) throw e; return call("sendVideo", form, 300000); }
}
