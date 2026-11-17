#!/usr/bin/env node
// Reels "Top N" pedido pelo bot (/top). Roteiro em REELS_TOP (JSON):
//   { "title": "5 coisas que parecem bobas mas facilitam a vida", "items": [{ "id": 136, "sku": "CJ...", "fala": "..." }], "postar": false }
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { renderTop } from "./lib/reelstop.mjs";
import { gerarNarracao } from "./lib/narracao.mjs";
import { claude } from "./lib/ia.mjs";
import { shortName } from "./lib/textos.mjs";
import { hasTelegram, sendText, sendVideo } from "./lib/telegram.mjs";
import { hasMeta, postReel, uploadPublic } from "./lib/social.mjs";
import { hasCJ, productBySku, productVideos, bestFreeVideo, downloadVideo } from "./lib/cj.mjs";
import { BRAND } from "../lib/brand.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = (k, d) => (process.env[k] ?? "").trim() || d;
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Top automático: a IA escolhe uma dor do dia a dia, um título-gancho e 5 produtos que resolvem (lib/toptema.mjs)
async function autoRoteiro() {
  const { escolherTopShopee } = await import("./lib/toptema.mjs");
  const r = await escolherTopShopee(sb, { log, subId: "topvideo" });
  return { title: r.title, items: r.items.map((i) => ({ id: i.id, fala: i.fala })), postar: false };
}

async function main() {
  const r = process.argv.includes("--auto") ? await autoRoteiro() : JSON.parse(process.env.REELS_TOP || "{}");
  if (!r.title || !r.items?.length) throw new Error("Roteiro vazio (REELS_TOP)");
  const ids = r.items.map((i) => Number(i.id));
  const { data: offers, error } = await sb.from("offers").select("id,title,image_url,price").in("id", ids);
  if (error) throw new Error(error.message);
  const byId = new Map((offers || []).map((o) => [o.id, o]));
  const outDir = path.join(HERE, "saida", "top", `${Date.now()}`);
  await mkdir(outDir, { recursive: true });

  const items = [];
  for (const it of r.items) {
    const o = byId.get(Number(it.id));
    if (!o?.image_url) { log(`#${it.id} não está na vitrine (ou sem foto); pulei`); continue; }
    let clipFile = null;
    if (it.sku && hasCJ()) {
      try {
        const prod = await productBySku(it.sku);
        const best = prod ? bestFreeVideo(await productVideos(prod.pid)) : null;
        if (best) { clipFile = await downloadVideo(best.url, path.join(outDir, `cj-${it.id}.mp4`)); log(`#${it.id}: vídeo da CJ (${best.duration.toFixed(0)} s)`); }
        else log(`#${it.id}: SKU ${it.sku} sem vídeo grátis; vai com a foto`);
      } catch (e) { log(`#${it.id}: CJ ${e.message}; vai com a foto`); }
    }
    let fala = (it.fala || "").slice(0, 300);
    if (!fala && process.env.ANTHROPIC_API_KEY) fala = await gerarNarracao({ name: o.title, price: Number(o.price) || 0 }, { max: 140, log });
    items.push({ id: o.id, name: shortName(o.title, 5), imageUrl: o.image_url, price: Number(o.price) || 0, fala, clipFile });
  }
  if (!items.length) throw new Error("Nenhum produto válido no roteiro");

  // cupom ativo? avatar do perfil?
  const agora = new Date().toISOString();
  const { count } = await sb.from("offers").select("id", { count: "exact", head: true }).eq("active", true).eq("kind", "cupom").or(`expires_at.is.null,expires_at.gt.${agora}`);
  let avatar = null;
  try {
    const { data: av } = await sb.storage.from("capas").list("avatar", { limit: 20, sortBy: { column: "name", order: "desc" } });
    const last = (av || []).find((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    if (last) {
      const { data } = await sb.storage.from("capas").download(`avatar/${last.name}`);
      avatar = path.join(outDir, "avatar" + path.extname(last.name));
      await writeFile(avatar, Buffer.from(await data.arrayBuffer()));
    }
  } catch {}

  const { file, seconds } = await renderTop({ title: r.title, items, outDir, handle: BRAND.handle, avatar, cupom: (count || 0) > 0, showPrice: (process.env.VIDEO_PRECO || "").trim() === "sim", log });
  log(`Vídeo pronto: ${seconds.toFixed(1)} s`);

  const legenda = [
    `${r.title.replace(/\*/g, "")} 👀`,
    "",
    ...items.map((it, k) => `${k + 1}. ${it.name} → #${it.id}`),
    "",
    "Qual você levaria? Comenta o número 👇",
    "",
    "🔖 Salva pra não perder e manda pra quem precisa!",
    `🔎 Link na bio! Procura os números na busca da vitrine${count ? " (e tem cupom da Shopee lá 🎟️)" : ""}.`,
    "",
    "#achadinhos #achadinhosshopee #shopee #achadosdashopee #comprinhas",
  ].join("\n");
  await writeFile(path.join(outDir, "legenda.txt"), legenda + "\n");

  const postarJa = Boolean(r.postar);
  if (hasTelegram()) {
    let markup = null;
    if (!postarJa && hasMeta()) {
      try {
        const [video_url] = await uploadPublic([file], `top-${Date.now()}`, "video/mp4");
        const { data, error: e } = await sb.from("reels_pendentes").insert({ offer_id: items[0].id, video_url, caption: legenda }).select("id").single();
        if (!e && data) { const { salvarMetaYouTube } = await import("./lib/youtube.mjs"); await salvarMetaYouTube(sb, data.id, { temVideo: items.some((it) => it.clipFile), titulo: r.title, top: true }).catch(() => {}); }
        if (e) throw new Error(e.message);
        markup = { inline_keyboard: [[{ text: "📤 Postar no Instagram", callback_data: `pub:${data.id}` }], [{ text: "▶️ Postar no YouTube", callback_data: `yt:${data.id}` }], [{ text: "🗑️ Descartar", callback_data: `nopub:${data.id}` }]] };
      } catch (e) { log(`  aprovação: ${e.message}`); }
    }
    await sendVideo(file, `🎬 Top ${items.length} (${seconds.toFixed(0)} s)${postarJa ? " · postando no Instagram…" : ""}\n\nLegenda:\n\n${legenda}`.slice(0, 1024), markup);
    log("Enviado no Telegram.");
  }
  if (postarJa) {
    if (!hasMeta()) throw new Error("Falta META_PAGE_TOKEN para postar.");
    log(`Postado: ${await postReel(file, legenda, `top-${Date.now()}`)}`);
    const { hasYouTube, postShort, textosYouTube } = await import("./lib/youtube.mjs");
    if (hasYouTube()) {
      try {
        // Top só vai pro YouTube quando tem vídeo real de algum produto (só fotos paradas o canal não entrega)
        const { regrasYouTube, registrarYouTube } = await import("./lib/youtube.mjs");
        const regra = await regrasYouTube(sb, { temVideo: items.some((it) => it.clipFile) });
        if (!regra.ok) log(`  YouTube pulado: ${regra.motivo}`);
        else { const { url: yt } = await postShort(file, textosYouTube(legenda, { link: BRAND.site }), log); await registrarYouTube(sb, { url: yt }); if (hasTelegram()) await sendText(`▶️ Short no YouTube: ${yt}`).catch(() => {}); }
      }
      catch (e) { log(`  YouTube: ${e.message}`); }
    }
  }
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
