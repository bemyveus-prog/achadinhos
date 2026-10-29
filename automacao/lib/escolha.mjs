import { searchOffers } from "./shopee.mjs";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Normaliza o produto da API num formato só, com números de verdade
export function normalize(p) {
  const commission = num(p.commissionRate); // ex: 0.115 = 11,5%
  const price = num(p.priceMin || p.price);
  const discount = num(p.priceDiscountRate); // ex: 45 = 45%
  const original = price && discount > 0 && discount < 100
    ? Math.round((price / (1 - discount / 100)) * 100) / 100
    : null;
  return {
    itemId: String(p.itemId),
    shopId: String(p.shopId),
    name: String(p.productName || "").trim(),
    imageUrl: p.imageUrl,
    price,
    originalPrice: original,
    discount,
    commission,
    sellerCommission: num(p.sellerCommissionRate),
    sales: num(p.sales),
    rating: num(p.ratingStar),
    shopName: p.shopName || "",
    offerLink: p.offerLink,
    productLink: p.productLink,
  };
}

// Pontuação: comissão pesa mais, mas vendas e nota evitam produto ruim com comissão alta
export function score(p) {
  return p.commission * (1 + Math.log10(Math.max(p.sales, 1))) * (p.rating / 5) * (p.price > 0 ? 1 : 0);
}

export function passes(p, cfg) {
  if (!p.imageUrl || !p.name) return false;
  if (p.commission < cfg.minCommission) return false;
  if (p.rating < cfg.minRating) return false;
  if (p.sales < cfg.minSales) return false;
  if (cfg.minPrice && p.price < cfg.minPrice) return false;
  if (cfg.maxPrice && p.price > cfg.maxPrice) return false;
  const name = p.name.toLowerCase();
  if (cfg.blockWords.some((w) => w && name.includes(w))) return false;
  return true;
}

// Palavra-chave do dia: gira a lista um item por dia (vazio = todos os produtos)
export function keywordOfTheDay(list, date = new Date()) {
  if (!list.length) return "";
  const day = Math.floor(date.getTime() / 86400000);
  return list[day % list.length];
}

export async function pickProduct(cfg, alreadyPicked, log = console.log) {
  const keyword = keywordOfTheDay(cfg.keywords);
  log(`Buscando ofertas${keyword ? ` para "${keyword}"` : ""} (maior comissão primeiro)...`);
  const seen = new Map();
  for (let page = 1; page <= cfg.pages; page++) {
    const { nodes, pageInfo } = await searchOffers({ keyword, page, limit: 50 });
    for (const raw of nodes || []) {
      const p = normalize(raw);
      if (!seen.has(p.itemId)) seen.set(p.itemId, p);
    }
    if (!pageInfo?.hasNextPage) break;
  }
  const all = [...seen.values()];
  const ok = all.filter((p) => passes(p, cfg) && !alreadyPicked.has(p.itemId));
  ok.sort((a, b) => score(b) - score(a));
  log(`${all.length} produtos lidos, ${ok.length} passaram nos filtros.`);
  return { pick: ok[0] || null, runnersUp: ok.slice(1, 4), keyword };
}
