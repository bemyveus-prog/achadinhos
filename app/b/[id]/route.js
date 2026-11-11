import { db, hasDb } from "@/lib/supabase";
import { clickDecision } from "@/lib/clicks";

export const dynamic = "force-dynamic";

// /b/3 -> conta o clique no banner e manda para o link da campanha
export async function GET(req, { params }) {
  const { id } = await params;
  const home = new URL("/", req.url);
  if (!/^\d+$/.test(id) || !hasDb()) return Response.redirect(home, 302);

  const { data } = await db().from("banners").select("link").eq("id", id).maybeSingle();
  if (!data?.link) return Response.redirect(home, 302);

  const d = await clickDecision(req, `b${id}`);
  if (d.count) {
    await Promise.all([
      db().rpc("increment_banner_clicks", { banner_id: Number(id) }).then(() => {}, () => {}),
      db().from("click_events").insert({ banner_id: Number(id) }).then(() => {}, () => {}),
    ]);
  }
  const headers = { Location: data.link, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer-when-downgrade" };
  if (d.setCookie) headers["Set-Cookie"] = d.setCookie;
  return new Response(null, { status: 302, headers });
}
