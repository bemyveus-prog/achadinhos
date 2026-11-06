import { db } from "./supabase";

export const BUCKET = "banners";

const FIELDS = ["image_url", "link", "title", "sort", "active", "starts_at", "ends_at"];

// Limpa o que vem do formulário do painel
export function sanitizeBanner(input) {
  const out = {};
  for (const k of FIELDS) {
    if (!(k in input)) continue;
    let v = input[k];
    if (typeof v === "string") v = v.trim().slice(0, 2000);
    if (v === "") v = null;
    if (k === "sort") v = Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0;
    if (k === "active") v = Boolean(v);
    if ((k === "starts_at" || k === "ends_at") && v && isNaN(new Date(v))) v = null;
    out[k] = v;
  }
  return out;
}

export function validLink(v) {
  return typeof v === "string" && /^https:\/\//i.test(v.trim());
}

export function isLiveBanner(b, now = Date.now()) {
  if (!b.active) return false;
  if (b.starts_at && new Date(b.starts_at).getTime() > now) return false;
  if (b.ends_at && new Date(b.ends_at).getTime() <= now) return false;
  return true;
}

// Banners que aparecem agora na vitrine. Se a tabela ainda não existir, não quebra a página.
export async function loadLiveBanners() {
  try {
    const { data, error } = await db()
      .from("banners")
      .select("id,image_url,title,sort,active,starts_at,ends_at,created_at")
      .eq("active", true)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    return (data || []).filter((b) => isLiveBanner(b));
  } catch (e) {
    console.error("Erro ao carregar banners:", e.message);
    return [];
  }
}
