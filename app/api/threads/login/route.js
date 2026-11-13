import { isAdmin } from "@/lib/auth";
import { hasThreadsApp, threadsRedirect } from "@/lib/threads";

// Abra logado no /admin: leva para a autorização do Threads
export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await isAdmin())) return new Response("Entre no /admin primeiro e depois abra este endereço de novo.", { status: 401 });
  if (!hasThreadsApp()) return new Response("Faltam THREADS_APP_ID e THREADS_APP_SECRET nas variáveis da Vercel.", { status: 400 });
  const u = new URL("https://threads.net/oauth/authorize");
  u.searchParams.set("client_id", process.env.THREADS_APP_ID.trim());
  u.searchParams.set("redirect_uri", threadsRedirect());
  u.searchParams.set("scope", "threads_basic,threads_content_publish");
  u.searchParams.set("response_type", "code");
  return Response.redirect(u.toString(), 302);
}
