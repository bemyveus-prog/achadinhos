import { getSession, unauthorized, storeCookie } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { checkPassword, hashPassword, sanitizeProfile, storeForPanel } from "@/lib/stores";
import { revalidateStore } from "@/lib/revalidate";

export const dynamic = "force-dynamic";

// Perfil da vitrine logada (nome, foto, redes, API Shopee)
export async function GET() {
  const s = await getSession();
  if (!s?.store) return unauthorized();
  return Response.json(storeForPanel(s.store));
}

export async function PATCH(req) {
  const s = await getSession();
  if (!s?.store) return unauthorized();
  const input = await req.json().catch(() => ({}));
  const changes = sanitizeProfile(input);

  // Troca de senha: o afiliado confirma a senha atual; o admin geral não precisa
  let passwordChanged = false;
  if (input.new_password) {
    if (String(input.new_password).length < 6) return Response.json({ error: "A senha nova precisa ter pelo menos 6 caracteres" }, { status: 400 });
    if (s.role === "store" && !checkPassword(input.current_password || "", s.store.password_hash)) {
      return Response.json({ error: "Senha atual incorreta" }, { status: 400 });
    }
    changes.password_hash = hashPassword(String(input.new_password));
    passwordChanged = true;
  }
  if (input.remove_shopee) {
    changes.shopee_app_id = null;
    changes.shopee_app_secret = null;
  }

  const { data, error } = await db().from("stores").update(changes).eq("id", s.store.id).select("*").single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  revalidateStore(data);

  const res = Response.json(storeForPanel(data));
  // mantém o próprio afiliado logado depois de trocar a senha
  if (passwordChanged && s.role === "store") res.headers.append("Set-Cookie", storeCookie(data));
  return res;
}
