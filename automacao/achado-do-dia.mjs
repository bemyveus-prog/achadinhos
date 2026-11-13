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
import { pickCover } from "./lib/capas.mjs";
import { hasDb, pickedItemIds, publishOffer, recordPick } from "./lib/vitrine.mjs";
import { hasTelegram, sendPreview, sendText } from "./lib/telegram.mjs";
import { hasMeta, publishSocial } from "./lib/social.mjs";
import { BRAND } from "../lib/brand.mjs";

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
    p = { ...r.pick, category: r.keyword };
    runnersUp = r.runnersUp;
  }
  log(`Escolhido: ${p.name}`);
  log(`  comissão ${pct(p.commission)} · ${brl(p.price)} · ${salesLabel(p.sales)} vendas · nota ${p.rating}`);

  // 2. Link de afiliado (subId "achadosite": o clique acontece na vitrine)
  let link = p.offerLink;
  if (!test && p.productLink) {
    try { link = (await shortLink(p.productLink, env("SHOPEE_SUB_ID_ACHADO", "achado"))) || link; }
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
  // capa com foto da categoria (se houver imagem para ela); CAPA_FOTO=nao volta para a capa antiga
  const cover = env("CAPA_FOTO", "sim") === "nao" ? null : await pickCover(p, { log }).catch((e) => { log(`  capa: ${e.message}`); return null; });
  const files = await renderCarousel(p, texts, { outDir, number, handle: env("INSTAGRAM_HANDLE", ""), theme: env("ESTILO", ""), cover });
  log(`Carrossel salvo em ${outDir} (estilo: ${files.themeKey})`);

  if (writeDb) await recordPick(p, { offerId: offer?.id, outDir, link, capa: cover?.id || null });
  // capa do carrossel vira a imagem do pin no Pinterest (feed /rss)
  if (writeDb && offer?.id) {
    const { savePinImage } = await import("./lib/pins.mjs");
    await savePinImage(offer.id, files[0]).catch((e) => log(`  pin: ${e.message}`));
  }

  // 6. Prévia no Telegram
  if (hasTelegram()) {
    const summary = [
      `🛍 Achado do dia ${number || ""}`.trim(),
      p.name.slice(0, 120),
      `Comissão ${pct(p.commission)} · ${brl(p.price)} · ${salesLabel(p.sales)} vendas · ⭐ ${p.rating}`,
      link ? `Link: ${link}` : "",
      runnersUp.length ? `\nOutras opções:\n${runnersUp.map((r) => `• ${pct(r.commission)} · ${r.name.slice(0, 60)}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
    // erro no Telegram nunca impede a postagem
    try { await sendPreview(files, texts.legenda, summary); log("Prévia enviada no Telegram."); }
    catch (e) { log(`Telegram falhou (${e.message}); seguindo com a postagem.`); }
  }

  // 7. Postagem automática (POSTAR=instagram,facebook)
  const targets = list("POSTAR").filter((t) => ["instagram", "facebook"].includes(t));
  if (flag("--nao-postar") || test || !targets.length) {
    log("Postagem automática desligada (variável POSTAR vazia).");
    return;
  }
  // A legenda manda procurar o produto na vitrine: sem ele lá, o post não faz sentido
  if (!offer) {
    log("Não postei: o produto não foi gravado na vitrine (rode sem \"Só gerar o carrossel\" para postar).");
    return;
  }
  if (!hasMeta()) throw new Error("POSTAR está ligado, mas falta META_PAGE_TOKEN.");
  if (!hasDb()) throw new Error("Para postar, o Supabase precisa estar configurado (as imagens sobem no Storage).");
  const { results, errors } = await publishSocial(files, {
    folder: path.basename(outDir),
    caption: texts.legenda,
    link,
    linkThreads: offer?.id ? `${(process.env.VITRINE_URL || BRAND.site).replace(/\/$/, "")}/r/${offer.id}` : null,
    targets,
  });
  for (const [k, v] of Object.entries(results)) log(`Postado no ${k}: ${v}`);
  if (hasTelegram()) {
    const msg = [
      ...Object.entries(results).map(([k, v]) => `✅ ${k}: ${v}`),
      ...errors.map((e) => `❌ ${e}`),
    ].join("\n");
    await sendText(msg).catch(() => {});
  }
  if (errors.length) throw new Error(errors.join(" | "));
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
