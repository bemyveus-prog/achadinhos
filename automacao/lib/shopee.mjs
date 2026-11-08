import { createHash } from "crypto";

const ENDPOINT = "https://open-api.affiliate.shopee.com.br/graphql";

// Campos já usados pela vitrine (lib/shopee.js), que sabemos que funcionam
const BASE_FIELDS = `itemId shopId productName imageUrl price priceMin priceMax
  priceDiscountRate offerLink productLink commissionRate shopName sales ratingStar`;
// Campos extras (separação comissão Shopee x comissão da marca). Se a API recusar, cai pro básico.
const EXTRA_FIELDS = `sellerCommissionRate shopeeCommissionRate periodStartTime periodEndTime`;

export function hasShopeeApi() {
  return Boolean(process.env.SHOPEE_APP_ID && process.env.SHOPEE_APP_SECRET);
}

// Assinatura oficial: SHA256(appId + timestamp + payload + secret)
export async function gql(query) {
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
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error("Shopee API: " + json.errors[0].message);
  return json.data;
}

let useExtra = true;

// sortType 5 = maior comissão primeiro
export async function searchOffers({ keyword = "", page = 1, limit = 50, sortType = 5, catId = null }) {
  const args = [
    keyword ? `keyword: ${JSON.stringify(keyword)}` : null,
    catId ? `productCatId: ${Number(catId)}` : null,
    `sortType: ${sortType}`,
    `page: ${page}`,
    `limit: ${limit}`,
  ].filter(Boolean).join(", ");
  const build = (extra) => `{
    productOfferV2(${args}) {
      nodes { ${BASE_FIELDS} ${extra ? EXTRA_FIELDS : ""} }
      pageInfo { page limit hasNextPage }
    }
  }`;
  try {
    const data = await gql(build(useExtra));
    return data?.productOfferV2 || { nodes: [], pageInfo: {} };
  } catch (e) {
    if (useExtra && /field|campo|cannot query/i.test(e.message)) {
      useExtra = false; // a conta não expõe esses campos: segue só com os básicos
      const data = await gql(build(false));
      return data?.productOfferV2 || { nodes: [], pageInfo: {} };
    }
    throw e;
  }
}

// Todo link que vai para a vitrine termina em "site" (achadosite, kitsite, campanhasite),
// para o relatório da Shopee mostrar que o clique veio do site.
export function siteSubId(base = "") {
  let b = String(base || "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (b === "insta" || b === "bio") b = "";
  if (!b.endsWith("site")) b += "site";
  return b.slice(-50);
}

export async function shortLink(originUrl, subId) {
  const sub = siteSubId(subId);
  const data = await gql(`mutation {
    generateShortLink(input: { originUrl: ${JSON.stringify(originUrl)}, subIds: [${JSON.stringify(sub)}] }) { shortLink }
  }`);
  return data?.generateShortLink?.shortLink || null;
}
