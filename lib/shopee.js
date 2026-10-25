import { createHash } from "crypto";

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

// Credenciais da variável de ambiente (as suas, da loja principal)
export function envCreds() {
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_APP_SECRET;
  return appId && secret ? { appId, secret, subId: process.env.SHOPEE_SUB_ID || "bio" } : null;
}

// Assinatura oficial: SHA256(appId + timestamp + payload + secret)
async function gql(query, creds) {
  if (!creds) throw new Error("API da Shopee não configurada");
  const payload = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000);
  const signature = createHash("sha256").update(`${creds.appId}${ts}${payload}${creds.secret}`).digest("hex");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `SHA256 Credential=${creds.appId}, Timestamp=${ts}, Signature=${signature}`,
    },
    body: payload,
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error("Shopee API: " + json.errors[0].message);
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

export async function shopeeProduct({ shopId, itemId }, creds) {
  const data = await gql(`{
    productOfferV2(shopId: ${Number(shopId)}, itemId: ${Number(itemId)}, limit: 1) {
      nodes {
        itemId shopId productName imageUrl price priceMin priceMax
        priceDiscountRate offerLink productLink commissionRate shopName sales ratingStar
      }
    }
  }`, creds);
  return data?.productOfferV2?.nodes?.[0] || null;
}

export async function shopeeShortLink(originUrl, creds) {
  const sub = String(creds?.subId || "bio").replace(/[^a-zA-Z0-9]/g, "").slice(0, 50) || "bio";
  const data = await gql(`mutation {
    generateShortLink(input: { originUrl: ${JSON.stringify(originUrl)}, subIds: [${JSON.stringify(sub)}] }) { shortLink }
  }`, creds);
  return data?.generateShortLink?.shortLink || null;
}
