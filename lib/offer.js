import { db, hasDb, isLive } from "@/lib/supabase";
import { BRAND } from "./brand.mjs";

// Uma oferta para a página do produto e para a imagem de compartilhar
export async function getOfferPublic(id) {
  if (!hasDb() || !/^\d+$/.test(String(id))) return null;
  const { data } = await db().from("offers")
    .select("id,kind,title,image_url,pin_image,price,original_price,platform,category,active,expires_at")
    .eq("id", Number(id)).maybeSingle();
  if (!data) return null;
  return { ...data, live: isLive(data) };
}

export const siteUrl = () => BRAND.site;
export const brl = (v) => (v == null ? "" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
