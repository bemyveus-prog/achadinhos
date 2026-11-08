import { createClient } from "@supabase/supabase-js";

const BADGE = "Achado do dia";

export function hasDb() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let client;
function db() {
  client ||= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return client;
}

// Produtos já escolhidos antes (não repete)
export async function pickedItemIds() {
  const { data, error } = await db().from("auto_picks").select("item_id");
  if (error) throw new Error(`Supabase (auto_picks): ${error.message}. Rodou o supabase/auto-picks.sql?`);
  return new Set((data || []).map((r) => String(r.item_id)));
}

// O achado sai sozinho da vitrine depois de DIAS_NA_VITRINE dias (padrão 15; 0 = fica para sempre)
function expiresAt() {
  const dias = Number((process.env.DIAS_NA_VITRINE || "15").trim());
  if (!dias || dias <= 0) return null;
  return new Date(Date.now() + dias * 86400000).toISOString();
}

// Cadastra o produto na vitrine em destaque e tira o destaque do achado anterior
export async function publishOffer(p, { link, title, pin = true }) {
  if (pin) {
    const { data: prev } = await db().from("auto_picks").select("offer_id").not("offer_id", "is", null);
    const ids = (prev || []).map((r) => r.offer_id);
    if (ids.length) {
      await db().from("offers").update({ pinned: false, badge: null }).in("id", ids).eq("badge", BADGE);
    }
  }
  const { data, error } = await db()
    .from("offers")
    .insert({
      kind: "produto",
      title,
      image_url: p.imageUrl,
      price: p.price || null,
      original_price: p.originalPrice,
      link,
      platform: "shopee",
      badge: pin ? BADGE : null,
      pinned: pin,
      active: true,
      expires_at: expiresAt(),
    })
    .select()
    .single();
  if (error) throw new Error(`Supabase (offers): ${error.message}`);
  return data;
}

export async function recordPick(p, { offerId, outDir, link }) {
  const { error } = await db().from("auto_picks").insert({
    item_id: Number(p.itemId),
    shop_id: Number(p.shopId),
    offer_id: offerId ?? null,
    product_name: p.name,
    commission_rate: p.commission,
    price: p.price || null,
    sales: p.sales,
    rating: p.rating,
    link,
    out_dir: outDir,
  });
  if (error) throw new Error(`Supabase (auto_picks): ${error.message}`);
}

// Oferta da vitrine (para gerar o Reels de um produto já cadastrado). Traz nota/vendas
// do achado do dia quando a oferta veio da automação.
export async function getOffer(id) {
  const { data: o, error } = await db().from("offers").select("id,title,image_url,price,original_price,link").eq("id", id).maybeSingle();
  if (error) throw new Error(`Supabase (offers): ${error.message}`);
  if (!o) return null;
  const { data: pick } = await db().from("auto_picks").select("item_id,rating,sales").eq("offer_id", id).maybeSingle();
  return { ...o, rating: pick?.rating ? Number(pick.rating) : null, sales: pick?.sales || null, itemId: pick?.item_id ? String(pick.item_id) : String(o.id) };
}

// Achado do dia mais recente na vitrine
export async function latestPickOfferId() {
  const { data } = await db().from("auto_picks").select("offer_id").not("offer_id", "is", null).order("picked_at", { ascending: false }).limit(1);
  return data?.[0]?.offer_id || null;
}
