import { createHash } from "crypto";

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

// Limpa espaços, quebras de linha e aspas que costumam vir junto ao colar a chave no painel
const clean = (v) => String(v || "").trim().replace(/^["']|["']$/g, "").trim();

// "1832…0007 (11 caracteres)" — o suficiente para comparar, sem revelar a chave
function mask(v) {
  if (!v) return "vazio";
  if (v.length <= 8) return `${v.length} caracteres`;
  return `${v.slice(0, 4)}…${v.slice(-4)} (${v.length} caracteres)`;
}

// Todo clique que sai da vitrine leva um subId terminado em "site" (ex.: "site", "achadosite"),
// para o relatório da Shopee separar o que veio do site. Valores antigos como "bio" viram "site".
export function siteSubId(base = "") {
  let b = String(base || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (!b || b === "bio") b = "";
  if (!b.endsWith("site")) b += "site";
  return b.slice(-50);
}

export function hasShopeeApi() {
  return Boolean(clean(process.env.SHOPEE_APP_ID) && clean(process.env.SHOPEE_APP_SECRET));
}

// Assinatura oficial: SHA256(appId + timestamp + payload + secret)
async function gql(query) {
  const appId = clean(process.env.SHOPEE_APP_ID);
  const secret = clean(process.env.SHOPEE_APP_SECRET);
  const payload = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const signature = createHash("sha256").update(`${appId}${ts}${payload}${secret}`).digest("hex");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `SHA256 Credential=${appId}, Timestamp=${ts}, Signature=${signature}`,
    },
    body: payload,
    cache: "no-store",
  });
  const json = await res.json();
  if (json.errors?.length) {
    let msg = "Shopee API: " + json.errors[0].message;
    // Credencial recusada: mostra só pedaços das chaves (nunca a chave inteira) para conferir no painel
    if (/credential|10020/i.test(msg)) msg += ` [chaves usadas: App ID ${mask(appId)} · Secret ${mask(secret)}]`;
    throw new Error(msg);
  }
  return json.data;
}

// Procura shopId/itemId em qualquer texto (URL, URL codificada dentro de outra, HTML da página).
// Formatos: Nome-i.SHOP.ITEM | /product/SHOP/ITEM | /opaanlp/SHOP/ITEM | ?shopid=&itemid= | "shopid":X,"itemid":Y
export function parseShopeeIds(text) {
  if (!text) return null;
  let t = String(text);
  for (let i = 0; i < 3; i++) { // desfaz codificação em camadas (links dentro de links)
    try { const d = decodeURIComponent(t); if (d === t) break; t = d; } catch { break; }
  }
  let m = t.match(/-i\.(\d{3,})\.(\d{3,})/);
  if (m) return { shopId: m[1], itemId: m[2] };
  m = t.match(/\/(?:product|opaanlp)\/(\d{3,})\/(\d{3,})/);
  if (m) return { shopId: m[1], itemId: m[2] };
  const s = t.match(/shop_?id["'=:\s]+(\d{3,})/i);
  const it = t.match(/item_?id["'=:\s]+(\d{3,})/i);
  if (s && it) return { shopId: s[1], itemId: it[1] };
  return null;
}

export async function shopeeProduct({ shopId, itemId }) {
  const data = await gql(`{
    productOfferV2(shopId: ${Number(shopId)}, itemId: ${Number(itemId)}, limit: 1) {
      nodes {
        itemId shopId productName imageUrl price priceMin priceMax
        priceDiscountRate offerLink productLink commissionRate shopName sales ratingStar
      }
    }
  }`);
  return data?.productOfferV2?.nodes?.[0] || null;
}

export async function shopeeShortLink(originUrl) {
  const sub = siteSubId(process.env.SHOPEE_SUB_ID);
  const data = await gql(`mutation {
    generateShortLink(input: { originUrl: ${JSON.stringify(originUrl)}, subIds: [${JSON.stringify(sub)}] }) { shortLink }
  }`);
  return data?.generateShortLink?.shortLink || null;
}
