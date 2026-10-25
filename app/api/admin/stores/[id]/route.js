import { revalidatePath } from "next/cache";
import { getSession, unauthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { hashPassword, slugify, validSlug } from "@/lib/stores";

export const dynamic = "force-dynamic";

// Admin geral: bloquear/liberar, trocar senha, trocar endereço, definir vitrine principal
export async function PATCH(req, { params }) {
  const s = await getSession();
  if (s?.role !== "admin") return unauthorized();
  const { id } = await params;
  const input = await req.json().catch(() => ({}));
  const changes = {};

  if ("active" in input) changes.active = Boolean(input.active);
  if (input.password) {
    if (String(input.password).length < 6) return Response.json({ error: "A senha precisa ter pelo menos 6 caracteres" }, { status: 400 });
    changes.password_hash = hashPassword(String(input.password));
  }
  if (input.slug) {
    const slug = slugify(input.slug);
    if (!validSlug(slug)) return Response.json({ error: "Endereço inválido: use de 3 a 30 letras minúsculas, números ou hífen" }, { status: 400 });
    changes.slug = slug;
  }
  if (input.is_owner === true) {
    // só uma vitrine pode ser a principal (a que abre no endereço raiz do site)
    await db().from("stores").update({ is_owner: false }).eq("is_owner", true);
    changes.is_owner = true;
  }

  const { data, error } = await db().from("stores").update(changes).eq("id", id).select("id,slug,name,is_owner,active").single();
  if (error) {
    const msg = error.code === "23505" ? "Esse endereço já está em uso" : error.message;
    return Response.json({ error: msg }, { status: 400 });
  }
  try { revalidatePath("/", "layout"); } catch {}
  return Response.json(data);
}

// Excluir vitrine apaga também todas as ofertas dela
export async function DELETE(_req, { params }) {
  const s = await getSession();
  if (s?.role !== "admin") return unauthorized();
  const { id } = await params;
  const { data: st } = await db().from("stores").select("is_owner").eq("id", id).maybeSingle();
  if (st?.is_owner) return Response.json({ error: "A vitrine principal não pode ser excluída" }, { status: 400 });
  const { error } = await db().from("stores").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  try { revalidatePath("/", "layout"); } catch {}
  return Response.json({ ok: true });
}
