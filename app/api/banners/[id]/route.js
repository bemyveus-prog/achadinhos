import { isAdmin, unauthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { BUCKET, sanitizeBanner, validLink } from "@/lib/banners";

export const dynamic = "force-dynamic";

export async function PATCH(req, { params }) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await params;
  const body = sanitizeBanner(await req.json().catch(() => ({})));
  if ("link" in body && !validLink(body.link)) return Response.json({ error: "O link precisa começar com https://" }, { status: 400 });
  const { data, error } = await db().from("banners").update(body).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// Exclui o banner e, se a imagem foi enviada pelo painel, apaga o arquivo também
export async function DELETE(_req, { params }) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await params;
  const { data: b } = await db().from("banners").select("image_url").eq("id", id).maybeSingle();
  const { error } = await db().from("banners").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  if (b?.image_url?.includes(marker)) {
    const path = decodeURIComponent(b.image_url.split(marker)[1].split("?")[0]);
    await db().storage.from(BUCKET).remove([path]).catch(() => {});
  }
  return Response.json({ ok: true });
}
