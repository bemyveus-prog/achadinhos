#!/usr/bin/env node
// Reels v2: escolhe um produto na API (ou usa um da vitrine), monta o vídeo curto com a foto da
// categoria e manda para o Telegram (e posta no Instagram com --postar).
//
//   node reels2.mjs --busca "blusa feminina"     produto novo da API (entra na vitrine)
//   node reels2.mjs --oferta 91                   produto que já está na vitrine
//   --postar                                      também posta no Instagram
import path from "path";
import { writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { gql, hasShopeeApi, searchOffers, shortLink } from "./lib/shopee.mjs";
import { gerarNarracao, gerarLegendaShopee, gerarHeadline, resumoAnalise } from "./lib/narracao.mjs";
import { normalize, score } from "./lib/escolha.mjs";
import { pickCover, categoriesWithImages, coverConfig, categoryOf } from "./lib/capas.mjs";
import { execFile } from "child_process";
import { promisify } from "util";
const run = promisify(execFile);
import { renderReel2 } from "./lib/reels2.mjs";
import { shortName, brl, salesLabel } from "./lib/textos.mjs";
import { hasTelegram, sendText, sendVideo } from "./lib/telegram.mjs";
import { hasMeta, postReel, uploadPublic } from "./lib/social.mjs";
import { hasCJ, productBySku, productVideos, bestFreeVideo, downloadVideo } from "./lib/cj.mjs";
import { BRAND } from "../lib/brand.mjs";
import { claude, hasIA } from "./lib/ia.mjs";

// título que não diz o que é o produto (ex.: página de promoção da Shein)
const nomeGenerico = (t) => !t || String(t).replace(/[^\p{L}]/gu, "").length < 6 || /oferta grande|economize|não perca|nao perca|promo(ção|cao)|^shein\b|^achado d[ao]/i.test(t);

// olha as fotos (ou quadros do vídeo) e diz o que é o produto e o que dá para ver nele
async function verProduto(imagens, log) {
  if (!hasIA() || !imagens.length) return null;
  const { readFile } = await import("fs/promises");
  const content = [];
  for (const f of imagens.slice(0, 3)) {
    try { content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: (await readFile(f)).toString("base64") } }); } catch {}
  }
  if (!content.length) return null;
  content.push({ type: "text", text: `Estas são fotos de um produto à venda. Responda exatamente em 2 linhas, em português do Brasil:
NOME: o que é o produto, como um título curto de loja (até 8 palavras, ex.: "Par de brincos de pedra verde")
DETALHES: só o que dá para VER nas fotos (cor, formato, material aparente, para que serve), em uma frase. Não invente medidas nem recursos.` });
  try {
    const t = await claude({ content, max: 200 });
    const nome = (t.match(/NOME:\s*(.+)/i) || [])[1]?.trim().replace(/^["']|["']$/g, "");
    const det = (t.match(/DETALHES:\s*(.+)/i) || [])[1]?.trim();
    log(`  pelas fotos: ${nome || "?"} | ${det || ""}`);
    return { nome, det };
  } catch (e) { log(`  ver fotos: ${e.message}`); return null; }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const env = (k, d) => (process.env[k] ?? "").trim() || d;
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const pct = (v) => (v * 100).toFixed(1).replace(".", ",") + "%";

// o que buscar na Shopee para cada categoria de capa (no modo automático)
const BUSCAS = {
  "moda-feminina": ["blusa feminina", "vestido feminino", "conjunto feminino", "cropped feminino", "calça feminina"],
  "moda-masculina": ["camiseta masculina", "bermuda masculina", "camisa masculina"],
  maquiagem: ["maquiagem", "batom", "rímel", "paleta de sombras", "pincel de maquiagem"],
  skincare: ["skincare", "sérum facial", "protetor solar facial", "hidratante facial"],
  cabelo: ["máscara capilar", "escova secadora", "acessório de cabelo"],
  calcados: ["sandália feminina", "tênis feminino", "chinelo feminino"],
  acessorios: ["bolsa feminina", "óculos de sol feminino", "brinco feminino"],
  infantil: ["roupa infantil", "brinquedo educativo"],
  pet: ["brinquedo pet", "cama pet"],
  celular: ["fone bluetooth", "carregador turbo", "suporte celular"],
  fitness: ["roupa academia feminina", "garrafa academia"],
  organizador: ["organizador", "organizador de gaveta"],
  cozinha: ["utensílio de cozinha", "pote hermético", "air fryer acessório"],
  banheiro: ["organizador banheiro", "tapete banheiro"],
  ferramentas: ["kit ferramentas", "parafusadeira"],
  decoracao: ["decoração quarto", "luminária led"],
  casa: ["limpeza casa", "mop"],
};

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  let p, offerId;

  if (opt("--oferta")) {
    offerId = Number(String(opt("--oferta")).replace("#", ""));
    const { data, error } = await sb.from("offers").select("*").eq("id", offerId).single();
    if (error) throw new Error(`Oferta #${offerId}: ${error.message}`);
    const { data: pick } = await sb.from("auto_picks").select("sales,rating").eq("offer_id", offerId).maybeSingle();
    p = { name: data.title, imageUrl: data.image_url, price: Number(data.price), sales: pick?.sales || 0, rating: pick?.rating || 0 };
    // produto que veio do grupo: busca nota e vendas na API (description = "grupo:shopId:itemId")
    const g = String(data.description || "").match(/^grupo:(\d+):(\d+)$/);
    if (g && hasShopeeApi()) {
      try {
        const d = await gql(`{ productOfferV2(shopId: ${g[1]}, itemId: ${g[2]}, limit: 1) { nodes { sales ratingStar } } }`);
        const n = d?.productOfferV2?.nodes?.[0];
        if (n) { p.sales = Number(n.sales) || 0; p.rating = Number(n.ratingStar) || 0; }
      } catch {}
    }
  } else {
    if (!hasShopeeApi()) throw new Error("Configure SHOPEE_APP_ID e SHOPEE_APP_SECRET");
    let keyword = opt("--busca") || "blusa feminina";
    if (args.includes("--auto")) {
      // gira entre as categorias que já têm foto de capa, e entre as buscas de cada uma
      const cats = (await categoriesWithImages()).filter((c) => BUSCAS[c]);
      if (!cats.length) throw new Error("Nenhuma categoria tem foto de capa ainda (mande pelo bot: /capa categoria)");
      const turn = Math.floor(Date.now() / 3600000);
      const cat = cats[turn % cats.length];
      const list = BUSCAS[cat];
      keyword = list[Math.floor(turn / cats.length) % list.length];
      args.push("--categoria", cat);
      log(`Modo automático: categoria ${cat}, busca "${keyword}"`);
    }
    // não repete produto que já está na vitrine (Reels, bot, categorias ou achado do dia)
    const { data: have } = await sb.from("offers").select("description").eq("active", true).not("description", "is", null);
    const used = new Set((have || []).map((o) => (o.description.match(/^(?:reel|bot|cat|kit):(\d+)/) || [])[1]).filter(Boolean));
    const { data: picks } = await sb.from("auto_picks").select("item_id");
    for (const r of picks || []) used.add(String(r.item_id));
    const seen = new Map();
    for (const sortType of [2, 5]) for (const page of [1, 2]) {
      try {
        const { nodes = [] } = await searchOffers({ keyword, sortType, page, limit: 50 });
        for (const n of nodes) { const x = normalize(n); if (!seen.has(x.itemId)) seen.set(x.itemId, x); }
      } catch (e) { log(`  busca falhou: ${e.message}`); }
    }
    const ok = [...seen.values()].filter((x) => x.imageUrl && x.price && x.rating >= 4.7 && x.sales >= 100 && x.commission >= 0.1 && !used.has(x.itemId))
      .sort((a, b) => score(b) - score(a));
    if (!ok.length) throw new Error(`Nenhum produto bom para "${keyword}"`);
    p = ok[0];
    log(`Produto: ${p.name}`);
    log(`  ${pct(p.commission)} · ${brl(p.price)} · ${salesLabel(p.sales)} vendas · nota ${p.rating}`);
    let link = p.offerLink;
    try { link = (await shortLink(p.productLink, env("REELS_SUB_ID", "reels"))) || link; } catch (e) { log(`  link curto: ${e.message}`); }
    const dias = Number(env("DIAS_NA_VITRINE", "15"));
    const { data, error } = await sb.from("offers").insert({
      kind: "produto", title: p.name.slice(0, 120), description: `reel:${p.itemId}`, image_url: p.imageUrl,
      price: p.price, link, platform: "shopee", active: true,
      expires_at: dias > 0 ? new Date(Date.now() + dias * 86400000).toISOString() : null,
    }).select("id").single();
    if (error) throw new Error(`Supabase: ${error.message}`);
    offerId = data.id;
    log(`Na vitrine como #${offerId} (subId reelssite)`);
  }

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const outDir = path.join(HERE, "saida", "reels2", `${today}-${offerId}`);

  // vídeo real do produto na CJ (--cj SKU) ou enviado pelo bot (REELS_VIDEO)
  let clip = null;
  const own = (process.env.REELS_VIDEO || "").trim();
  if (own) {
    const { mkdir } = await import("fs/promises");
    await mkdir(outDir, { recursive: true });
    const { data, error } = await sb.storage.from("reels-videos").download(own);
    if (error) throw new Error(`Vídeo enviado (${own}): ${error.message}`);
    const f = path.join(outDir, "seu-video" + path.extname(own));
    await writeFile(f, Buffer.from(await data.arrayBuffer()));
    clip = { file: f, maxSec: 12 }; // o seu vídeo pode aparecer mais tempo
    log(`Usando o seu vídeo (${own})`);
  }
  // várias fotos mandadas pelo bot (pasta no Storage reels-videos): viram o vídeo do produto
  const pastaFotos = (process.env.REELS_FOTOS || "").trim();
  let fotosBaixadas = [], temVideoEnviado = false;
  if (pastaFotos && !clip) {
    const { mkdir } = await import("fs/promises");
    await mkdir(outDir, { recursive: true });
    // as mensagens do álbum chegam uma por uma: espera a pasta parar de crescer (até ~45 s)
    let lista = [];
    for (let i = 0; i < 6; i++) {
      const { data } = await sb.storage.from("reels-videos").list(pastaFotos, { limit: 30, sortBy: { column: "name", order: "asc" } });
      const nova = (data || []).filter((x) => /\.(jpe?g|png|webp|mp4|mov|webm|m4v)$/i.test(x.name));
      if (i > 0 && nova.length === lista.length) { lista = nova; break; }
      lista = nova;
      await new Promise((r) => setTimeout(r, i === 0 ? 4000 : 8000));
    }
    const fotos = [], midias = [];
    for (const f of lista.slice(0, 20)) {
      const { data } = await sb.storage.from("reels-videos").download(`${pastaFotos}/${f.name}`);
      if (!data) continue;
      const video = /\.(mp4|mov|webm|m4v)$/i.test(f.name);
      const file = path.join(outDir, `${video ? "clipe" : "foto"}-${midias.length + 1}${path.extname(f.name)}`);
      await writeFile(file, Buffer.from(await data.arrayBuffer()));
      midias.push({ file, video });
      if (!video) fotos.push(file);
    }
    const videosEnviados = midias.filter((m) => m.video).map((m) => m.file);
    // vídeo enviado: tira 1 quadro para a IA olhar e para servir de foto do produto
    for (const [i, v] of videosEnviados.slice(0, 3).entries()) {
      const q = path.join(outDir, `quadro-video-${i + 1}.jpg`);
      try { await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "1", "-i", v, "-frames:v", "1", "-vf", "scale=1080:-2", q]); fotos.push(q); } catch {}
    }
    if (videosEnviados.length) {
      const { midiasParaVideo } = await import("./lib/fotosvideo.mjs");
      const falaPrev = (process.env.REELS_FALA || "").length || 230;
      const v = await midiasParaVideo(midias, path.join(outDir, "midias.mp4"), { alvo: Math.max(14, falaPrev / 15 + 3), log });
      clip = { file: v.file, maxSec: 60 };
      temVideoEnviado = true;
      log(`Usando ${videosEnviados.length} vídeo(s) e ${midias.length - videosEnviados.length} foto(s) enviados, emendados (${pastaFotos})`);
    }
    fotosBaixadas = fotos;
    // produto sem foto (ex.: link da Shein/AliExpress que não trouxe imagem): a 1ª foto enviada vira a foto do produto
    if (fotos.length && !p.imageUrl) {
      try {
        const [u] = await uploadPublic([fotos[0]], `produto-${offerId}-${Date.now()}`, "image/jpeg");
        p.imageUrl = u;
        if (offerId) await sb.from("offers").update({ image_url: u }).eq("id", offerId);
        log("  sem foto do produto: usando a 1ª foto enviada");
      } catch (e) { p.imageUrl = fotos[0]; log(`  foto do produto: ${e.message}`); }
    }
    if (clip) { /* vídeos enviados já viraram o clipe */ }
    else if (fotos.length) {
      const { fotosParaVideo } = await import("./lib/fotosvideo.mjs");
      // tempo de cada foto acompanha mais ou menos a narração (~15 letras por segundo)
      const falaPrev = (process.env.REELS_FALA || "").length || 230;
      const porFoto = Math.min(3.5, Math.max(1.6, falaPrev / 15 / fotos.length));
      const v = await fotosParaVideo(fotos, path.join(outDir, "fotos.mp4"), { porFoto, log });
      clip = { file: v.file, maxSec: 60 };
      log(`Usando ${fotos.length} fotos enviadas (${pastaFotos})`);
    } else log(`  pasta de fotos vazia: ${pastaFotos}`);
  }
  if (opt("--cj")) {
    if (!hasCJ()) throw new Error("Falta o secret CJ_API_KEY");
    const prod = await productBySku(opt("--cj"));
    if (!prod) throw new Error(`Não achei o SKU ${opt("--cj")} na CJ`);
    log(`CJ: ${prod.name}`);
    const vids = await productVideos(prod.pid);
    const best = bestFreeVideo(vids);
    if (!best) throw new Error(`O produto ${opt("--cj")} tem ${vids.length} vídeo(s) na CJ, mas nenhum grátis`);
    const { mkdir } = await import("fs/promises");
    await mkdir(outDir, { recursive: true });
    const cjFile = await downloadVideo(best.url, path.join(outDir, "cj.mp4"));
    log(`  vídeo grátis: ${best.duration.toFixed(0)} s, ${best.w}x${best.h}, ▶${best.plays}`);
    if (clip) {
      // seu vídeo + vídeo da CJ emendados (até 6 s de cada), já no formato do quadro do Reels
      const both = path.join(outDir, "seu-video+cj.mp4");
      const fit = "scale=780:1180:force_original_aspect_ratio=increase,crop=780:1180,fps=30,setsar=1,setpts=PTS-STARTPTS";
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", clip.file, "-i", cjFile, "-filter_complex",
        `[0:v]trim=0:6,${fit}[a];[1:v]trim=0.5:6.5,${fit}[b];[a][b]concat=n=2:v=1:a=0[v]`,
        "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", both]);
      clip = { file: both, maxSec: 12 };
      log("  seu vídeo + vídeo da CJ emendados");
    } else clip = { file: cjFile };
  }
  // fotos enviadas, ou nome que não diz o que é o produto: a IA olha as imagens
  let visto = null;
  const genericoAntes = nomeGenerico(p.name);
  if (fotosBaixadas.length || (genericoAntes && clip?.file)) {
    let imgs = fotosBaixadas;
    if (!imgs.length && clip?.file) {
      imgs = [];
      for (const t of [0.8, 2.5]) {
        const f = path.join(outDir, `quadro-${t}.jpg`);
        try { await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(t), "-i", clip.file, "-frames:v", "1", "-vf", "scale=768:-2", f]); imgs.push(f); } catch {}
      }
    }
    visto = await verProduto(imgs, log);
    if (visto?.nome && genericoAntes) {
      log(`  nome genérico ("${p.name}") trocado por "${visto.nome}"`);
      p.name = visto.nome;
      if (offerId) await sb.from("offers").update({ title: visto.nome.slice(0, 120) }).eq("id", offerId).then(() => {}, () => {});
    }
  }
  const nome = shortName(p.name, 5);
  // sem capa no Reels: só o gancho da categoria entra na narração padrão (quando não há texto próprio)
  const cfg = await coverConfig();
  const slug = opt("--categoria") || categoryOf(p.name || "", cfg);
  const c = cfg[slug] || {};
  const ganchos = c.ganchos?.length ? c.ganchos : ["Eu *não acreditei* quando vi isso"];
  const cover = { hook: ganchos[Math.floor(Date.now() / 3600000) % ganchos.length], accent: c.cor || BRAND.accent };
  let fala = (process.env.REELS_FALA || "").replace(/(?:https?:\/\/|www\.)\S+/gi, " ").replace(/\s+/g, " ").trim().slice(0, 400);
  // sem texto seu: com a chave da IA, a narração é escrita para este produto (senão usa o texto padrão)
  if (!fala && (env("REELS_GERAR_FALA", "") === "1" || env("ANTHROPIC_API_KEY", ""))) fala = await gerarNarracao(p, { contexto: [visto?.det ? `O que aparece nas fotos: ${visto.det}` : "", nomeGenerico(env("REELS_CONTEXTO", "")) ? "" : env("REELS_CONTEXTO", "")].filter(Boolean).join(". "), generico: env("REELS_MODO", "").startsWith("link"), log });
  if (fala) log(`Narração própria: "${fala}"`);
  // final: "me segue" + link da bio; o cupom só é citado se a vitrine tiver cupom ativo agora
  const agora = new Date().toISOString();
  const { count: cupons } = await sb.from("offers").select("id", { count: "exact", head: true })
    .eq("active", true).eq("kind", "cupom").or(`expires_at.is.null,expires_at.gt.${agora}`);
  const cupom = (cupons || 0) > 0;
  let avatar = null;
  try {
    const { data: av } = await sb.storage.from("capas").list("avatar", { limit: 20, sortBy: { column: "name", order: "desc" } });
    const last = (av || []).find((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    if (last) {
      const { data } = await sb.storage.from("capas").download(`avatar/${last.name}`);
      avatar = path.join(outDir, "avatar" + path.extname(last.name));
      const { mkdir } = await import("fs/promises");
      await mkdir(outDir, { recursive: true });
      await writeFile(avatar, Buffer.from(await data.arrayBuffer()));
    }
  } catch (e) { log(`  avatar: ${e.message}`); }
  log(`  final: ${cupom ? `com cupom (${cupons} ativos)` : "sem cupom ativo"} · ${avatar ? "com foto do perfil" : "sem foto do perfil (mande /avatar no bot)"}`);
  // REELS_MODO pode vir com o formato junto: "shopee+mascara", "instagram+cheio"
  const [modoRaw, layoutRaw] = env("REELS_MODO", "instagram").split("+");
  const modo = ["shopee", "link"].includes(modoRaw) ? modoRaw : "instagram";
  // formato: máscara (headline em cima, vídeo no meio, chamada embaixo) ou tela cheia; sem escolha, sorteia
  // sem escolha no pedido: vale o /formato do bot (bot_config "formato"); senão sorteia
  let padrao = env("REELS_LAYOUT", "");
  if (!padrao) { const { data: fc } = await sb.from("bot_config").select("value").eq("key", "formato").maybeSingle(); padrao = fc?.value || "alternar"; }
  const FORMATOS = ["mascara", "cheio", "limpo"];
  const layout = FORMATOS.includes(layoutRaw) ? layoutRaw : FORMATOS.includes(padrao) ? padrao : (Math.random() < 0.5 ? "mascara" : "cheio");
  log(`Formato: ${layout === "mascara" ? "máscara (headline + vídeo + chamada)" : layout === "limpo" ? "limpo (só o vídeo + narração)" : "tela cheia"}`);
  // frase de curiosidade: na máscara fica no topo o tempo todo; nos outros formatos com vídeo, aparece nos primeiros 3 s
  // (prende quem está rolando o feed no Instagram, no Shopee Vídeo e no YouTube). GANCHO_TELA=nao desliga.
  const comGancho = layout === "mascara" || (clip?.file && env("GANCHO_TELA", "sim") !== "nao");
  const headline = comGancho ? await gerarHeadline(p, { fala, log }) : "";
  const ganchoTopo = layout !== "mascara" && clip?.file ? headline : "";
  if (modo === "link") log("Modo link: final genérico chamando para o link abaixo (sem citar a loja)");
  if (modo === "shopee") log("Modo Shopee Vídeo: final chamando para o produto vinculado");
  const { file, seconds, scenes } = await renderReel2(p, { cover, nome, number: `#${offerId}`, outDir, clip, fala, cupom, avatar, modo, layout, headline, ganchoTopo, handle: BRAND.handle, log });

  // ---------- versão do YouTube: só quando há imagem em movimento (vídeo real ou 2+ fotos) ----------
  // formato limpo (vídeo em tela cheia desde o 1º segundo) com uma frase de curiosidade no começo e título de curiosidade
  const { hasYouTube: temYT } = await import("./lib/youtube.mjs");
  const temVideo = Boolean(clip?.file) && (temVideoEnviado || fotosBaixadas.length === 0 || fotosBaixadas.length >= 2);
  let yt = { temVideo, titulo: "", file: null };
  if (temVideo && temYT() && modo !== "shopee") {
    try {
      const gancho = headline || (await gerarHeadline(p, { fala, log })) || "";
      yt.titulo = gancho.replace(/\*/g, "");
      {
        const r = await renderReel2(p, { cover, nome, number: `#${offerId}`, outDir: path.join(outDir, "youtube"), clip, fala, cupom, avatar, modo, layout: "limpo", headline: gancho, ganchoTopo: gancho, destino: "youtube", handle: BRAND.handle, log });
        yt.file = r.file;
      }
      log(`  versão YouTube pronta (título: ${yt.titulo || "-"})`);
    } catch (e) { log(`  versão YouTube: ${e.message}`); }
  } else log(`  YouTube: ${temVideo ? "modo Shopee Vídeo" : "sem vídeo em movimento"} → não vai pro YouTube`);
  log(`Vídeo pronto: ${seconds.toFixed(1)} s`);

  const legenda = [
    `${(fala || cover.hook).replace(/\*/g, "").slice(0, 150)} 👀`,
    "",
    (process.env.EU_QUERO || "").trim() === "ligado" ? "💬 Comenta EU QUERO que eu te mando o link no direct!" : "Você usaria? Comenta aqui 👇",
    "",
    "🔖 Salva pra não perder e manda pra quem precisa!",
    `🔎 Link na bio! Procura o #${offerId} na busca da vitrine${cupom ? " (e tem cupom da Shopee lá 🎟️)" : ""}.`,
    `➕ Me segue pra ver um achado novo todo dia${BRAND.canalTelegram ? "\n🔥 No link da bio tem o grupo VIP do Telegram, com ofertas que só saem lá" : ""}`,
    "",
    "#achadinhos #achadinhosshopee #shopee #achadosdashopee #comprinhas",
  ].join("\n");
  await writeFile(path.join(outDir, "legenda.txt"), legenda + "\n");

  // capa vertical para o pin do Pinterest
  const { makePinImage } = await import("./lib/pins.mjs");
  await makePinImage({ id: offerId, title: p.name, image_url: p.imageUrl, price: p.price, sales: p.sales, rating: p.rating }, { log }).catch((e) => log(`  pin: ${e.message}`));

  // Shopee Vídeo: não tem postagem automática; o vídeo vai para o Telegram para você subir no app
  if (modo === "shopee" || modo === "link") {
    const { data: off } = await sb.from("offers").select("link").eq("id", offerId).maybeSingle();
    // legenda do Shopee Vídeo: até 150 caracteres, com hashtags de busca do produto
    const legShopee = await gerarLegendaShopee(p, { fala, generico: modo === "link", log });
    await writeFile(path.join(outDir, "legenda-shopee.txt"), legShopee + "\n");
    if (hasTelegram()) {
      const info = modo === "link"
        ? `🔗 Vídeo com link #${offerId} (${seconds.toFixed(0)} s)\nPoste com o link do produto${off?.link ? `:\n${off.link}` : ""}${resumoAnalise() ? `\n\n${resumoAnalise()}` : ""}\n\nLegenda (${legShopee.length}/150) 👇`
        : `🛍️ Shopee Vídeo #${offerId} (${seconds.toFixed(0)} s)\nNo app Shopee: Vídeo → postar → vincule o produto #${offerId}${off?.link ? `\n${off.link}` : ""}${resumoAnalise() ? `\n\n${resumoAnalise()}` : ""}\n\nLegenda (${legShopee.length}/150) 👇`;
      // botão que copia SÓ a legenda
      try { await sendVideo(file, info.slice(0, 1024), { inline_keyboard: [[{ text: "📋 Copiar legenda", copy_text: { text: legShopee } }]] }); }
      catch (e) { log(`  botão de copiar recusado (${e.message}); enviando sem`); await sendVideo(file, info.slice(0, 1024)); }
      await sendText(legShopee).catch(() => {}); // a legenda sozinha, também fácil de copiar
      log("Enviado no Telegram (Shopee Vídeo).");
    }
    console.log(scenes.map((x, i) => `${i + 1}. [${x.key}] ${x.say}`).join("\n"));
    return;
  }

  const postarJa = args.includes("--postar");
  if (hasTelegram()) {
    // sem "postar": guarda o vídeo e manda com o botão de aprovação
    let markup = null;
    if (!postarJa && hasMeta()) {
      try {
        const [video_url] = await uploadPublic([file], `reels2-${offerId}-${Date.now()}`, "video/mp4");
        const { data, error } = await sb.from("reels_pendentes").insert({ offer_id: offerId, video_url, caption: legenda }).select("id").single();
        if (error) throw new Error(error.message);
        try {
          const { salvarMetaYouTube } = await import("./lib/youtube.mjs");
          const ytUrl = yt.file && yt.file !== file ? (await uploadPublic([yt.file], `reels2yt-${offerId}-${Date.now()}`, "video/mp4"))[0] : null;
          await salvarMetaYouTube(sb, data.id, { temVideo: yt.temVideo && Boolean(yt.file), titulo: yt.titulo, videoUrl: ytUrl });
        } catch (e) { log(`  meta YouTube: ${e.message}`); }
        markup = { inline_keyboard: [[{ text: "📤 Postar no Instagram", callback_data: `pub:${data.id}` }], [{ text: "▶️ Postar no YouTube", callback_data: `yt:${data.id}` }], [{ text: "🗑️ Descartar", callback_data: `nopub:${data.id}` }]] };
      } catch (e) { log(`  aprovação: ${e.message}`); }
    }
    await sendVideo(file, `🎬 Reels #${offerId} (${seconds.toFixed(0)} s)${postarJa ? " · postando no Instagram…" : ""}${resumoAnalise() ? `\n\n${resumoAnalise()}` : ""}\n\nLegenda:\n\n${legenda}`.slice(0, 1024), markup);
    log("Enviado no Telegram.");
  }
  if (postarJa) {
    if (!hasMeta()) throw new Error("Falta META_PAGE_TOKEN para postar.");
    const url = await postReel(file, legenda, `reels2-${offerId}`);
    log(`Postado: ${url}`);
    try {
      const { hasThreads, postThreadsVideo, textoThreads } = await import("./lib/threads.mjs");
      if (await hasThreads()) {
        const [vurl] = await uploadPublic([file], `threads-${offerId}-${Date.now()}`, "video/mp4");
        const tl = await postThreadsVideo(vurl, textoThreads(legenda, `${BRAND.site}/r/${offerId}`), log);
        if (hasTelegram()) await sendText(`🧵 Postado no Threads: ${tl}`).catch(() => {});
      }
    } catch (e) { log(`  Threads: ${e.message}`); }
    const { hasYouTube, postShort, textosYouTube, regrasYouTube, registrarYouTube } = await import("./lib/youtube.mjs");
    if (hasYouTube()) {
      const VIT = BRAND.site;
      try {
        const regra = await regrasYouTube(sb, { offerId, temVideo: yt.temVideo && Boolean(yt.file) });
        if (!regra.ok) log(`  YouTube pulado: ${regra.motivo}`);
        else {
          const { url: ytUrl } = await postShort(yt.file, textosYouTube(legenda, { link: `${VIT}/r/${offerId}`, titulo: yt.titulo }), log);
          await registrarYouTube(sb, { offerId, url: ytUrl });
          if (hasTelegram()) await sendText(`▶️ Short no YouTube: ${ytUrl}`).catch(() => {});
        }
      } catch (e) { log(`  YouTube: ${e.message}`); }
    }
  }
  console.log(scenes.map((s, i) => `${i + 1}. [${s.key}] ${s.say}`).join("\n"));
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
