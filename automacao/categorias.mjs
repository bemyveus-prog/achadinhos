#!/usr/bin/env node
// Produtos de comissão alta dentro das categorias da Shopee (as "Ofertas da Shopee" de categoria
// do painel de afiliados). Para cada categoria, pega os produtos ordenados por comissão, filtra
// por nota e vendas e coloca os melhores na vitrine, com subId "categoriasite".
//
//   node categorias.mjs             escolhe e grava (não repete o que já está)
//   node categorias.mjs --simular   só mostra o que gravaria
//
// Variáveis: CATEGORIAS_IDS (ex.: "100017,100532"), POR_CATEGORIA (4), CAT_MIN_COMISSAO (20),
//            CAT_MIN_NOTA (4.5), CAT_MIN_VENDAS (30), DIAS_NA_VITRINE (15)

import { createClient } from "@supabase/supabase-js";
import { hasShopeeApi, searchOffers, shortLink } from "./lib/shopee.mjs";
import { normalize, score } from "./lib/escolha.mjs";
import { brl, salesLabel } from "./lib/textos.mjs";
import { hasTelegram, notify, sendText } from "./lib/telegram.mjs";

const args = process.argv.slice(2);
const env = (k, d) => (process.env[k] ?? "").trim() || d;
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const pct = (v) => (v * 100).toFixed(1).replace(".", ",") + "%";

// id da categoria na Shopee → nome do chip na vitrine
export const CATEGORIAS = {
  100017: "Moda Feminina",
  100532: "Calçados Femininos",
  100016: "Bolsas Femininas",
  100009: "Acessórios",
  100630: "Beleza",
  100001: "Saúde",
  100636: "Casa",
  100631: "Pets",
  100633: "Moda Infantil",
  100011: "Moda Masculina",
  100013: "Celulares e Acessórios",
  100010: "Eletrodomésticos",
  100637: "Esportes",
  100534: "Relógios",
  100535: "Áudio",
};
const PADRAO = "100017,100532,100016,100009,100630,100636";

// Modo "pouco disputado": comissão alta, poucas vendas (pouca gente divulgando ainda),
// nota boa e oferta de comissão recente. É estimativa: a Shopee não informa quantos afiliados há.
const NICHO = args.includes("--pouco-disputado") || env("MODO_CATEGORIAS", "") === "pouco-disputado";

const cfg = NICHO ? {
  ids: env("CATEGORIAS_IDS", PADRAO).split(/[\s,;]+/).filter(Boolean),
  per: Number(env("POR_CATEGORIA", "4")),
  minCommission: Number(env("CAT_MIN_COMISSAO", "30")) / 100,
  minRating: Number(env("CAT_MIN_NOTA", "4.7")),
  minSales: Number(env("CAT_MIN_VENDAS", "5")),
  maxSales: Number(env("CAT_MAX_VENDAS", "300")),
  days: Number(env("DIAS_NA_VITRINE", "15")),
} : {
  ids: env("CATEGORIAS_IDS", PADRAO).split(/[\s,;]+/).filter(Boolean),
  per: Number(env("POR_CATEGORIA", "4")),
  minCommission: Number(env("CAT_MIN_COMISSAO", "20")) / 100,
  minRating: Number(env("CAT_MIN_NOTA", "4.5")),
  minSales: Number(env("CAT_MIN_VENDAS", "30")),
  days: Number(env("DIAS_NA_VITRINE", "15")),
};

const ageDays = (p) => (p.offerStart ? (Date.now() - p.offerStart.getTime()) / 86400000 : null);
// pouco disputado: comissão e nota pesam; oferta recente ganha bônus; vendas quase não importam
const nichoScore = (p) => p.commission * (p.rating / 5) * (1 + Math.max(0, 30 - (ageDays(p) ?? 30)) / 30) * (1 + Math.log10(Math.max(p.sales, 1)) / 4);
const rank = (p) => (NICHO ? nichoScore(p) : score(p));

function reject(p) {
  if (!p.imageUrl || !p.name || !p.price) return "sem foto/preço";
  if (p.commission < cfg.minCommission) return "comissão baixa";
  if (p.rating && p.rating < cfg.minRating) return "nota baixa";
  if (p.sales < cfg.minSales) return "poucas vendas";
  if (cfg.maxSales && p.sales > cfg.maxSales) return "muito vendido (disputado)";
  if (NICHO && !p.rating) return "sem avaliação";
  return null;
}

