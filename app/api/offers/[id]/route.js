import { getSession, unauthorized } from "@/lib/auth";
import { db, sanitizeOffer } from "@/lib/supabase";
import { revalidateStore } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

// Só altera ofertas da própria vitrine (filtro por store_id em toda operação)
export async function PATCH(req, { params }) {
  const s = await getSession();
  if (!s?.store) return unauthorized();
  const { id } = await params;
  const body = sanitizeOffer(await req.json());
  const { data, error } = await db().from("offers").update(body).eq("id", id).eq("store_id", s.store.id).select().maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Oferta não encontrada" }, { status: 404 });
  revalidateStore(s.store);
  return Response.json(data);
}

export async function DELETE(_req, { params }) {
  const s = await getSession();
  if (!s?.store) return unauthorized();
  const { id } = await params;
  const { error } = await db().from("offers").delete().eq("id", id).eq("store_id", s.store.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  revalidateStore(s.store);
  return Response.json({ ok: true });
}
