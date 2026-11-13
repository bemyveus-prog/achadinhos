// Threads (Meta): login da conta e token guardado no banco (bot_config), lido pelas automações.
import { db } from "@/lib/supabase";
import { BRAND } from "@/lib/brand.mjs";

export const threadsRedirect = () => `${BRAND.site}/api/threads/callback`;
export const hasThreadsApp = () => Boolean((process.env.THREADS_APP_ID || "").trim() && (process.env.THREADS_APP_SECRET || "").trim());

export async function salvarThreads({ token, userId, expiraEm }) {
  const agora = new Date().toISOString();
  await db().from("bot_config").upsert([
    { key: "threads_token", value: token, updated_at: agora },
    { key: "threads_user_id", value: String(userId), updated_at: agora },
    { key: "threads_expira", value: String(expiraEm), updated_at: agora },
  ]);
}
