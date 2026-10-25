import { getSession, unauthorized } from "@/lib/auth";
import { db, sanitizeOffer } from "@/lib/supabase";
import { nextNum } from "@/lib/stores";
import { revalidateStore } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSession();
  if (!s?.store) return unauthorized();
  const { data, error } = await db().from("offers").select("*").eq("store_id", s.store.id).order("num", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(req) {
  const s = await getSession();
  if (!s?.store) return unauthorized();
  const body = sanitizeOffer(await req.json());
  if (!body.title || !body.link) return Response.json({ error: "Título e link são obrigatórios" }, { status: 400 });

  // tenta duas vezes caso dois cadastros peguem o mesmo número ao mesmo tempo
  let result;
  for (let i = 0; i < 2; i++) {
    const num = await nextNum(s.store.id);
    result = await db().from("offers").insert({ ...body, store_id: s.store.id, num }).select().single();
    if (!result.error || result.error.code !== "23505") break;
  }
  if (result.error) return Response.json({ error: result.error.message }, { status: 500 });
  revalidateStore(s.store);
  return Response.json(result.data);
}
