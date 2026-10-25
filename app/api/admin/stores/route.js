import { getSession, unauthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { hashPassword, slugify, validSlug } from "@/lib/stores";

export const dynamic = "force-dynamic";

// Lista de vitrines com totais (só o admin geral)
export async function GET() {
  const s = await getSession();
  if (s?.role !== "admin") return unauthorized();
  const [{ data: stores, error }, { data: offers }] = await Promise.all([
    db().from("stores").select("id,slug,name,handle,is_owner,active,password_hash,shopee_app_id,created_at").order("id"),
    db().from("offers").select("store_id,clicks,active"),
  ]);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const stats = {};
  for (const o of offers || []) {
    const t = (stats[o.store_id] ||= { offers: 0, clicks: 0 });
    if (o.active) t.offers++;
    t.clicks += o.clicks || 0;
  }
  return Response.json(
    stores.map(({ password_hash, shopee_app_id, ...st }) => ({
      ...st,
      has_password: Boolean(password_hash),
      has_shopee: Boolean(shopee_app_id),
      offers: stats[st.id]?.offers || 0,
      clicks: stats[st.id]?.clicks || 0,
    }))
  );
}

// Cria uma vitrine nova para um afiliado
export async function POST(req) {
  const s = await getSession();
  if (s?.role !== "admin") return unauthorized();
  const { name, slug, password } = await req.json().catch(() => ({}));
  const cleanSlug = slugify(slug || name);
  if (!name?.trim()) return Response.json({ error: "Informe o nome da vitrine" }, { status: 400 });
  if (!validSlug(cleanSlug)) return Response.json({ error: "Endereço inválido: use de 3 a 30 letras minúsculas, números ou hífen" }, { status: 400 });
  if (!password || String(password).length < 6) return Response.json({ error: "A senha precisa ter pelo menos 6 caracteres" }, { status: 400 });

  const { data, error } = await db()
    .from("stores")
    .insert({ name: name.trim(), slug: cleanSlug, password_hash: hashPassword(String(password)) })
    .select("id,slug,name")
    .single();
  if (error) {
    const msg = error.code === "23505" ? `O endereço "${cleanSlug}" já está em uso` : error.message;
    return Response.json({ error: msg }, { status: 400 });
  }
  return Response.json(data);
}
