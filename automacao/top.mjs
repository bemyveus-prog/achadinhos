#!/usr/bin/env node
// Reels "Top N" pedido pelo bot (/top). Roteiro em REELS_TOP (JSON):
//   { "title": "5 coisas que parecem bobas mas facilitam a vida", "items": [{ "id": 136, "sku": "CJ...", "fala": "..." }], "postar": false }
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { renderTop } from "./lib/reelstop.mjs";
import { gerarNarracao } from "./lib/narracao.mjs";
import { shortName } from "./lib/textos.mjs";
import { hasTelegram, sendVideo } from "./lib/telegram.mjs";
import { hasMeta, postReel, uploadPublic } from "./lib/social.mjs";
import { hasCJ, productBySku, productVideos, bestFreeVideo, downloadVideo } from "./lib/cj.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = (k, d) => (process.env[k] ?? "").trim() || d;
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Top automático: a IA escolhe um tema e 5 produtos da vitrine e escreve a narração de cada um
async function autoRoteiro() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("O Top automático precisa da ANTHROPIC_API_KEY");
  const agora = new Date().toISOString();
  const { data: prods } = await sb.from("offers").select("id,title,price,category").eq("active", true).eq("kind", "produto")
    .not("image_url", "is", null).or(`expires_at.is.null,expires_at.gt.${agora}`).order("id", { ascending: false }).limit(120);
  if ((prods || []).length < 5) throw new Error("Poucos produtos na vitrine para um Top");
  // não repete os produtos dos últimos Tops
  const { data: rec } = await sb.from("bot_config").select("value").eq("key", "top_recentes").maybeSingle();
  const recentes = new Set(JSON.parse(rec?.value || "[]"));
  const lista = prods.filter((p) => !recentes.has(p.id)).map((p) => `${p.id} | ${String(p.title).slice(0, 90)} | R$ ${Number(p.price || 0).toFixed(2)}${p.category ? ` | ${p.category}` : ""}`).join("\n");
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long" });
  const prompt = `Hoje é ${hoje}. Você monta vídeos "Top 5" para um perfil de achadinhos da Shopee no Instagram.
Produtos disponíveis na vitrine (id | nome | preço | categoria):
${lista}

Escolha UM tema que agrupe bem 5 desses produtos e que chame atenção (ex.: "5 achados de cozinha abaixo de R$ 30", "5 coisas que parecem bobas mas facilitam a vida", "presentes de Natal até R$ 50"). Se a data combinar (Natal, Black Friday, volta às aulas, Dia das Mães...), prefira um tema da época.
Regras:
- O título deve ser verdadeiro para os produtos escolhidos (se disser "abaixo de R$ 30", todos precisam custar menos que isso).
- Para cada produto, uma narração de 1 frase (até 110 caracteres), animada, usando só o que dá para saber pelo nome. Sem inventar medidas, materiais ou promessas. Sem travessão, sem emoji.
Responda EXATAMENTE neste formato de texto, sem nada antes ou depois:
TITULO: título do vídeo (até 60 caracteres)
123 | narração do produto
456 | narração do produto
(5 linhas de produto, usando os ids da lista)`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY.trim(), "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: env("ANTHROPIC_MODEL_TOP", "claude-sonnet-5-5"), max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`IA: ${j?.error?.message || r.status}`);
  const t = (j.content || []).map((c) => c.text || "").join("");
  const out = { title: ((t.match(/TITULO:\s*(.+)/i) || [])[1] || "").trim().replace(/^["']|["']$/g, ""), items: [] };
  for (const m of t.matchAll(/^\s*#?(\d+)\s*\|\s*(.+)$/gm)) out.items.push({ id: Number(m[1]), fala: m[2].trim() });
  if (!out.title) { log("Resposta da IA:", t.slice(0, 500)); throw new Error("A IA não mandou o título"); }
  const valid = new Set(prods.map((p) => p.id));
  out.items = (out.items || []).filter((i) => valid.has(Number(i.id))).slice(0, 5).map((i) => ({ id: Number(i.id), fala: String(i.fala || "").replace(/[—–]/g, ",") }));
  if (out.items.length < 3) throw new Error("A IA não escolheu produtos suficientes");
  log(`Top automático: "${out.title}" com ${out.items.map((i) => "#" + i.id).join(", ")}`);
  const novos = [...out.items.map((i) => i.id), ...recentes].slice(0, 40);
  await sb.from("bot_config").upsert({ key: "top_recentes", value: JSON.stringify(novos), updated_at: new Date().toISOString() });
  return { title: out.title, items: out.items, postar: false };
}

async function main() {
  const r = process.argv.includes("--auto") ? await autoRoteiro() : JSON.parse(process.env.REELS_TOP || "{}");
  if (!r.title || !r.items?.length) throw new Error("Roteiro vazio (REELS_TOP)");
  const ids = r.items.map((i) => Number(i.id));
  const { data: offers, error } = await sb.from("offers").select("id,title,image_url,price").in("id", ids);
  if (error) throw new Error(error.message);
  const byId = new Map((offers || []).map((o) => [o.id, o]));
  const outDir = path.join(HERE, "saida", "top", `${Date.now()}`);
  await mkdir(outDir, { recursive: true });

  const items = [];
  for (const it of r.items) {
    const o = byId.get(Number(it.id));
    if (!o?.image_url) { log(`#${it.id} não está na vitrine (ou sem foto); pulei`); continue; }
    let clipFile = null;
    if (it.sku && hasCJ()) {
      try {
        const prod = await productBySku(it.sku);
        const best = prod ? bestFreeVideo(await productVideos(prod.pid)) : null;
        if (best) { clipFile = await downloadVideo(best.url, path.join(outDir, `cj-${it.id}.mp4`)); log(`#${it.id}: vídeo da CJ (${best.duration.toFixed(0)} s)`); }
        else log(`#${it.id}: SKU ${it.sku} sem vídeo grátis; vai com a foto`);
      } catch (e) { log(`#${it.id}: CJ ${e.message}; vai com a foto`); }
    }
    let fala = (it.fala || "").slice(0, 300);
    if (!fala && process.env.ANTHROPIC_API_KEY) fala = await gerarNarracao({ name: o.title, price: Number(o.price) || 0 }, { max: 140, log });
    items.push({ id: o.id, name: shortName(o.title, 5), imageUrl: o.image_url, price: Number(o.price) || 0, fala, clipFile });
  }
  if (!items.length) throw new Error("Nenhum produto válido no roteiro");

  // cupom ativo? avatar do perfil?
  const agora = new Date().toISOString();
  const { count } = await sb.from("offers").select("id", { count: "exact", head: true }).eq("active", true).eq("kind", "cupom").or(`expires_at.is.null,expires_at.gt.${agora}`);
  let avatar = null;
  try {
    const { data: av } = await sb.storage.from("capas").list("avatar", { limit: 20, sortBy: { column: "name", order: "desc" } });
    const last = (av || []).find((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    if (last) {
      const { data } = await sb.storage.from("capas").download(`avatar/${last.name}`);
      avatar = path.join(outDir, "avatar" + path.extname(last.name));
      await writeFile(avatar, Buffer.from(await data.arrayBuffer()));
    }
  } catch {}

  const { file, seconds } = await renderTop({ title: r.title, items, outDir, handle: env("INSTAGRAM_HANDLE", "@minh.asofertas"), avatar, cupom: (count || 0) > 0, log });
  log(`Vídeo pronto: ${seconds.toFixed(1)} s`);

  const legenda = [
    `${r.title.replace(/\*/g, "")} 👀`,
    "",
    ...items.map((it, k) => `${k + 1}. ${it.name} → #${it.id}`),
    "",
    "Qual você levaria? Comenta o número 👇",
    "",
    "✅ Me segue que todo dia tem achado novo abaixo de R$ 50!",
    `🔎 Link na bio! Procura os números na busca da vitrine${count ? " (e tem cupom da Shopee lá 🎟️)" : ""}.`,
    "",
    "#achadinhos #achadinhosshopee #shopee #achadosdashopee #comprinhas",
  ].join("\n");
  await writeFile(path.join(outDir, "legenda.txt"), legenda + "\n");

  const postarJa = Boolean(r.postar);
  if (hasTelegram()) {
    let markup = null;
    if (!postarJa && hasMeta()) {
      try {
        const [video_url] = await uploadPublic([file], `top-${Date.now()}`, "video/mp4");
        const { data, error: e } = await sb.from("reels_pendentes").insert({ offer_id: items[0].id, video_url, caption: legenda }).select("id").single();
        if (e) throw new Error(e.message);
        markup = { inline_keyboard: [[{ text: "📤 Postar no Instagram", callback_data: `pub:${data.id}` }], [{ text: "🗑️ Descartar", callback_data: `nopub:${data.id}` }]] };
      } catch (e) { log(`  aprovação: ${e.message}`); }
    }
    await sendVideo(file, `🎬 Top ${items.length} (${seconds.toFixed(0)} s)${postarJa ? " · postando no Instagram…" : ""}\n\nLegenda:\n\n${legenda}`.slice(0, 1024), markup);
    log("Enviado no Telegram.");
  }
  if (postarJa) {
    if (!hasMeta()) throw new Error("Falta META_PAGE_TOKEN para postar.");
    log(`Postado: ${await postReel(file, legenda, `top-${Date.now()}`)}`);
  }
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
