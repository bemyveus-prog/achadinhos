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

// Motivo de descarte (null = passou)
export function rejectReason(p, cfg) {
  if (!p.imageUrl || !p.name) return "sem foto/nome";
  if (p.commission < cfg.minCommission) return "comissão baixa";
  if (p.rating < cfg.minRating) return "nota baixa";
  if (p.sales < cfg.minSales) return "poucas vendas";
  if (cfg.minPrice && p.price < cfg.minPrice) return "preço baixo";
  if (cfg.maxPrice && p.price > cfg.maxPrice) return "preço alto";
  const name = p.name.toLowerCase();
  if (cfg.blockWords.some((w) => w && name.includes(w))) return "palavra bloqueada";
  return null;
}

export function passes(p, cfg) {
  return rejectReason(p, cfg) === null;
}

// Categorias usadas no rodízio quando PALAVRAS_CHAVE está vazia
export const DEFAULT_KEYWORDS = [
  "casa", "cozinha", "organizador", "skincare", "maquiagem", "moda feminina", "acessorios",
  "celular", "pet", "fitness", "infantil", "decoracao", "ferramentas", "banheiro", "cabelo",
];

// Palavra-chave do dia: gira a lista um item por dia
export function keywordOfTheDay(list, date = new Date()) {
  if (!list.length) return "";
  const day = Math.floor(date.getTime() / 86400000);
  return list[day % list.length];
}

const SORT_COMMISSION = 5; // maior comissão
const SORT_SALES = 2; // mais vendidos

export async function pickProduct(cfg, alreadyPicked, log = console.log) {
  const keyword = keywordOfTheDay(cfg.keywords.length ? cfg.keywords : DEFAULT_KEYWORDS);
  // Lê várias listas: geral e da categoria do dia, por comissão e por vendas.
  // Só "maior comissão" traz quase sempre os mesmos produtos, e quase todos com poucas vendas.
  const sources = [
    { keyword: "", sortType: SORT_COMMISSION },
    { keyword, sortType: SORT_COMMISSION },
    { keyword, sortType: SORT_SALES },
    { keyword: "", sortType: SORT_SALES },
  ];
  log(`Buscando ofertas (geral + "${keyword}", por comissão e por vendas)...`);
  const seen = new Map();
  for (const src of sources) {
    for (let page = 1; page <= cfg.pages; page++) {
      let res;
      try { res = await searchOffers({ ...src, page, limit: 50 }); }
      catch (e) { log(`  busca falhou (${src.keyword || "geral"}, ordem ${src.sortType}): ${e.message}`); break; }
      for (const raw of res.nodes || []) {
        const p = normalize(raw);
        if (!seen.has(p.itemId)) seen.set(p.itemId, p);
      }
      if (!res.pageInfo?.hasNextPage) break;
    }
  }
  const all = [...seen.values()].filter((p) => !alreadyPicked.has(p.itemId));
  const repeated = seen.size - all.length;

  // Se ninguém passar, afrouxa os filtros aos poucos (nunca abaixo de metade da comissão mínima)
  const levels = [
    { label: "filtros normais", cfg },
    { label: "filtros mais leves", cfg: { ...cfg, minCommission: cfg.minCommission * 0.7, minSales: Math.round(cfg.minSales / 3) } },
    { label: "filtros mínimos", cfg: { ...cfg, minCommission: cfg.minCommission * 0.5, minSales: Math.round(cfg.minSales / 10), minRating: Math.max(cfg.minRating - 0.2, 4) } },
  ];
  for (const lvl of levels) {
    const ok = all.filter((p) => passes(p, lvl.cfg));
    if (ok.length) {
      ok.sort((a, b) => score(b) - score(a));
      log(`${seen.size} produtos lidos (${repeated} já usados), ${ok.length} passaram com ${lvl.label}.`);
      return { pick: ok[0], runnersUp: ok.slice(1, 4), keyword };
    }
  }

  const reasons = {};
  for (const p of all) {
    const r = rejectReason(p, cfg);
    reasons[r] = (reasons[r] || 0) + 1;
  }
  log(`${seen.size} produtos lidos (${repeated} já usados), nenhum passou. Motivos: ${Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  return { pick: null, runnersUp: [], keyword };
}
