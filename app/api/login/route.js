import { adminCookie, storeCookie } from "@/lib/auth";
import { db, hasDb } from "@/lib/supabase";
import { checkPassword } from "@/lib/stores";

const slow = () => new Promise((r) => setTimeout(r, 600)); // freia tentativas de adivinhar senha

export async function POST(req) {
  const { user = "", password = "" } = await req.json().catch(() => ({}));
  const login = String(user).trim().toLowerCase().replace(/^@/, "");

  // Administrador geral: usuário "admin" (ou vazio) + ADMIN_PASSWORD
  if (!login || login === "admin") {
    if (!process.env.ADMIN_PASSWORD) {
      return Response.json({ error: "Defina ADMIN_PASSWORD nas variáveis de ambiente." }, { status: 500 });
    }
    if (password === process.env.ADMIN_PASSWORD) {
      const res = Response.json({ ok: true, role: "admin" });
      res.headers.append("Set-Cookie", adminCookie());
      return res;
    }
    await slow();
    return Response.json({ error: "Usuário ou senha incorretos" }, { status: 401 });
  }

  if (!hasDb()) return Response.json({ error: "Banco não configurado" }, { status: 500 });
  const { data: store } = await db().from("stores").select("*").eq("slug", login).maybeSingle();
  if (!store || !checkPassword(password, store.password_hash)) {
    await slow();
    return Response.json({ error: "Usuário ou senha incorretos" }, { status: 401 });
  }
  if (!store.active) return Response.json({ error: "Acesso bloqueado. Fale com o administrador." }, { status: 403 });

  const res = Response.json({ ok: true, role: "store" });
  res.headers.append("Set-Cookie", storeCookie(store));
  return res;
}
