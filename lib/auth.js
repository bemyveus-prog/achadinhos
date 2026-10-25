import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getStoreFull } from "./stores";

export const COOKIE = "vb_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

function secret() {
  return (
    process.env.SESSION_SECRET ||
    createHash("sha256").update(`vb:${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}:${process.env.ADMIN_PASSWORD || ""}`).digest("hex")
  );
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(mac || "");
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!p.e || p.e < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}

// Trecho do hash da senha: trocar a senha derruba as sessões antigas
const pwTag = (hash) => (hash ? hash.slice(-10) : "none");

export function adminCookie(actingStoreId = null) {
  return cookieHeader(sign({ r: "admin", a: actingStoreId, e: Date.now() + MAX_AGE * 1000 }));
}

export function storeCookie(store) {
  return cookieHeader(sign({ r: "store", s: store.id, v: pwTag(store.password_hash), e: Date.now() + MAX_AGE * 1000 }));
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function cookieHeader(value) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secure}`;
}

/**
 * Sessão atual:
 *  { role: "admin", store: <loja que o admin está gerenciando ou null> }
 *  { role: "store", store: <loja do afiliado> }
 *  null (não logado)
 */
export async function getSession() {
  const jar = await cookies();
  const p = verify(jar.get(COOKIE)?.value);
  if (!p) return null;
  if (p.r === "admin") {
    if (!process.env.ADMIN_PASSWORD) return null;
    const store = p.a ? await getStoreFull(p.a) : null;
    return { role: "admin", store };
  }
  if (p.r === "store" && p.s) {
    const store = await getStoreFull(p.s);
    if (!store || !store.active || pwTag(store.password_hash) !== p.v) return null;
    return { role: "store", store };
  }
  return null;
}

export function unauthorized(msg = "Não autorizado") {
  return Response.json({ error: msg }, { status: 401 });
}
