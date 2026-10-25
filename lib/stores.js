import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { db } from "./supabase";
import { envCreds } from "./shopee";

// Endereços que não podem virar nome de vitrine (são páginas do próprio site)
const RESERVED = new Set(["admin", "api", "r", "_next", "favicon.ico", "robots.txt", "sitemap.xml", "login", "static"]);

export function validSlug(slug) {
  return typeof slug === "string" && /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/.test(slug) && !RESERVED.has(slug);
}

export function slugify(s) {
  return String(s || "")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
}

// ---------- senhas ----------
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `s1$${salt}$${hash}`;
}

export function checkPassword(password, stored) {
  if (!stored || !password) return false;
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = scryptSync(password, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- leitura ----------
const PUBLIC_COLS =
  "id,slug,name,handle,tagline,avatar_url,tiktok_url,instagram_url,youtube_url,whatsapp_url,is_owner,active";

export async function getStoreBySlug(slug) {
  const { data } = await db().from("stores").select(PUBLIC_COLS).eq("slug", slug).maybeSingle();
  return data || null;
}

export async function getOwnerStore() {
  const { data } = await db().from("stores").select(PUBLIC_COLS).eq("is_owner", true).order("id").limit(1);
  return data?.[0] || null;
}

export async function getStoreFull(id) {
  const { data } = await db().from("stores").select("*").eq("id", id).maybeSingle();
  return data || null;
}

// Perfil público da vitrine. A loja principal herda as variáveis NEXT_PUBLIC_* quando o campo está vazio.
export function storeProfile(store) {
  const env = store.is_owner
    ? {
        name: process.env.NEXT_PUBLIC_SITE_NAME,
        handle: process.env.NEXT_PUBLIC_SITE_HANDLE,
        tagline: process.env.NEXT_PUBLIC_TAGLINE,
        avatar: process.env.NEXT_PUBLIC_AVATAR_URL,
        tiktok: process.env.NEXT_PUBLIC_TIKTOK_URL,
        instagram: process.env.NEXT_PUBLIC_INSTAGRAM_URL,
        youtube: process.env.NEXT_PUBLIC_YOUTUBE_URL,
        whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_URL,
      }
    : {};
  return {
    name: store.name || env.name || "Minha vitrine",
    handle: store.handle || env.handle || "",
    tagline: store.tagline || env.tagline || "Os achados que eu indico nos vídeos",
    avatar: store.avatar_url || env.avatar || "",
    socials: {
      tiktok: store.tiktok_url || env.tiktok || "",
      instagram: store.instagram_url || env.instagram || "",
      youtube: store.youtube_url || env.youtube || "",
      whatsapp: store.whatsapp_url || env.whatsapp || "",
    },
  };
}

// Chaves da Shopee que geram link de afiliado EM NOME desta loja.
// Só a loja principal pode usar as variáveis de ambiente (que são do dono do site).
export function ownShopeeCreds(store) {
  if (store.shopee_app_id && store.shopee_app_secret) {
    return { appId: store.shopee_app_id, secret: store.shopee_app_secret, subId: store.shopee_sub_id || "bio" };
  }
  return store.is_owner ? envCreds() : null;
}

// Perfil para o painel (sem expor o secret da Shopee nem a senha)
export function storeForPanel(s) {
  return {
    id: s.id, slug: s.slug, name: s.name || "", handle: s.handle || "", tagline: s.tagline || "",
    avatar_url: s.avatar_url || "", tiktok_url: s.tiktok_url || "", instagram_url: s.instagram_url || "",
    youtube_url: s.youtube_url || "", whatsapp_url: s.whatsapp_url || "",
    shopee_app_id: s.shopee_app_id || "", shopee_sub_id: s.shopee_sub_id || "",
    has_shopee_secret: Boolean(s.shopee_app_secret), is_owner: s.is_owner, active: s.active,
    has_password: Boolean(s.password_hash),
  };
}

const PROFILE_FIELDS = [
  "name", "handle", "tagline", "avatar_url", "tiktok_url", "instagram_url", "youtube_url", "whatsapp_url",
  "shopee_app_id", "shopee_app_secret", "shopee_sub_id",
];

export function sanitizeProfile(input) {
  const out = {};
  for (const k of PROFILE_FIELDS) {
    if (!(k in input)) continue;
    let v = input[k];
    if (typeof v === "string") v = v.trim().slice(0, 500);
    if (v === "") v = null;
    // secret vazio no formulário = "não mudar"
    if (k === "shopee_app_secret" && v == null) continue;
    out[k] = v;
  }
  if ("name" in out && !out.name) delete out.name;
  return out;
}

// Próximo número de produto dentro da vitrine (#1, #2…)
export async function nextNum(storeId) {
  const { data } = await db().from("offers").select("num").eq("store_id", storeId).order("num", { ascending: false }).limit(1);
  return (data?.[0]?.num || 0) + 1;
}
