#!/usr/bin/env node
// Achado do dia: escolhe um produto com comissão alta na API de afiliados da Shopee,
// coloca na vitrine da bio (em destaque) e gera o carrossel + legenda.
//
//   npm run achado                 fluxo completo
//   npm run achado -- --sem-vitrine  escolhe e gera o carrossel, mas não grava nada no banco
//   npm run teste -- --foto x.jpg    testa só o carrossel com um produto de exemplo

import path from "path";
import { fileURLToPath } from "url";
import { hasShopeeApi, shortLink } from "./lib/shopee.mjs";
import { pickProduct } from "./lib/escolha.mjs";
import { buildTexts, brl, salesLabel } from "./lib/textos.mjs";
import { renderCarousel } from "./lib/carrossel.mjs";
import { hasDb, pickedItemIds, publishOffer, recordPick } from "./lib/vitrine.mjs";
import { hasTelegram, sendPreview } from "./lib/telegram.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const env = (k, d) => (process.env[k] ?? "").trim() || d;
const list = (k) => env(k, "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const cfg = {
  minCommission: Number(env("MIN_COMISSAO", "10")) / 100,
  minRating: Number(env("MIN_NOTA", "4.6")),
  minSales: Number(env("MIN_VENDAS", "1000")),
  minPrice: Number(env("PRECO_MIN", "0")),
  maxPrice: Number(env("PRECO_MAX", "0")),
  pages: Number(env("PAGINAS", "3")),
  keywords: list("PALAVRAS_CHAVE"),
  blockWords: list("PALAVRAS_BLOQUEADAS"),
};

const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const pct = (v) => (v * 100).toFixed(1).replace(".", ",") + "%";

const TEST_PRODUCT = {
  itemId: "0", shopId: "0",
  name: "Kit Skincare Kokeshi Olhos de Gueixa 15g + Creme Facial Pele de Porcelana 30g Hidratante",
  imageUrl: null, price: 59.9, originalPrice: 99.9, discount: 40, commission: 0.115,
  sellerCommission: 0.08, sales: 12500, rating: 4.9, shopName: "Loja Teste",
};

async function main() {
  const test = flag("--teste");
  const writeDb = !test && !flag("--sem-vitrine") && hasDb();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // 2026-10-29

  // 1. Escolha
  let p, runnersUp = [];
  if (test) {
    if (!opt("--foto")) throw new Error("No modo teste, informe uma foto: npm run teste -- --foto caminho/da/foto.jpg");
    p = { ...TEST_PRODUCT, imageUrl: opt("--foto") };
  } else {
    if (!hasShopeeApi()) throw new Error("Configure SHOPEE_APP_ID e SHOPEE_APP_SECRET no .env");
    const picked = hasDb() ? await pickedItemIds() : new Set();
    const r = await pickProduct(cfg, picked, log);
    if (!r.pick) throw new Error("Nenhum produto passou nos filtros. Baixe MIN_COMISSAO/MIN_VENDAS ou troque as PALAVRAS_CHAVE.");
    p = r.pick;
    runnersUp = r.runnersUp;
  }
  log(`Escolhido: ${p.name}`);
  log(`  comissão ${pct(p.commission)} · ${brl(p.price)} · ${salesLabel(p.sales)} vendas · nota ${p.rating}`);

  // 2. Link de afiliado (subId "insta" para ver no relatório o que veio dos carrosséis)
  let link = p.offerLink;
  if (!test && p.productLink) {
    try { link = (await shortLink(p.productLink, env("SHOPEE_SUB_ID", "insta"))) || link; }
    catch (e) { log(`Link curto não gerado (${e.message}), usando o link de oferta.`); }
  }

  // 3. Textos
  const texts = await buildTexts(p, log);

  // 4. Vitrine
  let offer = null;
  if (writeDb) {
    offer = await publishOffer(p, { link, title: p.name.slice(0, 120), pin: env("FIXAR_NO_TOPO", "sim") !== "nao" });
    log(`Na vitrine como #${offer.id} (em destaque).`);
  } else {
    log("Vitrine não atualizada (modo teste, --sem-vitrine ou Supabase não configurado).");
  }

  const number = offer ? `#${offer.id}` : test ? "#23" : null;
  if (number) texts.legenda = texts.legenda.replace(/Digite o número do produto na busca\.?/i, `Digite ${number} na busca.`);

  // 5. Carrossel
  const outDir = path.resolve(env("PASTA_SAIDA", path.join(HERE, "saida")), `${today}-${p.itemId}`);
  const files = await renderCarousel(p, texts, { outDir, number, handle: env("INSTAGRAM_HANDLE", "") });
  log(`Carrossel salvo em ${outDir}`);

  if (writeDb) await recordPick(p, { offerId: offer?.id, outDir, link });

  // 6. Prévia no Telegram
  if (hasTelegram()) {
    const summary = [
      `🛍 Achado do dia ${number || ""}`.trim(),
      p.name.slice(0, 120),
      `Comissão ${pct(p.commission)} · ${brl(p.price)} · ${salesLabel(p.sales)} vendas · ⭐ ${p.rating}`,
      link ? `Link: ${link}` : "",
      runnersUp.length ? `\nOutras opções:\n${runnersUp.map((r) => `• ${pct(r.commission)} · ${r.name.slice(0, 60)}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
    await sendPreview(files, texts.legenda, summary);
    log("Prévia enviada no Telegram.");
  }
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
