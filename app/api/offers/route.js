import { revalidatePath } from "next/cache";
import { isAdmin, unauthorized } from "@/lib/auth";
import { db, sanitizeOffer } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const { data, error } = await db().from("offers").select("*").order("id", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(req) {
  if (!(await isAdmin())) return unauthorized();
  const body = sanitizeOffer(await req.json());
  if (!body.title || !body.link) return Response.json({ error: "Título e link são obrigatórios" }, { status: 400 });
  const { data, error } = await db().from("offers").insert(body).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  revalidatePath("/");
  return Response.json(data);
}
