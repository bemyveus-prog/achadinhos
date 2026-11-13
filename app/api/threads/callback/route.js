import { isAdmin } from "@/lib/auth";
import { hasDb } from "@/lib/supabase";
import { hasThreadsApp, salvarThreads, threadsRedirect } from "@/lib/threads";

export const dynamic = "force-dynamic";
const pagina = (titulo, texto) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui;max-width:520px;margin:60px auto;padding:0 20px;line-height:1.5"><h2>${titulo}</h2><p>${texto}</p></body>`, { headers: { "content-type": "text/html; charset=utf-8" } });

export async function GET(req) {
  const url = new URL(req.url);
  // a Meta também chama este endereço para avisar remoção/exclusão: só responde ok
  const code = url.searchParams.get("code");
  if (!code) return pagina("Threads", url.searchParams.get("error_description") || "Nada a fazer aqui.");
  if (!(await isAdmin())) return pagina("Entre no painel", "Abra o /admin, entre com a senha e depois abra /api/threads/login de novo.");
  if (!hasThreadsApp() || !hasDb()) return pagina("Falta configuração", "Confira THREADS_APP_ID, THREADS_APP_SECRET e o Supabase na Vercel.");
  try {
    const r1 = await fetch("https://graph.threads.net/oauth/access_token", {
      method: "POST",
      body: new URLSearchParams({ client_id: process.env.THREADS_APP_ID.trim(), client_secret: process.env.THREADS_APP_SECRET.trim(),
        grant_type: "authorization_code", redirect_uri: threadsRedirect(), code: code.replace(/#_$/, "") }),
    });
    const j1 = await r1.json();
    if (!j1.access_token) throw new Error(j1.error_message || j1.error?.message || JSON.stringify(j1).slice(0, 200));
    // troca pelo token de 60 dias (o robô renova sozinho antes de vencer)
    const r2 = await fetch(`https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(process.env.THREADS_APP_SECRET.trim())}&access_token=${encodeURIComponent(j1.access_token)}`);
    const j2 = await r2.json();
    if (!j2.access_token) throw new Error(j2.error?.message || JSON.stringify(j2).slice(0, 200));
    const me = await (await fetch(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(j2.access_token)}`)).json();
    await salvarThreads({ token: j2.access_token, userId: me.id || j1.user_id, expiraEm: Date.now() + (Number(j2.expires_in) || 5184000) * 1000 });
    return pagina("✅ Threads conectado", `Conta <b>@${me.username || "?"}</b> ligada. Os Reels postados no Instagram também vão sair no Threads, com o link do produto. Pode fechar esta página.`);
  } catch (e) {
    return pagina("Não deu certo", String(e.message || e));
  }
}
export const POST = async () => Response.json({ ok: true });
