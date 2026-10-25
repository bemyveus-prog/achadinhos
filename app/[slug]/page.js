import { notFound } from "next/navigation";
import Vitrine from "@/components/Vitrine";
import { hasDb } from "@/lib/supabase";
import { getStoreBySlug, storeProfile, validSlug } from "@/lib/stores";
import { loadVitrine } from "@/lib/vitrine";

export const revalidate = 60;

// gera cada vitrine na primeira visita e guarda em cache (ISR)
export async function generateStaticParams() {
  return [];
}

async function findStore(slug) {
  if (!hasDb() || !validSlug(slug)) return null;
  const store = await getStoreBySlug(slug);
  return store?.active ? store : null;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const store = await findStore(slug).catch(() => null);
  if (!store) return { title: "Vitrine não encontrada" };
  const p = storeProfile(store);
  return {
    title: `${p.name} — ofertas e cupons`,
    description: p.tagline,
    openGraph: { title: p.name, description: p.tagline, type: "website", images: p.avatar ? [p.avatar] : [] },
  };
}

// Vitrine de cada afiliado: site.com/slug
export default async function StorePage({ params }) {
  const { slug } = await params;
  const store = await findStore(slug);
  if (!store) notFound();
  const { offers, profile } = await loadVitrine(store);
  return <Vitrine offers={offers} profile={profile} />;
}
