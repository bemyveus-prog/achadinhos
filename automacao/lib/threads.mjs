// Postagem no Threads (API oficial). O token fica no banco (bot_config), salvo pela página /api/threads/login do site;
// aqui ele é renovado sozinho quando faltam menos de 15 dias para vencer.
import { createClient } from "@supabase/supabase-js";

const env = (k, d = "") => (process.env[k] ?? "").trim() || d;
const G = "https://graph.threads.net/v1.0";
const sb = () => createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

async function credenciais() {
  if (env("THREADS_POSTAR", "sim") === "nao") return null;
  const { data } = await sb().from("bot_config").select("key,value").in("key", ["threads_token", "threads_user_id", "threads_expira"]);
  const c = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  if (!c.threads_token || !c.threads_user_id) return null;
  if (Number(c.threads_expira || 0) - Date.now() < 15 * 86400000) {
    try {
      const j = await (await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(c.threads_token)}`)).json();
      if (j.access_token) {
        c.threads_token = j.access_token;
        const agora = new Date().toISOString();
        await sb().from("bot_config").upsert([
          { key: "threads_token", value: j.access_token, updated_at: agora },
          { key: "threads_expira", value: String(Date.now() + (Number(j.expires_in) || 5184000) * 1000), updated_at: agora },
        ]);
      }
    } catch { /* usa o token atual */ }
  }
  return { token: c.threads_token, user: c.threads_user_id };
}

export async function hasThreads() { return Boolean(await credenciais().catch(() => null)); }

// texto do post (até 500 caracteres): gancho da legenda + link do produto (clicável no Threads)
export function textoThreads(legenda, link) {
  const linhas = String(legenda || "").split("\n").map((l) => l.trim()).filter(Boolean)
    .filter((l) => !/link na bio|procura o #|procura os números|^#/i.test(l));
  const corpo = linhas.slice(0, 3).join("\n");
  const fim = link ? `\n\n🛒 ${link}` : "";
  return (corpo.slice(0, 500 - fim.length - 1) + fim).trim();
}

async function api(method, path, params) {
  const r = await fetch(`${G}/${path}`, { method, body: method === "POST" ? new URLSearchParams(params) : undefined });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(`Threads: ${j.error.message || JSON.stringify(j.error)}`);
  return j;
}

// posta um vídeo (URL pública) com texto; devolve o link do post
export async function postThreadsVideo(videoUrl, texto, log = console.log) {
  const c = await credenciais();
  if (!c) throw new Error("Threads não conectado (abra /api/threads/login no site)");
  const cont = await api("POST", `${c.user}/threads`, { media_type: "VIDEO", video_url: videoUrl, text: texto, access_token: c.token });
  // o Threads processa o vídeo antes de publicar
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const st = await api("GET", `${cont.id}?fields=status,error_message&access_token=${encodeURIComponent(c.token)}`);
    if (st.status === "FINISHED") break;
    if (st.status === "ERROR" || st.status === "EXPIRED") throw new Error(`Threads recusou o vídeo: ${st.error_message || st.status}`);
  }
  const pub = await api("POST", `${c.user}/threads_publish`, { creation_id: cont.id, access_token: c.token });
  let link = "";
  try { link = (await api("GET", `${pub.id}?fields=permalink&access_token=${encodeURIComponent(c.token)}`)).permalink || ""; } catch {}
  log(`  Threads: ${link || pub.id}`);
  return link || `https://www.threads.net/ (post ${pub.id})`;
}
