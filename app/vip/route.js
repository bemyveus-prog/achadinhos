import { db, hasDb } from "@/lib/supabase";
import { clickDecision } from "@/lib/clicks";
import { BRAND } from "@/lib/brand.mjs";

export const dynamic = "force-dynamic";

// /vip -> conta quem tocou no pop-up/botão do grupo VIP e manda para o canal do Telegram
// contagem por dia no bot_config: "vip_cliques_AAAA-MM-DD" (aparece no /relatorio)
export async function GET(req) {
  const destino = BRAND.canalTelegram || "/";
  const d = await clickDecision(req, "vip");
  if (d.count && hasDb()) {
    try {
      const dia = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
      const key = `vip_cliques_${dia}`;
      const { data } = await db().from("bot_config").select("value").eq("key", key).maybeSingle();
      await db().from("bot_config").upsert({ key, value: String(Number(data?.value || 0) + 1), updated_at: new Date().toISOString() });
    } catch {}
  }
  const headers = { Location: new URL(destino, req.url).toString(), "Cache-Control": "no-store" };
  if (d.setCookie) headers["Set-Cookie"] = d.setCookie;
  return new Response(null, { status: 302, headers });
}
