#!/usr/bin/env node
// Kit Emergência 72h: escolhe na API de afiliados da Shopee um produto bom para cada item do kit
// e coloca na vitrine na categoria "Kit Emergência" (chip de filtro + busca "kit").
//
//   node kit.mjs             escolhe e grava na vitrine (não repete o que já está lá)
//   node kit.mjs --simular   só mostra o que escolheria, sem gravar
//   node kit.mjs --banner    também cria o banner "Kit 72 horas" no topo da vitrine

import { createClient } from "@supabase/supabase-js";
import { hasShopeeApi, searchOffers, shortLink } from "./lib/shopee.mjs";
import { normalize, score } from "./lib/escolha.mjs";
import { brl, salesLabel } from "./lib/textos.mjs";

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const env = (k, d) => (process.env[k] ?? "").trim() || d;
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const pct = (v) => (v * 100).toFixed(1).replace(".", ",") + "%";

export const CATEGORY = "Kit Emergência";

// Itens do kit (orientações das Defesas Civis de SP/PR/SC e guias de outros países).
// "deve" confere no título que é mesmo o item; "nao" descarta acessórios e coisas parecidas.
export const KIT = [
  { item: "Lanterna recarregável", busca: ["lanterna recarregavel led", "lanterna tatica recarregavel"], deve: /lanterna/i, nao: /capa|suporte|bike|bicicleta|cabeça/i },
  { item: "Rádio a pilha", busca: ["radio portatil pilha am fm", "radio manivela solar"], deve: /r[aá]dio/i, nao: /comunicador|walkie|ht |capa|antena/i },
  { item: "Carregador portátil (power bank)", busca: ["power bank 20000mah", "carregador portatil power bank"], deve: /power ?bank|carregador port[aá]til|bateria externa/i, nao: /capa|case|cabo apenas/i },
  { item: "Kit de primeiros socorros", busca: ["kit primeiros socorros", "bolsa primeiros socorros completa"], deve: /primeiros socorros/i, nao: /livro|curso|boneco/i },
  { item: "Apito de emergência", busca: ["apito emergencia sobrevivencia", "apito de resgate"], deve: /apito/i, nao: /cachorro|c[aã]o|pet|treino/i },
  { item: "Manta térmica de emergência", busca: ["manta termica emergencia aluminizada", "cobertor termico emergencia"], deve: /(manta|cobertor).*(t[eé]rmic|alumin)|(t[eé]rmic|alumin).*(manta|cobertor)/i, nao: /cavalo|pet|beb[eê]/i },
  { item: "Galão de água dobrável", busca: ["galao agua dobravel", "reservatorio agua dobravel camping"], deve: /gal[aã]o|reservat[oó]rio|bombona|recipiente/i, nao: /bebedouro|filtro|pet|garrafa t[eé]rmica/i },
  { item: "Bolsa impermeável para documentos", busca: ["bolsa impermeavel documentos", "saco estanque impermeavel"], deve: /imperme[aá]vel|estanque|prova d.?[aá]gua/i, nao: /mochila escolar|capa de chuva/i },
  { item: "Pilhas recarregáveis", busca: ["pilha recarregavel aa", "pilhas recarregaveis aa carregador"], deve: /pilha/i, nao: /lanterna|controle/i },
];

const cfg = {
  minRating: Number(env("KIT_MIN_NOTA", "4.5")),
  minSales: Number(env("KIT_MIN_VENDAS", "100")),
  maxPrice: Number(env("KIT_PRECO_MAX", "250")),
};

function db() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

async function candidates(k) {
  const seen = new Map();
  for (const keyword of k.busca) {
    for (const sortType of [5, 2]) { // maior comissão e mais vendidos
      try {
        const { nodes = [] } = await searchOffers({ keyword, sortType, limit: 50 });
        for (const n of nodes) {
          const p = normalize(n);
          if (!seen.has(p.itemId)) seen.set(p.itemId, p);
        }
      } catch (e) {
        log(`  busca "${keyword}" falhou: ${e.message}`);
      }
    }
  }
  return [...seen.values()];
}

function fits(k, p) {
  if (!p.imageUrl || !p.name || !p.price) return "sem foto/preço";
  if (!k.deve.test(p.name)) return "não é o item";
  if (k.nao?.test(p.name)) return "acessório/parecido";
  if (p.rating < cfg.minRating) return "nota baixa";
  if (p.sales < cfg.minSales) return "poucas vendas";
  if (cfg.maxPrice && p.price > cfg.maxPrice) return "preço alto";
  return null;
}

async function main() {
  if (!hasShopeeApi()) throw new Error("Configure SHOPEE_APP_ID e SHOPEE_APP_SECRET");
  const simulate = flag("--simular");
  const sb = simulate ? null : db();

  // o que já está no kit (não duplica ao rodar de novo)
  let existing = new Set();
  if (sb) {
    const { data, error } = await sb.from("offers").select("description").eq("category", CATEGORY);
    if (error) throw new Error(`Supabase: ${error.message}`);
    existing = new Set((data || []).map((o) => o.description).filter(Boolean));
  }

  const chosen = [];
  for (const k of KIT) {
    log(`${k.item}:`);
    const list = await candidates(k);
    const reasons = {};
    const ok = list.filter((p) => {
      const r = fits(k, p);
      if (r) reasons[r] = (reasons[r] || 0) + 1;
      return !r;
    });
    ok.sort((a, b) => score(b) - score(a));
    const pick = ok.find((p) => !existing.has(`kit:${p.itemId}`));
    if (!pick) {
      const why = Object.entries(reasons).map(([r, n]) => `${n} ${r}`).join(", ");
      log(`  nenhum produto bom (${list.length} lidos${why ? `: ${why}` : ""})`);
      continue;
    }
    log(`  ${pick.name.slice(0, 70)}`);
    log(`  ${brl(pick.price)} · comissão ${pct(pick.commission)} · ${salesLabel(pick.sales)} vendas · nota ${pick.rating}`);
    chosen.push({ k, p: pick });
  }

  if (simulate) {
    log(`Simulação: ${chosen.length} itens escolhidos, nada gravado.`);
    return;
  }

  let added = 0;
  for (const { k, p } of chosen) {
    let link = p.offerLink;
    try { link = (await shortLink(p.productLink, env("KIT_SUB_ID", "kit"))) || link; }
    catch (e) { log(`  link curto não gerado para ${k.item} (${e.message})`); }
    const { data, error } = await sb.from("offers").insert({
      kind: "produto",
      title: p.name.slice(0, 120),
      description: `kit:${p.itemId}`,
      image_url: p.imageUrl,
      price: p.price,
      original_price: p.originalPrice,
      link,
      platform: "shopee",
      category: CATEGORY,
      badge: k.item.split(" (")[0],
      active: true,
    }).select("id").single();
    if (error) { log(`  erro ao gravar ${k.item}: ${error.message}`); continue; }
    log(`Na vitrine: #${data.id} ${k.item}`);
    added++;
  }
  log(`Kit Emergência: ${added} itens novos na vitrine (categoria "${CATEGORY}").`);

  if (flag("--banner")) {
    const { createKitBanner } = await import("./lib/kitbanner.mjs");
    await createKitBanner(sb, log);
  }
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
