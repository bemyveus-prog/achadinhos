import { createClient } from "@supabase/supabase-js";

let client = null;

export function hasDb() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Só usado no servidor (service_role nunca vai para o navegador)
export function db() {
  if (!hasDb()) throw new Error("Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

const FIELDS = [
  "kind", "title", "description", "image_url", "price", "original_price", "link",
  "platform", "category", "coupon_code", "badge", "pinned", "active", "expires_at",
];

// Limpa o que vem do formulário do admin
export function sanitizeOffer(input) {
  const out = {};
  for (const k of FIELDS) {
    if (!(k in input)) continue;
    let v = input[k];
    if (typeof v === "string") v = v.trim();
    if (v === "") v = null;
    if ((k === "price" || k === "original_price") && v != null) {
      let s = String(v).replace(/[^\d,.]/g, "");
      if (s.includes(",")) s = s.replace(/\./g, "").replace(",", "."); // formato BR: 1.299,90
      v = Number(s);
      if (!isFinite(v)) v = null;
    }
    if (k === "pinned" || k === "active") v = Boolean(v);
    if (k === "kind" && !["produto", "cupom"].includes(v)) v = "produto";
    out[k] = v;
  }
  return out;
}

export function isLive(o, now = Date.now()) {
  return o.active && (!o.expires_at || new Date(o.expires_at).getTime() > now);
}
