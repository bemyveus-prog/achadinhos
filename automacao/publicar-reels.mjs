#!/usr/bin/env node
// Posta no Instagram um Reels aprovado no Telegram (tabela reels_pendentes).
//   node publicar-reels.mjs --id 12
import { createClient } from "@supabase/supabase-js";
import { postReelUrl } from "./lib/social.mjs";
import { hasTelegram, sendText } from "./lib/telegram.mjs";

const i = process.argv.indexOf("--id");
const id = Number(i > 0 ? process.argv[i + 1] : process.env.REELS_ID);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  if (!id) throw new Error("Informe --id");
  const { data: r, error } = await sb.from("reels_pendentes").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  if (r.status === "postado") { console.log("Já postado:", r.ig_url); return; }
  try {
    const url = await postReelUrl(r.video_url, r.caption);
    await sb.from("reels_pendentes").update({ status: "postado", ig_url: url }).eq("id", id);
    console.log("Postado:", url);
    if (hasTelegram()) await sendText(`✅ Reels #${r.offer_id} postado no Instagram:\n${url}`).catch(() => {});
  } catch (e) {
    await sb.from("reels_pendentes").update({ status: "erro", erro: e.message }).eq("id", id);
    if (hasTelegram()) await sendText(`❌ Não consegui postar o Reels #${r.offer_id}: ${e.message}`).catch(() => {});
    throw e;
  }
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
