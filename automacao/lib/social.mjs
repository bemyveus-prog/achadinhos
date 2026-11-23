import { readFile } from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Postagem no Instagram (carrossel) e na Página do Facebook (post com várias fotos)
// pela API oficial da Meta (Graph API).

const GRAPH = () => `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v24.0"}`;
const BUCKET = "carrosseis";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function hasMeta() {
  return Boolean(process.env.META_PAGE_TOKEN);
}

async function graph(method, pathname, params = {}, token = process.env.META_PAGE_TOKEN) {
  const body = new URLSearchParams({ ...params, access_token: token });
  const url = `${GRAPH()}/${pathname}` + (method === "GET" ? `?${body}` : "");
  const r = await fetch(url, {
    method,
    body: method === "GET" ? undefined : body,
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json();
  if (j.error) throw new Error(`Meta: ${j.error.message}${j.error.error_user_msg ? ` (${j.error.error_user_msg})` : ""}`);
  return j;
}

// O Instagram só aceita imagem por URL pública: sobe no Storage do Supabase (bucket público)
export async function uploadPublic(files, folder, contentType = "image/jpeg") {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error: bErr } = await sb.storage.createBucket(BUCKET, { public: true });
  if (bErr && !/already exists|duplicate/i.test(bErr.message)) throw new Error(`Supabase Storage: ${bErr.message}`);
  const urls = [];
  for (const f of files) {
    const key = `${folder}/${path.basename(f)}`;
    const { error } = await sb.storage.from(BUCKET).upload(key, await readFile(f), { contentType, upsert: true });
    if (error) throw new Error(`Supabase Storage: ${error.message}`);
    urls.push(sb.storage.from(BUCKET).getPublicUrl(key).data.publicUrl);
  }
  return urls;
}

export async function postInstagram(urls, caption) {
  const ig = process.env.META_IG_USER_ID;
  if (!ig) throw new Error("Falta META_IG_USER_ID");
  // 1. um "container" por imagem
  const children = [];
  for (const image_url of urls) {
    const c = await graph("POST", `${ig}/media`, { image_url, is_carousel_item: "true" });
    children.push(c.id);
  }
  // 2. o container do carrossel
  const carousel = await graph("POST", `${ig}/media`, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption: caption.slice(0, 2200),
  });
  // 3. espera o Instagram processar
  for (let i = 0; i < 20; i++) {
    const s = await graph("GET", carousel.id, { fields: "status_code" });
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram recusou o carrossel (${s.status_code})`);
    await sleep(3000);
  }
  // 4. publica
  const pub = await graph("POST", `${ig}/media_publish`, { creation_id: carousel.id });
  const info = await graph("GET", pub.id, { fields: "permalink" }).catch(() => ({}));
  return info.permalink || pub.id;
}

export async function postFacebook(urls, message) {
  const page = process.env.META_PAGE_ID;
  if (!page) throw new Error("Falta META_PAGE_ID");
  // fotos sobem sem publicar e depois entram juntas num post só
  const ids = [];
  for (const url of urls) {
    const ph = await graph("POST", `${page}/photos`, { url, published: "false" });
    ids.push(ph.id);
  }
  const params = { message };
  ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
  const post = await graph("POST", `${page}/feed`, params);
  return `https://www.facebook.com/${post.id}`;
}

// Posta onde estiver pedido em POSTAR (ex: "instagram,facebook"). Um erro não impede o outro.
export async function publishSocial(files, { folder, caption, link, linkThreads = null, targets }) {
  const urls = await uploadPublic(files, folder);
  const results = {};
  const errors = [];
  if (targets.includes("instagram")) {
    try { results.instagram = await postInstagram(urls, caption); }
    catch (e) { errors.push(`Instagram: ${e.message}`); }
    // junto com o Instagram, o mesmo carrossel no Threads (lá o link é clicável). Falha no Threads só avisa.
    try {
      const { hasThreads, postThreadsCarrossel, textoThreads } = await import("./threads.mjs");
      if (await hasThreads()) results.threads = await postThreadsCarrossel(urls, textoThreads(caption, linkThreads || link));
    } catch (e) { results.threads = `⚠️ não postou (${e.message.slice(0, 150)})`; }
  }
  if (targets.includes("facebook")) {
    // no Facebook link é clicável, então vai o link de afiliado direto
    const fbText = link ? caption.replace(/\n+(#\S+\s*)+$/, "") + `\n\n🛒 Compre aqui: ${link}` : caption;
    try { results.facebook = await postFacebook(urls, fbText); }
    catch (e) { errors.push(`Facebook: ${e.message}`); }
  }
  return { results, errors };
}

// Reels: o vídeo sobe no Storage e o Instagram baixa pela URL. O processamento de vídeo
// demora mais que o de foto (até alguns minutos), por isso a espera é maior.
export async function postReel(videoFile, caption, folder) {
  const [video_url] = await uploadPublic([videoFile], folder, "video/mp4");
  return postReelUrl(video_url, caption);
}

// Reels na Página do Facebook (API: video_reels, 3 fases). O vídeo vem de URL pública (Storage).
export async function postFacebookReel(video_url, description, { page = process.env.META_PAGE_ID, token = process.env.META_PAGE_TOKEN } = {}) {
  if (!page) throw new Error("Falta META_PAGE_ID");
  const st = await graph("POST", `${page}/video_reels`, { upload_phase: "start" }, token);
  const up = await fetch(st.upload_url, { method: "POST", headers: { Authorization: `OAuth ${token}`, file_url: video_url }, signal: AbortSignal.timeout(120000) });
  const uj = await up.json().catch(() => ({}));
  if (!uj.success) throw new Error(`Facebook recusou o envio do Reels: ${JSON.stringify(uj).slice(0, 200)}`);
  await graph("POST", `${page}/video_reels`, { upload_phase: "finish", video_id: st.video_id, video_state: "PUBLISHED", description: description.slice(0, 2000) }, token);
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const s = await graph("GET", st.video_id, { fields: "status,permalink_url" }, token);
    const v = s.status?.video_status;
    if (v === "ready" || v === "published") return s.permalink_url ? `https://www.facebook.com${s.permalink_url}` : `https://www.facebook.com/reel/${st.video_id}`;
    if (v === "error") throw new Error("O Facebook recusou o Reels");
  }
  return `https://www.facebook.com/reel/${st.video_id}`;
}

// Reels a partir de um vídeo que já está no Storage público (usado na aprovação pelo Telegram)
export async function postReelUrl(video_url, caption) {
  const ig = process.env.META_IG_USER_ID;
  if (!ig) throw new Error("Falta META_IG_USER_ID");
  const c = await graph("POST", `${ig}/media`, {
    media_type: "REELS",
    video_url,
    caption: caption.slice(0, 2200),
    share_to_feed: "true",
  });
  let ok = false;
  for (let i = 0; i < 60; i++) { // até ~5 min
    await sleep(5000);
    const s = await graph("GET", c.id, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") { ok = true; break; }
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Instagram recusou o Reels (${s.status || s.status_code})`);
  }
  if (!ok) throw new Error("O Instagram demorou demais para processar o Reels");
  const pub = await graph("POST", `${ig}/media_publish`, { creation_id: c.id });
  const info = await graph("GET", pub.id, { fields: "permalink" }).catch(() => ({}));
  return info.permalink || pub.id;
}

// Páginas do Facebook que recebem Reels: a principal (META_PAGE_ID/TOKEN) + a 2ª, se existir (META_PAGE_ID_2/TOKEN_2)
export function paginasFacebook() {
  const l = [];
  if (process.env.META_PAGE_ID && process.env.META_PAGE_TOKEN) l.push({ page: process.env.META_PAGE_ID.trim(), token: process.env.META_PAGE_TOKEN.trim(), nome: "principal" });
  // páginas individuais: META_PAGE_ID_2/META_PAGE_TOKEN_2 até _8 (nome opcional: META_PAGE_NOME_N)
  for (let n = 2; n <= 8; n++) {
    const id = process.env[`META_PAGE_ID_${n}`], tk = process.env[`META_PAGE_TOKEN_${n}`];
    if (id && tk) l.push({ page: id.trim(), token: tk.trim(), nome: (process.env[`META_PAGE_NOME_${n}`] || "").trim() || `página ${n}` });
  }
  // demais páginas: secret META_PAGES_JSON = [{"nome":"Magali","id":"123","token":"EAA..."}, ...]
  try {
    let txt = (process.env.META_PAGES_JSON || "").trim().replace(/,\s*$/, "");
    if (txt && !txt.startsWith("[")) txt = `[${txt}]`; // aceita linhas soltas, sem os colchetes
    for (const x of JSON.parse(txt || "[]")) if (x.id && x.token) l.push({ page: String(x.id).trim(), token: String(x.token).trim(), nome: x.nome || String(x.id) });
  } catch (e) { console.error("META_PAGES_JSON inválido:", e.message); }
  return l;
}
