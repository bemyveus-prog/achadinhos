import { isAdmin, unauthorized } from "@/lib/auth";
import { db, hasDb } from "@/lib/supabase";
import { hasShopeeApi } from "@/lib/shopee";
import { importFromUrl } from "@/lib/importer";

export const dynamic = "force-dynamic";

// Números do produto para o carrossel (vendas e nota).
// 1) se veio da automação, já estão salvos em auto_picks;
// 2) senão, para Shopee, consulta a API de afiliados pelo link.
export async function GET(_req, { params }) {
  if (!(await isAdmin())) return unauthorized();
  if (!hasDb()) return Response.json({});
  const { id } = await params;

  const { data: pick } = await db()
    .from("auto_picks")
    .select("sales,rating,commission_rate")
    .eq("offer_id", id)
    .maybeSingle()
    .then((r) => r, () => ({ data: null })); // tabela pode não existir

  if (pick?.sales) {
    return Response.json({ sales: pick.sales, rating: Number(pick.rating) || 0, commission: Number(pick.commission_rate) || 0 });
  }

  const { data: offer } = await db().from("offers").select("link,platform").eq("id", id).maybeSingle();
  if (offer?.platform === "shopee" && offer.link && hasShopeeApi()) {
    try {
      const p = await importFromUrl(offer.link);
      if (p.sales || p.rating) return Response.json({ sales: p.sales || 0, rating: p.rating || 0 });
    } catch {}
  }
  return Response.json({});
}
