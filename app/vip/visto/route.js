import { db, hasDb } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// o pop-up do grupo VIP avisa aqui quando aparece na tela (para saber quantos viram x quantos tocaram)
export async function POST(req) {
  const ua = req.headers.get("user-agent") || "";
  if (hasDb() && ua && !/bot|crawl|spider|headless/i.test(ua)) {
    try {
      const dia = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
      const key = `vip_vistos_${dia}`;
      const { data } = await db().from("bot_config").select("value").eq("key", key).maybeSingle();
      await db().from("bot_config").upsert({ key, value: String(Number(data?.value || 0) + 1), updated_at: new Date().toISOString() });
    } catch {}
  }
  return new Response(null, { status: 204 });
}
