import { db, isLive } from "./supabase";
import { storeProfile } from "./stores";

// Ofertas públicas de uma vitrine (sem o link: o clique passa por /r/ID para contar)
export async function loadVitrine(store) {
  const { data, error } = await db()
    .from("offers")
    .select("id,num,kind,title,description,image_url,price,original_price,platform,category,coupon_code,badge,pinned,clicks,expires_at,active,created_at")
    .eq("store_id", store.id)
    .eq("active", true)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return { offers: (data || []).filter((o) => isLive(o)), profile: storeProfile(store) };
}
