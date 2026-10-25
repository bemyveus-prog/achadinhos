import { getSession, unauthorized, adminCookie } from "@/lib/auth";

// Admin geral entra no painel de uma vitrine (store_id) ou volta para a lista (null)
export async function POST(req) {
  const s = await getSession();
  if (s?.role !== "admin") return unauthorized();
  const { store_id = null } = await req.json().catch(() => ({}));
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", adminCookie(store_id ? Number(store_id) : null));
  return res;
}