async function main() {
  if (!hasShopeeApi()) throw new Error("Configure SHOPEE_APP_ID e SHOPEE_APP_SECRET");
  const simulate = args.includes("--simular");
  const sb = simulate ? null : createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  let existing = new Set();
  if (sb) {
    const { data, error } = await sb.from("offers").select("description").like("description", "cat:%");
    if (error) throw new Error(`Supabase: ${error.message}`);
    existing = new Set((data || []).map((o) => o.description));
  }

  log(NICHO ? "Modo POUCO DISPUTADO (estimativa: comissão alta, poucas vendas, nota boa, oferta recente)" : "Modo padrão (mais vendidos com comissão alta)");
  log(`Filtros: comissão ≥ ${pct(cfg.minCommission)}, nota ≥ ${cfg.minRating}, vendas ≥ ${cfg.minSales}${cfg.maxSales ? ` e ≤ ${cfg.maxSales}` : ""}, ${cfg.per} por categoria`);
  const chosen = [];
  for (const id of cfg.ids) {
    const nome = CATEGORIAS[id] || `Categoria ${id}`;
    const seen = new Map();
    for (const page of [1, 2, 3]) {
      let res = null;
      for (let t = 1; t <= 3 && !res; t++) { // a API às vezes devolve "System Error"; tenta de novo
        try { res = await searchOffers({ catId: id, sortType: 5, page, limit: 50 }); }
        catch (e) { if (t === 3) log(`  ${nome}: página ${page} falhou (${e.message})`); else await new Promise((r) => setTimeout(r, 2000 * t)); }
      }
      if (!res) break;
      for (const n of res.nodes || []) { const p = normalize(n); if (!seen.has(p.itemId)) seen.set(p.itemId, p); }
      if (!res.pageInfo?.hasNextPage) break;
    }
    const reasons = {};
    const ok = [...seen.values()].filter((p) => {
      const r = reject(p);
      if (r) reasons[r] = (reasons[r] || 0) + 1;
      return !r && !existing.has(`cat:${p.itemId}`);
    }).sort((a, b) => rank(b) - rank(a)).slice(0, cfg.per);
    const why = Object.entries(reasons).map(([r, n]) => `${n} ${r}`).join(", ");
    log(`${nome} (${id}): ${seen.size} lidos, ${ok.length} escolhidos${why ? ` · descartados: ${why}` : ""}`);
    for (const p of ok) {
      const age = ageDays(p);
      const ofe = age == null ? "" : ` · comissão desde ${p.offerStart.toLocaleDateString("pt-BR")} (${Math.round(age)} dias)`;
      const loja = p.sellerCommission ? ` (loja ${pct(p.sellerCommission)})` : "";
      log(`  ${pct(p.commission)}${loja} · ${brl(p.price)} · ${salesLabel(p.sales)} vendas · nota ${p.rating || "-"}${ofe} · ${p.name.slice(0, 55)}`);
      chosen.push({ nome, p });
    }
  }

  if (simulate) { log(`Simulação: ${chosen.length} produtos, nada gravado.`); return; }

  const expires = new Date(Date.now() + cfg.days * 86400000).toISOString();
  let added = 0;
  for (const { nome, p } of chosen) {
    let link = p.offerLink;
    try { link = (await shortLink(p.productLink, env("CATEGORIA_SUB_ID", "categoria"))) || link; }
    catch (e) { log(`  link curto não gerado (${e.message})`); }
    const { data: row, error } = await sb.from("offers").insert({
      kind: "produto",
      title: p.name.slice(0, 120),
      description: `cat:${p.itemId}`,
      image_url: p.imageUrl,
      price: p.price,
      original_price: p.originalPrice,
      link,
      platform: "shopee",
      category: nome,
      active: true,
      expires_at: expires,
    }).select("id,title,price,original_price,image_url,link,category").single();
    if (error) { log(`  erro ao gravar: ${error.message}`); continue; }
    added++;
    if (added === 1 && hasTelegram()) await sendText(`📦 <b>Produtos novos na vitrine (${chosen.length})</b>`, { html: true }).catch(() => {});
    await notify(row, p, "Produtos por categoria", log);
  }
  log(`Vitrine: ${added} produtos novos por categoria (subId categoriasite, saem em ${cfg.days} dias).`);
}

main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
