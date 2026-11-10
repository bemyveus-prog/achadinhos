#!/usr/bin/env node
// Vídeo de divulgação do "Cartinhas de Natal" (Shopee Doações), com aprovação no Telegram.
// Os nomes e assinaturas das crianças nas cartinhas foram desfocados nas imagens (pasta cartinhas/).
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { renderSlides } from "./lib/reelslides.mjs";
import { hasTelegram, sendVideo } from "./lib/telegram.mjs";
import { hasMeta, uploadPublic } from "./lib/social.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const C = (f) => path.join(HERE, "cartinhas", f);
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const slides = [
  { big: "Uma criança pediu *isso* de Natal", imgs: [C("carta-volei.jpg")], say: "Uma criança escreveu essa cartinha pedindo uma bola de vôlei de Natal." },
  { big: "Você pode realizar esse sonho pagando *metade*", imgs: [C("carta-maquiagem.jpg")], badge: "50% OFF", say: "E você pode realizar esse sonho pagando a metade." },
  { big: "*Cartinhas de Natal* da Shopee", imgs: [C("campanha.jpg")], say: "É o Cartinhas de Natal da Shopee, com ONGs de São Paulo, do Nordeste e do Rio Grande do Sul." },
  { big: "Como *ajudar*", imgs: [C("cupom.jpg")], say: "Você resgata o cupom de cinquenta por cento, escolhe a cartinha de uma criança e finaliza a compra." },
  { big: "*Sem frete* e 100% vira presente", imgs: [C("carta-cabaninha.jpg"), C("carta-tapete.jpg")], say: "Não tem frete, e todo o valor vira o presente, que a ONG entrega para a criança." },
  { big: "Meta: *10 mil* crianças", imgs: [C("carta-volei.jpg"), C("carta-cabaninha.jpg")], badge: "Cupom até 27/11", say: "A meta é alegrar o Natal de dez mil crianças. O cupom vale até 27 de novembro." },
];
const cta = { say: "O link tá na bio. Me segue e compartilha esse vídeo com quem tem coração bom!", text: "O link está na bio 💛 Compartilha com quem tem coração bom" };

async function main() {
  const outDir = path.join(HERE, "saida", "cartinhas");
  await mkdir(outDir, { recursive: true });
  let avatar = null;
  try {
    const { data: av } = await sb.storage.from("capas").list("avatar", { limit: 20, sortBy: { column: "name", order: "desc" } });
    const last = (av || []).find((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    if (last) { const { data } = await sb.storage.from("capas").download(`avatar/${last.name}`); avatar = path.join(outDir, "avatar" + path.extname(last.name)); await writeFile(avatar, Buffer.from(await data.arrayBuffer())); }
  } catch {}
  const { file, seconds } = await renderSlides({ slides, cta, outDir, handle: process.env.INSTAGRAM_HANDLE || "@minh.asofertas", avatar, log });
  const legenda = [
    "Uma criança pediu uma bola de vôlei de Natal… e você pode realizar esse sonho 🎄💛",
    "",
    "É o Cartinhas de Natal da Shopee:",
    "1️⃣ Resgate o cupom de 50% OFF (até 27/11)",
    "2️⃣ Escolha a cartinha de uma criança de uma das ONGs parceiras",
    "3️⃣ Finalize a compra: sem frete, e o valor vira o presente que a ONG entrega",
    "",
    "🔗 O link está na bio, no banner do topo.",
    "Compartilha com quem tem coração bom 💛",
    "",
    "#CartinhasDeNatal #ShopeeDoações #Natal #solidariedade #achadinhos",
  ].join("\n");
  await writeFile(path.join(outDir, "legenda.txt"), legenda + "\n");
  if (hasTelegram()) {
    let markup = null;
    if (hasMeta()) {
      try {
        const [video_url] = await uploadPublic([file], `cartinhas-${Date.now()}`, "video/mp4");
        const { data, error } = await sb.from("reels_pendentes").insert({ video_url, caption: legenda }).select("id").single();
        if (error) throw new Error(error.message);
        markup = { inline_keyboard: [[{ text: "📤 Postar no Instagram", callback_data: `pub:${data.id}` }], [{ text: "🗑️ Descartar", callback_data: `nopub:${data.id}` }]] };
      } catch (e) { log(`  aprovação: ${e.message}`); }
    }
    await sendVideo(file, `🎄 Cartinhas de Natal (${seconds.toFixed(0)} s)\n\nLegenda:\n\n${legenda}`.slice(0, 1024), markup);
    log("Enviado no Telegram.");
  }
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
