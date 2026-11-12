import { isAdmin } from "@/lib/auth";
import { hasDb } from "@/lib/supabase";
import { hasShopeeApi } from "@/lib/shopee";
import AdminPanel from "@/components/AdminPanel";
import LoginForm from "@/components/LoginForm";
import { BRAND } from "@/lib/brand.mjs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel — Vitrine", robots: { index: false } };

export default async function AdminPage() {
  if (!(await isAdmin())) return <LoginForm />;
  return <AdminPanel dbReady={hasDb()} shopeeReady={hasShopeeApi()} marca={BRAND.name} />;
}
