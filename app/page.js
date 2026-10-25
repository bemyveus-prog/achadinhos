import Vitrine from "@/components/Vitrine";
import { hasDb } from "@/lib/supabase";
import { getOwnerStore } from "@/lib/stores";
import { loadVitrine } from "@/lib/vitrine";
import { DEMO_OFFERS } from "@/lib/demo";

export const revalidate = 60; // cache de 1 min; o painel atualiza na hora ao salvar

const demoProfile = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || "Meus Achadinhos",
  handle: process.env.NEXT_PUBLIC_SITE_HANDLE || "",
  tagline: process.env.NEXT_PUBLIC_TAGLINE || "Os achados que eu indico nos vídeos",
  avatar: "",
  socials: { tiktok: process.env.NEXT_PUBLIC_TIKTOK_URL || "" },
};

// Endereço principal do site = vitrine marcada como "principal"
export default async function Home() {
  if (!hasDb()) return <Vitrine offers={DEMO_OFFERS} profile={demoProfile} demo />;
  try {
    const store = await getOwnerStore();
    if (!store || !store.active) return <Vitrine offers={[]} profile={demoProfile} />;
    const { offers, profile } = await loadVitrine(store);
    return <Vitrine offers={offers} profile={profile} />;
  } catch (e) {
    console.error("Erro ao carregar a vitrine principal:", e.message);
    return <Vitrine offers={[]} profile={demoProfile} />;
  }
}
