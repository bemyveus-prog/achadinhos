// Postagem de Shorts no YouTube (YouTube Data API v3, upload resumível).
// Secrets: YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN (do canal, escopo youtube.upload).
// YOUTUBE_PRIVACIDADE: public (padrão) | unlisted | private
import { readFile } from "fs/promises";

const env = (k, d = "") => (process.env[k] ?? "").trim() || d;
export const hasYouTube = () => Boolean(env("YT_CLIENT_ID") && env("YT_CLIENT_SECRET") && env("YT_REFRESH_TOKEN")) && env("YOUTUBE_POSTAR", "sim") !== "nao";

async function accessToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("YT_CLIENT_ID"), client_secret: env("YT_CLIENT_SECRET"), refresh_token: env("YT_REFRESH_TOKEN"), grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`token do YouTube: ${j.error_description || j.error || r.status}`);
  return j.access_token;
}

// título curto (máx. 100) a partir da legenda; descrição com o link direto do produto
export function textosYouTube(legenda, { link = "" } = {}) {
  const linhas = String(legenda || "").split("\n").map((l) => l.trim()).filter(Boolean);
  let titulo = (linhas[0] || "Achadinho do dia").replace(/#\S+/g, "").replace(/\s+/g, " ").trim();
  if (titulo.length > 90) titulo = titulo.slice(0, 88).replace(/\s+\S*$/, "") + "…";
  titulo = `${titulo} #shorts`;
  const tags = [...new Set((String(legenda).match(/#[\p{L}\p{N}_]+/gu) || []).map((t) => t.slice(1)).filter((t) => !/^\d+$/.test(t)))].slice(0, 15);
  const corpo = linhas.filter((l) => !/link na bio|procura o #|procura os números/i.test(l)).join("\n");
  const descricao = [link ? `🛒 Link do produto: ${link}` : "", "", corpo].join("\n").trim().slice(0, 4900);
  return { titulo, descricao, tags };
}

export async function postShort(fileOrUrl, { titulo, descricao, tags = [] }, log = console.log) {
  const token = await accessToken();
  const video = /^https?:\/\//.test(fileOrUrl) ? Buffer.from(await (await fetch(fileOrUrl)).arrayBuffer()) : await readFile(fileOrUrl);
  const meta = {
    snippet: { title: titulo.slice(0, 100), description: descricao, tags, categoryId: "26", defaultLanguage: "pt-BR", defaultAudioLanguage: "pt-BR" },
    status: { privacyStatus: env("YOUTUBE_PRIVACIDADE", "public"), selfDeclaredMadeForKids: false },
  };
  const ini = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(video.length) },
    body: JSON.stringify(meta),
  });
  const loc = ini.headers.get("location");
  if (!loc) throw new Error(`YouTube recusou o envio (${ini.status}): ${(await ini.text()).slice(0, 300)}`);
  const up = await fetch(loc, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(video.length) }, body: video });
  const j = await up.json().catch(() => ({}));
  if (!j.id) throw new Error(`upload no YouTube falhou (${up.status}): ${JSON.stringify(j).slice(0, 300)}`);
  const url = `https://youtube.com/shorts/${j.id}`;
  log(`  YouTube: ${url} (${j.status?.privacyStatus || meta.status.privacyStatus})`);
  return { url, privacy: j.status?.privacyStatus || meta.status.privacyStatus };
}
