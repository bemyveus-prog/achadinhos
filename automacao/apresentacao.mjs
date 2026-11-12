#!/usr/bin/env node
// Vídeo de apresentação do perfil (para fixar no Instagram): storytelling + como usar o link da bio,
// o número do vídeo, os cupons e o canal do Telegram. Tira prints reais do site e do canal.
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";
import { renderSlides } from "./lib/reelslides.mjs";
import { hasTelegram, sendVideo } from "./lib/telegram.mjs";
import { hasMeta, uploadPublic } from "./lib/social.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SITE = (process.env.VITRINE_URL || "https://ofertas.achadinhosincriveis.site").replace(/\/$/, "");
const CANAL = process.env.CANAL_URL || "https://t.me/s/minhasofertarelampago";
const outDir = path.join(HERE, "saida", "apresentacao");
const P = (f) => path.join(outDir, f);

async function prints() {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"], locale: "pt-BR" });
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: P("site.jpg"), quality: 88, clip: { x: 0, y: 0, width: 390, height: 600 } });
  // produtos: rola até a grade
  await page.evaluate(() => window.scrollTo(0, document.querySelector("input")?.getBoundingClientRect().top + window.scrollY - 20 || 900));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: P("produtos.jpg"), quality: 88, clip: { x: 0, y: 0, width: 390, height: 600 } });
  // busca pelo número do vídeo
  const { data: ult } = await sb.from("offers").select("id").eq("active", true).eq("kind", "produto").not("image_url", "is", null).order("id", { ascending: false }).limit(1);
  const n = ult?.[0]?.id || 227;
  await page.goto(`${SITE}/?p=${n}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, document.querySelector("input")?.getBoundingClientRect().top + window.scrollY - 20 || 900));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: P("busca.jpg"), quality: 88, clip: { x: 0, y: 0, width: 390, height: 600 } });
  // cupons
  await page.goto(SITE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const chip = page.getByText("Cupons", { exact: false }).first();
  await chip.click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, document.querySelector("input")?.getBoundingClientRect().top + window.scrollY - 20 || 900));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: P("cupons.jpg"), quality: 88, clip: { x: 0, y: 0, width: 390, height: 600 } });
  // canal do Telegram
  const p2 = await ctx.newPage();
  await p2.goto(CANAL, { waitUntil: "networkidle", timeout: 45000 }).catch((e) => log("canal:", e.message));
  await p2.waitForTimeout(2000);
  await p2.screenshot({ path: P("telegram.jpg"), quality: 88, clip: { x: 0, y: 0, width: 390, height: 600 } });
  await b.close();
  return n;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const n = await prints();
  log(`prints prontos (busca pelo #${n})`);
  const slides = [
    { big: "Como tem gente que compra *bem mais barato*?", imgs: [P("produtos.jpg")],
      say: "Você já se perguntou como tem gente que compra na Shopee, na Amazon e na Shein pagando bem mais barato?" },
    { big: "Não é sorte. É saber *onde olhar*", imgs: [P("cupons.jpg")],
      say: "Não é sorte. Elas sabem onde estão os cupons e as ofertas certas, na hora certa. E eu vou te mostrar onde." },
    { big: "Tá tudo no *link da bio*", imgs: [P("site.jpg")],
      say: "Eu junto tudo num lugar só, no link da minha bio. Os achados dos meus vídeos e os cupons do momento. E você não paga nada a mais por isso." },
    { big: "Viu no vídeo? Busca o *número*", imgs: [P("busca.jpg")], badge: `#${n}`,
      say: "Viu um produto no meu vídeo? Digita o número dele na busca do site e toca em ver oferta. Pronto, você cai direto no produto." },
    { big: "Os *cupons* ficam aqui", imgs: [P("cupons.jpg")],
      say: "Na aba de cupons ficam os cupons e as lojas com desconto. Resgata antes de finalizar a compra." },
    { big: "Ofertas *relâmpago* no Telegram", imgs: [P("telegram.jpg")], badge: "⚡ Grátis",
      say: "E as ofertas relâmpago, que somem rápido, eu mando primeiro no meu canal do Telegram. O botão tá no topo do site." },
  ];
  const cta = { say: "Salva esse vídeo pra não esquecer, me segue e corre no link da bio!", text: "Salva 🔖 me segue e corre no link da bio" };
  let avatar = null;
  try {
    const { data: av } = await sb.storage.from("capas").list("avatar", { limit: 20, sortBy: { column: "name", order: "desc" } });
    const last = (av || []).find((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    if (last) { const { data } = await sb.storage.from("capas").download(`avatar/${last.name}`); avatar = P("avatar" + path.extname(last.name)); await writeFile(avatar, Buffer.from(await data.arrayBuffer())); }
  } catch {}
  const { file, seconds } = await renderSlides({ slides, cta, outDir, handle: process.env.INSTAGRAM_HANDLE || "@minh.asofertas", avatar,
    bg: "radial-gradient(circle at 30% 20%,#FF8A00,#B33A00 75%)", log });
  const legenda = [
    "O truque de quem compra mais barato na Shopee, Amazon e Shein 👀",
    "",
    "1️⃣ Toca no link da bio",
    "2️⃣ Viu um produto no meu vídeo? Busca o número dele",
    "3️⃣ Antes de pagar, confere a aba de cupons 🎟️",
    "4️⃣ Entra no canal do Telegram pra pegar as ofertas relâmpago primeiro ⚡",
    "",
    "Você não paga nada a mais usando os meus links 💛",
    "Salva esse vídeo e me segue pra ver achados todo dia!",
    "",
    "#achadinhos #achadinhosshopee #cupomshopee #ofertas #promoção",
  ].join("\n");
  await writeFile(P("legenda.txt"), legenda + "\n");
  log(`vídeo: ${seconds.toFixed(1)} s`);
  if (hasTelegram()) {
    let markup = null;
    if (hasMeta()) {
      try {
        const [video_url] = await uploadPublic([file], `apresentacao-${Date.now()}`, "video/mp4");
        const { data, error } = await sb.from("reels_pendentes").insert({ video_url, caption: legenda }).select("id").single();
        if (error) throw new Error(error.message);
        markup = { inline_keyboard: [[{ text: "📤 Postar no Instagram", callback_data: `pub:${data.id}` }], [{ text: "🗑️ Descartar", callback_data: `nopub:${data.id}` }]] };
      } catch (e) { log(`  aprovação: ${e.message}`); }
    }
    await sendVideo(file, `🎬 Vídeo de apresentação do perfil (${seconds.toFixed(0)} s). Depois de postar, fixe no perfil (… → Fixar no perfil).\n\nLegenda:\n\n${legenda}`.slice(0, 1024), markup);
    log("Enviado no Telegram.");
  }
}

main().catch((e) => { console.error("Erro:", e.message); process.exit(1); });
