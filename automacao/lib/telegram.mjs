import { readFile } from "fs/promises";
import path from "path";

export function hasTelegram() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

async function call(method, form) {
  const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result;
}

// Manda as imagens como álbum (na ordem) e depois a legenda pronta pra copiar
export async function sendPreview(files, caption, summary) {
  const form = new FormData();
  form.append("chat_id", process.env.TELEGRAM_CHAT_ID);
  const media = [];
  for (const [i, f] of files.entries()) {
    const name = `foto${i}`;
    form.append(name, new Blob([await readFile(f)], { type: "image/jpeg" }), path.basename(f));
    media.push({ type: "photo", media: `attach://${name}`, ...(i === 0 ? { caption: summary.slice(0, 1000) } : {}) });
  }
  form.append("media", JSON.stringify(media));
  await call("sendMediaGroup", form);

  const text = new FormData();
  text.append("chat_id", process.env.TELEGRAM_CHAT_ID);
  text.append("text", caption.slice(0, 4000));
  await call("sendMessage", text);
}

export async function sendText(text) {
  const form = new FormData();
  form.append("chat_id", process.env.TELEGRAM_CHAT_ID);
  form.append("text", text.slice(0, 4000));
  await call("sendMessage", form);
}
