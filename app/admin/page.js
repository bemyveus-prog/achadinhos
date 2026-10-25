import { getSession } from "@/lib/auth";
import { hasDb } from "@/lib/supabase";
import { ownShopeeCreds, storeForPanel } from "@/lib/stores";
import AdminPanel from "@/components/AdminPanel";
import AdminHome from "@/components/AdminHome";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel — Vitrine", robots: { index: false } };

export default async function AdminPage() {
  if (!hasDb()) {
    return <div className="adm"><div className="warn">Supabase não configurado: preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.</div></div>;
  }
  let session = null;
  try {
    session = await getSession();
  } catch (e) {
    return <div className="adm"><div className="warn">Erro ao ler o banco ({e.message}). Rode o supabase/migracao-2-varias-vitrines.sql no Supabase.</div></div>;
  }
  if (!session) return <LoginForm />;

  // Admin geral sem vitrine escolhida: lista de vitrines
  if (session.role === "admin" && !session.store) return <AdminHome />;

  const store = session.store;
  return (
    <AdminPanel
      key={store.id}
      store={storeForPanel(store)}
      adminActing={session.role === "admin"}
      hasOwnShopee={Boolean(ownShopeeCreds(store))}
    />
  );
}
