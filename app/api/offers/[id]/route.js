import { revalidatePath } from "next/cache";
import { isAdmin, unauthorized } from "@/lib/auth";
import { db, sanitizeOffer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await params;
  const body = sanitizeOffer(await req.json());
  const { data, error } = await db().from("offers").update(body).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  revalidatePath("/");
  return Response.json(data);
}

export async function DELETE(_req, { params }) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await params;
  const { error } = await db().from("offers").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  revalidatePath("/");
  return Response.json({ ok: true });
}
