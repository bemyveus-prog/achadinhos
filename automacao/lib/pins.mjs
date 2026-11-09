// Imagem do pin do Pinterest = capa do carrossel (vertical, com gancho e foto da categoria).
// Sobe no Storage público "carrosseis/pins/<id>.jpg" e grava em offers.pin_image (o /rss usa essa imagem).
import os from "os";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { uploadPublic } from "./social.mjs";
import { renderCarousel } from "./carrossel.mjs";
import { pickCover } from "./capas.mjs";
import { templateTexts } from "./textos.mjs";

const db = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// já tem a capa pronta (ex.: achado do dia): só sobe e grava
export async function savePinImage(offerId, file) {
  const [url] = await uploadPublic([file], `pins/${offerId}`);
  const { error } = await db().from("offers").update({ pin_image: url }).eq("id", offerId);
  if (error) throw new Error(`Supabase: ${error.message}`);
  return url;
}

// gera a capa de um produto da vitrine que ainda não tem e grava
export async function makePinImage(o, { log = console.log } = {}) {
  const p = { itemId: String(o.id), name: o.title, imageUrl: o.image_url, price: Number(o.price) || 0, originalPrice: o.original_price ? Number(o.original_price) : null, sales: o.sales || 0, rating: o.rating || 0 };
  const texts = templateTexts(p);
  const cover = await pickCover(p, { log: () => {} }).catch(() => null);
  const outDir = path.join(os.tmpdir(), "pins", String(o.id));
  const files = await renderCarousel(p, texts, { outDir, number: `#${o.id}`, handle: process.env.INSTAGRAM_HANDLE || "", cover });
  const url = await savePinImage(o.id, files[0]);
  log(`  pin #${o.id}: ${cover ? `capa ${cover.slug}` : "capa padrão"}`);
  return url;
}

// todos os produtos ativos sem imagem de pin (mais novos primeiro)
export async function fillMissingPins({ max = 40, log = console.log } = {}) {
  const now = new Date().toISOString();
  const { data, error } = await db().from("offers")
    .select("id,title,image_url,price,original_price")
    .eq("active", true).eq("kind", "produto").is("pin_image", null).not("image_url", "is", null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("id", { ascending: false }).limit(max);
  if (error) throw new Error(`Supabase: ${error.message}`);
  // nota e vendas reais quando o produto veio do achado do dia
  const ids = (data || []).map((o) => o.id);
  const { data: picks } = ids.length ? await db().from("auto_picks").select("offer_id,sales,rating").in("offer_id", ids) : { data: [] };
  const extra = new Map((picks || []).map((r) => [r.offer_id, r]));
  let ok = 0;
  for (const o of data || []) {
    try { await makePinImage({ ...o, ...extra.get(o.id) }, { log }); ok++; }
    catch (e) { log(`  pin #${o.id} falhou: ${e.message}`); }
  }
  log(`Pinterest: ${ok} capas novas para o feed.`);
  return ok;
}
