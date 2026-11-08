#!/usr/bin/env node
// Manda para o Telegram os últimos produtos da vitrine (teste ou reenvio).
//   node telegram.mjs            os 3 mais recentes
//   node telegram.mjs --ultimas 10
import { createClient } from "@supabase/supabase-js";
import { getChatId, hasTelegram, sendOffer, sendText } from "./lib/telegram.mjs";

const args = process.argv.slice(2);
const i = args.indexOf("--ultimas");
const n = Math.min(Number(i >= 0 ? args[i + 1] : process.env.ULTIMAS || 3) || 3, 30);
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);

async function main() {
  if (!hasTelegram()) throw new Error("Configure o secret TELEGRAM_BOT_TOKEN");
  const chat = await getChatId();
  log(`Chat do Telegram: ${chat}${process.env.TELEGRAM_CHAT_ID ? "" : "  (dica: salve esse número no secret TELEGRAM_CHAT_ID)"}`);
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const now = new Date().toISOString();
  const { data, error } = await sb.from("offers").select("id,title,price,original_price,image_url,link,category,kind")
    .eq("active", true).eq("kind", "produto").or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("id", { ascending: false }).limit(n);
  if (error) throw new Error(`Supabase: ${error.message}`);
  await sendText(`📦 <b>${data.length} produtos mais recentes da vitrine</b>`, { html: true });
  for (const o of data.reverse()) { await sendOffer(o); log(`Enviado #${o.id}`); }
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
