import { createHash } from "crypto";

// Bot do Telegram: busca produtos na API de afiliados e coloca na vitrine com um toque.
const token = () => (process.env.TELEGRAM_BOT_TOKEN || "").trim();
export const hasBot = () => Boolean(token());
export const allowedChat = () => (process.env.TELEGRAM_CHAT_ID || "").trim();
// segredo do webhook derivado do token (o Telegram manda de volta em cada chamada)
export const webhookSecret = () => createHash("sha256").update("vitrine-tg:" + token()).digest("hex").slice(0, 48);

export async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description || res.status}`);
  return json.result;
}

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const brl = (v) => "R$ " + Number(v).toFixed(2).replace(".", ",");
export const pct = (v) => (v * 100).toFixed(1).replace(".", ",").replace(",0", "") + "%";
const n = (v) => (v == null || v === "" ? 0 : Number(v) || 0);

export function normalize(p) {
  const price = n(p.priceMin || p.price);
  const discount = n(p.priceDiscountRate);
  return {
    itemId: String(p.itemId),
    shopId: String(p.shopId),
    name: String(p.productName || "").trim(),
    imageUrl: p.imageUrl,
    price,
    originalPrice: price && discount > 0 && discount < 100 ? Math.round((price / (1 - discount / 100)) * 100) / 100 : null,
    commission: n(p.commissionRate),
    sales: n(p.sales),
    rating: n(p.ratingStar),
    productLink: p.productLink,
    offerLink: p.offerLink,
  };
}

// comissão pesa mais; vendas e nota evitam produto ruim
export const score = (p) => p.commission * (1 + Math.log10(Math.max(p.sales, 1))) * (p.rating / 5);

export const CATEGORIAS = {
  moda: [100017, "Moda Feminina"],
  calcados: [100532, "Calçados Femininos"],
  bolsas: [100016, "Bolsas Femininas"],
  acessorios: [100009, "Acessórios"],
  beleza: [100630, "Beleza"],
  saude: [100001, "Saúde"],
  casa: [100636, "Casa"],
  pets: [100631, "Pets"],
  infantil: [100633, "Moda Infantil"],
  masculino: [100011, "Moda Masculina"],
  celular: [100013, "Celulares e Acessórios"],
  eletro: [100010, "Eletrodomésticos"],
  esportes: [100637, "Esportes"],
};
