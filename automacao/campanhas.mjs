#!/usr/bin/env node
// Campanhas oficiais da Shopee ("Ofertas da Shopee" do painel de afiliados) na vitrine.
// Busca pela API (shopeeOfferV2), gera o link de afiliado com subId "campanhasite" e grava:
//   • cada campanha como um card na faixa "Cupons do momento" (sem código, botão "Abrir")
//   • as 3 de maior comissão também como banner no topo
// Tudo some sozinho quando a campanha termina (fim informado pela API).
//
//   node campanhas.mjs             busca e grava (não repete as que já estão)
//   node campanhas.mjs --simular   só mostra o que gravaria

import { createClient } from "@supabase/supabase-js";
import { gql, hasShopeeApi, shortLink } from "./lib/shopee.mjs";

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const env = (k, d) => (process.env[k] ?? "").trim() || d;
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const pct = (v) => (Number(v) * 100).toFixed(1).replace(".", ",") + "%";

export const CATEGORY = "Campanhas Shopee";
const BANNER_PREFIX = "Campanha Shopee: ";
const MAX_CAMPANHAS = Number(env("CAMPANHAS_MAX", "12"));
const MAX_BANNERS = Number(env("CAMPANHAS_BANNERS", "3"));

// Campos pedidos à API. Se a conta não tiver algum, ele sai da lista e a busca é refeita.
let FIELDS = ["offerName", "imageUrl", "offerLink", "originalLink", "commissionRate", "periodStartTime", "periodEndTime", "offerType", "collectionId", "categoryId"];

async function fetchCampaigns() {
  const all = [];
  for (let page = 1; page <= 5; page++) {
    let data;
    for (let tries = 0; tries < FIELDS.length; tries++) {
      try {
        data = await gql(`{ shopeeOfferV2(page: ${page}, limit: 50) { nodes { ${FIELDS.join(" ")} } pageInfo { page limit hasNextPage } } }`);
        break;
      } catch (e) {
        const bad = FIELDS.find((f) => new RegExp(`\\b${f}\\b`).test(e.message));
        if (!bad || ["offerName", "offerLink"].includes(bad)) throw e;
        log(`  campo "${bad}" não existe nesta conta; seguindo sem ele`);
        FIELDS = FIELDS.filter((f) => f !== bad);
      }
    }
    const res = data?.shopeeOfferV2;
    all.push(...(res?.nodes || []));
    if (!res?.pageInfo?.hasNextPage) break;
  }
  return all;
}

const toDate = (v) => {
  const n = Number(v);
  if (!n) return null;
  const d = new Date(n > 1e12 ? n : n * 1000); // a API manda em segundos
  return d.getFullYear() > 2100 ? null : d; // "31/12/2999" = oferta permanente, sem fim
};

// Ofertas permanentes de categoria vêm como "- - Women Clothes"; viram nome em português
const PT = {
  "health": "Saúde", "beauty": "Beleza", "fashion accessories": "Acessórios de Moda", "home appliances": "Eletrodomésticos",
  "men clothes": "Moda Masculina", "men shoes": "Calçados Masculinos", "mobile & gadgets": "Celulares e Acessórios",
  "travel & luggage": "Viagem e Malas", "women bags": "Bolsas Femininas", "women clothes": "Moda Feminina",
  "food delivery": "Delivery de Comida", "women shoes": "Calçados Femininos", "men bags": "Bolsas Masculinas",
  "home & living": "Casa e Decoração", "baby & kids fashion": "Moda Infantil", "mom & baby": "Mães e Bebês",
  "toys": "Brinquedos", "sports & outdoors": "Esportes", "computers & accessories": "Informática",
  "watches": "Relógios", "pets": "Pets", "automotive": "Automotivo", "groceries": "Mercado", "audio": "Áudio",
  "cameras & drones": "Câmeras e Drones", "gaming & consoles": "Games", "books & magazines": "Livros",
  "stationery": "Papelaria", "home improvement": "Ferramentas e Construção", "hobbies & collections": "Hobbies",
  "muslim fashion": "Moda Modesta", "jewelry": "Joias", "motorcycles": "Motos", "tickets & vouchers": "Vouchers",
};
function cleanName(raw) {
  const s = String(raw || "").replace(/^[\s-]+/, "").trim();
  if (s === String(raw || "").trim()) return { name: s, category: false };
  return { name: `Ofertas de ${PT[s.toLowerCase()] || s}`, category: true };
}

