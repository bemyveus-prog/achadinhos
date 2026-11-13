#!/usr/bin/env node
// Reels de um produto da vitrine: foto + dados reais + narração → vídeo vertical para Instagram/Shopee Vídeo.
//
//   node reels.mjs --oferta 41          Reels da oferta #41 da vitrine
//   node reels.mjs                      Reels do achado do dia mais recente
//   node reels.mjs --teste --foto x.jpg testa o visual com um produto de exemplo (sem banco)
//   --postar                            também posta o Reels no Instagram (precisa das chaves META_*)
//
// Saída: saida/reels/AAAA-MM-DD-oferta-N/reels.mp4 (+ reels-roteiro.txt e legenda.txt)

import path from "path";
import { writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { buildTexts } from "./lib/textos.mjs";
import { renderReel } from "./lib/reels.mjs";
import { hasDb, getOffer, latestPickOfferId } from "./lib/vitrine.mjs";
import { hasMeta, postReel } from "./lib/social.mjs";
import { BRAND } from "../lib/brand.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const env = (k, d) => (process.env[k] ?? "").trim() || d;
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);

const TEST_PRODUCT = {
  name: "Kit Skincare Kokeshi Olhos de Gueixa 15g + Creme Facial Pele de Porcelana 30g Hidratante",
  price: 59.9, originalPrice: 99.9, discount: 40, sales: 12500, rating: 4.9,
};

async function main() {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  let p, number, folder;

  if (flag("--teste")) {
    if (!opt("--foto")) throw new Error("No modo teste, informe uma foto: node reels.mjs --teste --foto foto.jpg");
    p = { ...TEST_PRODUCT, imageUrl: opt("--foto") };
    number = "#23";
    folder = `${today}-teste`;
  } else {
    if (!hasDb()) throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
    const id = opt("--oferta") || env("OFERTA", "") || (await latestPickOfferId());
    if (!id) throw new Error("Nenhuma oferta informada e nenhum achado do dia na vitrine ainda.");
    const o = await getOffer(id);
    if (!o) throw new Error(`Oferta #${id} não existe na vitrine.`);
    if (!o.image_url) throw new Error(`A oferta #${id} não tem foto.`);
    const price = o.price ? Number(o.price) : null;
    const original = o.original_price ? Number(o.original_price) : null;
    p = {
      name: o.title, imageUrl: o.image_url, price, originalPrice: original,
      discount: original && price && original > price ? Math.round((1 - price / original) * 100) : 0,
      rating: o.rating, sales: o.sales,
    };
    number = `#${o.id}`;
    folder = `${today}-oferta-${o.id}`;
    log(`Oferta ${number}: ${o.title}`);
  }

  const texts = await buildTexts(p, log);
  texts.legenda = texts.legenda.replace(/Digite o número do produto na busca\.?/i, `Digite ${number} na busca.`);
  const outDir = path.resolve(env("PASTA_SAIDA", path.join(HERE, "saida")), "reels", folder);

  const { file, seconds } = await renderReel(p, texts, {
    outDir, number, handle: env("INSTAGRAM_HANDLE", ""), music: env("MUSICA", "") || null, log,
  });
  await writeFile(path.join(outDir, "legenda.txt"), texts.legenda + "\n");
  log(`Reels pronto: ${file} (${seconds.toFixed(1)} s)`);

  if (flag("--postar")) {
    if (flag("--teste")) throw new Error("O modo teste não posta.");
    if (!hasMeta()) throw new Error("Para postar, cadastre META_PAGE_TOKEN e META_IG_USER_ID.");
    log("Enviando o Reels para o Instagram (o processamento do vídeo leva 1 a 3 minutos)...");
    const url = await postReel(file, texts.legenda, `reels-${folder}`);
    log(`Postado no Instagram: ${url}`);
    const { hasYouTube, postShort, textosYouTube } = await import("./lib/youtube.mjs");
    // Reels de capa/foto parada não vai pro YouTube (o canal não entrega esse tipo de vídeo)
    if (hasYouTube()) log("  YouTube: vídeo só com foto parada → não vai pro YouTube");
  }
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
