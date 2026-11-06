import { isAdmin, unauthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { sanitizeBanner, validLink } from "@/lib/banners";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const { data, error } = await db()
    .from("banners")
    .select("*")
    .order("sort", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: friendly(error) }, { status: 500 });
  return Response.json(data);
}

export async function POST(req) {
  if (!(await isAdmin())) return unauthorized();
  const body = sanitizeBanner(await req.json().catch(() => ({})));
  if (!body.image_url) return Response.json({ error: "Envie a imagem do banner" }, { status: 400 });
  if (!validLink(body.link)) return Response.json({ error: "Cole o link do banner (começando com https://)" }, { status: 400 });
  const { data, error } = await db().from("banners").insert(body).select().single();
  if (error) return Response.json({ error: friendly(error) }, { status: 500 });
  return Response.json(data);
}

function friendly(error) {
  return /relation .*banners.* does not exist|banners/.test(error.message) && error.code === "42P01"
    ? "A tabela de banners não existe. Rode o supabase/banners.sql no Supabase."
    : error.message;
}
