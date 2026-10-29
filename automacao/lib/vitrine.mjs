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
