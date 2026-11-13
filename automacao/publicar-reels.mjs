#!/usr/bin/env node
// Posta no Instagram um Reels aprovado no Telegram (tabela reels_pendentes) e, junto, como Short no YouTube.
//   node publicar-reels.mjs --id 12                 (Instagram + YouTube)
//   node publicar-reels.mjs --id 12 --so-youtube    (botão "▶️ Postar no YouTube": só o YouTube)
// Um marcador em storage (capas/yt/reels-<id>.txt) impede postar o mesmo Reels duas vezes no YouTube.
import { createClient } from "@supabase/supabase-js";
import { postReelUrl } from "./lib/social.mjs";
import { hasTelegram, sendText } from "./lib/telegram.mjs";
import { hasYouTube, postShort, textosYouTube, regrasYouTube, registrarYouTube, lerMetaYouTube } from "./lib/youtube.mjs";
import { BRAND } from "../lib/brand.mjs";
import { hasThreads, postThreadsVideo, textoThreads } from "./lib/threads.mjs";

// o mesmo vídeo no Threads, com o link do produto clicável (falha no Threads não atrapalha o resto)
async function threads(r) {
  if (!(await hasThreads())) return;
  try {
    const link = await postThreadsVideo(r.video_url, textoThreads(r.caption, r.offer_id ? `${BRAND.site}/r/${r.offer_id}` : BRAND.site));
    if (hasTelegram()) await sendText(`🧵 Postado no Threads:\n${link}`).catch(() => {});
  } catch (e) {
    console.error("Threads:", e.message);
    if (hasTelegram()) await sendText(`⚠️ Threads: ${e.message.slice(0, 300)}`).catch(() => {});
  }
}

const VITRINE = BRAND.site;

// o mesmo vídeo também vira Short no YouTube (falha no YouTube não atrapalha o Instagram).
// Regras do canal: só vídeo com movimento, produto nunca repetido, até 3 por dia com intervalo (ver lib/youtube.mjs).
async function youtube(r) {
  if (!hasYouTube()) {
    if (soYouTube && hasTelegram()) await sendText("⚠️ YouTube não configurado: faltam os segredos YT_CLIENT_ID, YT_CLIENT_SECRET e YT_REFRESH_TOKEN no GitHub.").catch(() => {});
    return;
  }
  const { data: feito } = await sb.from("bot_config").select("value").eq("key", `yt_reels_${r.id}`).maybeSingle();
  if (feito?.value) { console.log("Já está no YouTube:", feito.value); if (soYouTube && hasTelegram()) await sendText(`▶️ Esse já está no YouTube:\n${feito.value}`).catch(() => {}); return; }
  const meta = (await lerMetaYouTube(sb, r.id)) || {};
  const regra = await regrasYouTube(sb, { offerId: meta.top ? null : r.offer_id, temVideo: Boolean(meta.temVideo), manual: soYouTube });
  if (!regra.ok) {
    console.log("YouTube pulado:", regra.motivo);
    if (hasTelegram()) await sendText(`⏭️ Não fui pro YouTube: ${regra.motivo}.${soYouTube ? "" : " (Use ▶️ Postar no YouTube se quiser mesmo assim.)"}`).catch(() => {});
    return;
  }
  try {
    const t = textosYouTube(r.caption, { link: r.offer_id ? `${VITRINE}/r/${r.offer_id}` : VITRINE, titulo: meta.titulo || "" });
    const { url, privacy } = await postShort(meta.videoUrl || r.video_url, t);
    await sb.from("bot_config").upsert({ key: `yt_reels_${r.id}`, value: url, updated_at: new Date().toISOString() });
    await registrarYouTube(sb, { offerId: meta.top ? null : r.offer_id, url });
    if (hasTelegram()) await sendText(`▶️ Short no YouTube${privacy !== "public" ? ` (${privacy})` : ""}:\n${url}`).catch(() => {});
  } catch (e) {
    console.error("YouTube:", e.message);
    if (hasTelegram()) await sendText(`⚠️ YouTube: ${e.message.slice(0, 300)}`).catch(() => {});
  }
}

const i = process.argv.indexOf("--id");
const id = Number(i > 0 ? process.argv[i + 1] : process.env.REELS_ID);
const soYouTube = process.argv.includes("--so-youtube");
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function main() {
  if (!id) throw new Error("Informe --id");
  const { data: r, error } = await sb.from("reels_pendentes").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  if (soYouTube) { await youtube(r); return; }
  if (r.status === "postado") { console.log("Já postado:", r.ig_url); return; }
  try {
    const url = await postReelUrl(r.video_url, r.caption);
    await sb.from("reels_pendentes").update({ status: "postado", ig_url: url }).eq("id", id);
    console.log("Postado:", url);
    if (hasTelegram()) await sendText(`✅ Reels #${r.offer_id} postado no Instagram:\n${url}`).catch(() => {});
    await youtube(r);
    await threads(r);
  } catch (e) {
    await sb.from("reels_pendentes").update({ status: "erro", erro: e.message }).eq("id", id);
    if (hasTelegram()) await sendText(`❌ Não consegui postar o Reels #${r.offer_id}: ${e.message}`).catch(() => {});
    throw e;
  }
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
