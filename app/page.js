import Vitrine from "@/components/Vitrine";
import { db, hasDb, isLive } from "@/lib/supabase";
import { DEMO_OFFERS } from "@/lib/demo";
import { loadLiveBanners } from "@/lib/banners";
import { BRAND } from "@/lib/brand.mjs";

// Sem cache: a vitrine lê o banco a cada visita. Com cache (ISR), a Netlify/Vercel
// às vezes mostravam a versão antiga logo depois de salvar uma oferta no painel.
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getOffers() {
  if (!hasDb()) return { offers: DEMO_OFFERS, demo: true };
  try {
    const { data, error } = await db()
      .from("offers")
      .select("id,kind,title,description,image_url,price,original_price,platform,category,coupon_code,badge,pinned,clicks,expires_at,active,created_at")
      .eq("active", true)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return { offers: (data || []).filter((o) => isLive(o)), demo: false };
  } catch (e) {
    console.error("Erro ao carregar ofertas:", e.message);
    return { offers: [], demo: false };
  }
}

export default async function Home() {
  const [{ offers, demo }, banners] = await Promise.all([getOffers(), hasDb() ? loadLiveBanners() : []]);
  const profile = {
    name: BRAND.name,
    handle: BRAND.handle,
    tagline: BRAND.tagline,
    avatar: BRAND.avatar,
    socials: {
      tiktok: process.env.NEXT_PUBLIC_TIKTOK_URL || "",
      instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL || "",
      youtube: process.env.NEXT_PUBLIC_YOUTUBE_URL || "",
      whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_URL || "",
    },
    canais: {
      telegram: BRAND.canalTelegram,
      whatsapp: BRAND.canalWhatsapp,
    },
  };
  return <Vitrine offers={offers} profile={profile} demo={demo} banners={banners} />;
}