async function main() {
  if (!hasShopeeApi()) throw new Error("Configure SHOPEE_APP_ID e SHOPEE_APP_SECRET");
  const simulate = flag("--simular");
  const now = Date.now();

  log("Buscando as Ofertas da Shopee (campanhas)...");
  const raw = await fetchCampaigns();
  const list = raw
    .map((c) => ({
      ...cleanName(c.offerName),
      image: c.imageUrl || null,
      link: c.offerLink,
      original: c.originalLink || null,
      commission: Number(c.commissionRate) || 0,
      start: toDate(c.periodStartTime),
      end: toDate(c.periodEndTime),
    }))
    // links permanentes de categoria só entram se a variável CAMPANHAS_CATEGORIAS=1
    .filter((c) => !c.category || env("CAMPANHAS_CATEGORIAS", "") === "1")
    .filter((c) => c.name && c.link && (!c.end || c.end.getTime() > now + 3600000) && (!c.start || c.start.getTime() <= now))
    // campanhas de verdade (com data de fim) primeiro, depois as de categoria; dentro, maior comissão
    .sort((a, b) => (a.category - b.category) || (!!b.end - !!a.end) || (b.commission - a.commission))
    .slice(0, MAX_CAMPANHAS);

  if (simulate) {
    log("Tudo o que a Shopee mandou:");
    for (const c of raw) log("  " + JSON.stringify({ ...c, imageUrl: c.imageUrl ? "sim" : null }));
  }
  log(`${raw.length} campanhas recebidas, ${list.length} ativas escolhidas:`);
  for (const c of list) log(`  ${pct(c.commission)} · ${c.name}${c.end ? ` · até ${c.end.toLocaleDateString("pt-BR")}` : " · permanente"}${c.image ? "" : " · (sem imagem)"}`);
  if (simulate || !list.length) { if (simulate) log("Simulação: nada gravado."); return; }

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: have } = await sb.from("offers").select("title").eq("category", CATEGORY).eq("active", true);
  const already = new Set((have || []).map((o) => o.title));
  const { data: haveB } = await sb.from("banners").select("title").like("title", `${BANNER_PREFIX}%`);
  const alreadyB = new Set((haveB || []).map((b) => b.title));

  let added = 0, banners = 0;
  for (const [i, c] of list.entries()) {
    const title = c.name.slice(0, 120);
    let link = c.link;
    try { link = (await shortLink(c.original || c.link, env("CAMPANHA_SUB_ID", "campanha"))) || link; }
    catch (e) { log(`  link curto não gerado para "${c.name}" (${e.message}); usando o link da API`); }

    if (!already.has(title)) {
      const { error } = await sb.from("offers").insert({
        kind: "cupom",
        title,
        description: "Oferta oficial da Shopee",
        link,
        platform: "shopee",
        category: CATEGORY,
        active: true,
        expires_at: c.end ? c.end.toISOString() : null,
      });
      if (error) log(`  erro ao gravar "${c.name}": ${error.message}`);
      else added++;
    }

    const bTitle = (BANNER_PREFIX + c.name).slice(0, 200);
    if (i < MAX_BANNERS && c.image && !alreadyB.has(bTitle) && /^https:\/\//.test(link)) {
      const { error } = await sb.from("banners").insert({
        image_url: c.image,
        link,
        title: bTitle,
        sort: 10 + i,
        active: true,
        ends_at: c.end ? c.end.toISOString() : null,
      });
      if (error) log(`  banner de "${c.name}" não criado: ${error.message}`);
      else banners++;
    }
  }
  log(`Vitrine: ${added} campanhas novas em "Cupons do momento" e ${banners} banners novos (subId campanhasite).`);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
