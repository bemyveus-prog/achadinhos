import { db, hasDb } from "@/lib/supabase";
import { DEMO_OFFERS } from "@/lib/demo";
import { clickDecision } from "@/lib/clicks";

export const dynamic = "force-dynamic";

// /r/23 -> conta o clique e manda para o link de afiliado
export async function GET(req, { params }) {
  const { id } = await params;
  const home = new URL("/", req.url);
  if (!/^\d+$/.test(id)) return Response.redirect(home, 302);

  if (!hasDb()) {
    const o = DEMO_OFFERS.find((x) => String(x.id) === id);
    return Response.redirect(o?.link || home, 302);
  }

  const { data } = await db().from("offers").select("link").eq("id", id).maybeSingle();
  if (!data?.link) return Response.redirect(home, 302);

  // conta o clique só se for gente de verdade, 1 vez por pessoa a cada 24 h (e não conta o admin)
  const d = await clickDecision(req, `o${id}`);
  if (d.count) {
    await Promise.all([
      db().rpc("increment_clicks", { offer_id: Number(id) }).then(() => {}, () => {}),
      db().from("click_events").insert({ offer_id: Number(id) }).then(() => {}, () => {}),
    ]);
  }
  const headers = { Location: data.link, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer-when-downgrade" };
  if (d.setCookie) headers["Set-Cookie"] = d.setCookie;
  return new Response(null, { status: 302, headers });
}
