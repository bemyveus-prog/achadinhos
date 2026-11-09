// CJdropshipping: busca produtos com vídeo e os vídeos de cada produto (para usar nos Reels).
// Precisa de CJ_API_KEY (painel CJ → Authorization → API). O token de acesso vale 180 dias.
import { writeFile } from "fs/promises";

const BASE = "https://developers.cjdropshipping.com/api2.0/v1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token = null;

export const hasCJ = () => Boolean((process.env.CJ_API_KEY || "").trim());

async function cj(method, path, { body, query } = {}) {
  if (!token) token = await getToken();
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, v);
  await sleep(1100); // a CJ limita as chamadas por segundo
  const r = await fetch(url, {
    method,
    headers: { "CJ-Access-Token": token, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  const ok = j.result === true || j.success === true || String(j.code) === "200" || /^success$/i.test(j.message || "");
  if (!ok) throw new Error(`CJ ${path}: ${j.message || r.status}`);
  if (process.env.CJ_DEBUG && !globalThis.__cjShown?.[path]) { (globalThis.__cjShown ||= {})[path] = 1; console.log(`[CJ ${path}]`, JSON.stringify(j).slice(0, 700)); }
  return j.data;
}

async function getToken() {
  const r = await fetch(`${BASE}/authentication/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: process.env.CJ_API_KEY.trim() }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.data?.accessToken) throw new Error(`CJ token: ${j.message || r.status} (confira o secret CJ_API_KEY)`);
  return j.data.accessToken;
}

// produtos com vídeo para uma busca em inglês
export async function searchVideoProducts(keyWord, size = 10) {
  const data = await cj("GET", "/product/listV2", { query: { keyWord, page: 1, size, productType: 10, features: "enable_video" } });
  return (data?.content || []).flatMap((c) => c.productList || []).map((p) => ({
    id: p.id, name: p.nameEn, image: p.bigImage, price: p.sellPrice, videos: (p.videoList || []).length,
  }));
}

export async function productVideos(productId) {
  const data = await cj("POST", "/product/queryVideosByProductId", { body: { productId } });
  return (Array.isArray(data) ? data : []).map((v) => ({
    url: v.videoUrl, duration: Number(v.duration) || 0, w: v.width, h: v.height,
    plays: v.playCount || 0, likes: v.likeNum || 0, downloads: v.downloadCount || 0,
    free: String(v.isFree) === "1", copyright: v.copyright, priceTemp: v.notCopyrightPrice, pricePerm: v.copyrightPrice,
  }));
}

// a CJ pede o Referer do site deles para liberar o download
export async function downloadVideo(url, file) {
  const r = await fetch(url, { headers: { Referer: "https://developers.cjdropshipping.com/" }, signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`download ${r.status}`);
  await writeFile(file, Buffer.from(await r.arrayBuffer()));
  return file;
}
