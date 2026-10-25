import { createHash } from "crypto";

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

export function hasShopeeApi() {
  return Boolean(process.env.SHOPEE_APP_ID && process.env.SHOPEE_APP_SECRET);
}

// Assinatura oficial: SHA256(appId + timestamp + payload + secret)
async function gql(query) {
  const appId = process.env.SHOPEE_APP_ID;
  const secret = process.env.SHOPEE_APP_SECRET;
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
  if (json.errors?.length) throw new Error("Shopee API: " + json.errors[0].message);
  return json.data;
}

// Aceita: shopee.com.br/Nome-i.SHOP.ITEM | /product/SHOP/ITEM | ?shopid=&itemid=
export function parseShopeeIds(url) {
  let m = url.match(/-i\.(\d+)\.(\d+)/);
  if (m) return { shopId: m[1], itemId: m[2] };
  m = url.match(/\/product\/(\d+)\/(\d+)/);
  if (m) return { shopId: m[1], itemId: m[2] };
  try {
    const u = new URL(url);
    const s = u.searchParams.get("shopid") || u.searchParams.get("shop_id");
    const i = u.searchParams.get("itemid") || u.searchParams.get("item_id");
    if (s && i) return { shopId: s, itemId: i };
  } catch {}
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
  const sub = (process.env.SHOPEE_SUB_ID || "bio").replace(/[^a-zA-Z0-9]/g, "").slice(0, 50) || "bio";
  const data = await gql(`mutation {
    generateShortLink(input: { originUrl: ${JSON.stringify(originUrl)}, subIds: [${JSON.stringify(sub)}] }) { shortLink }
  }`);
  return data?.generateShortLink?.shortLink || null;
}
