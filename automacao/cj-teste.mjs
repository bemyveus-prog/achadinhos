#!/usr/bin/env node
// Teste: quantos produtos genéricos têm vídeo GRÁTIS na CJ, e manda o melhor de cada busca no Telegram.
import path from "path";
import { mkdir, stat } from "fs/promises";
import { hasCJ, searchVideoProducts, productVideos, downloadVideo } from "./lib/cj.mjs";
import { hasTelegram, sendText, sendVideo } from "./lib/telegram.mjs";

const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const BUSCAS = (process.env.CJ_BUSCAS || "kitchen organizer|silicone spatula set|drawer organizer|car phone holder|led strip light").split("|");

async function main() {
  if (!hasCJ()) throw new Error("Falta o secret CJ_API_KEY");
  const out = path.resolve("saida/cj"); await mkdir(out, { recursive: true });
  const resumo = [];
  for (const kw of BUSCAS) {
    log(`Busca "${kw}"`);
    let prods = [];
    try { prods = await searchVideoProducts(kw, 8); } catch (e) { log(`  falhou: ${e.message}`); resumo.push(`❌ ${kw}: ${e.message}`); continue; }
    let free = 0, paid = 0, best = null;
    for (const p of prods.slice(0, 4)) {
      let vids = [];
      try { vids = await productVideos(p.id); } catch (e) { log(`  vídeos ${p.id}: ${e.message}`); continue; }
      for (const v of vids) {
        v.free ? free++ : paid++;
        log(`  ${v.free ? "GRÁTIS" : "pago  "} ${v.duration.toFixed(0)}s ${v.w}x${v.h} ▶${v.plays} ♥${v.likes} ⬇${v.downloads} · ${p.name.slice(0, 50)}`);
        if (v.free && v.url && (!best || v.downloads + v.plays > best.v.downloads + best.v.plays)) best = { p, v };
      }
    }
    resumo.push(`${best ? "✅" : "⚪"} ${kw}: ${prods.length} produtos com vídeo · ${free} vídeos grátis, ${paid} pagos`);
    if (best && hasTelegram()) {
      try {
        const f = await downloadVideo(best.v.url, path.join(out, `${kw.replace(/\W+/g, "-")}.mp4`));
        const mb = (await stat(f)).size / 1e6;
        if (mb < 49) await sendVideo(f, `🎥 CJ (grátis) para "${kw}"\n${best.p.name}\n${best.v.duration.toFixed(0)} s · ${best.v.w}x${best.v.h} · ▶${best.v.plays}`);
        else log(`  vídeo grande demais para o Telegram (${mb.toFixed(0)} MB)`);
      } catch (e) { log(`  download/envio: ${e.message}`); }
    }
  }
  log("\n" + resumo.join("\n"));
  if (hasTelegram()) await sendText("🎥 Teste da CJ (vídeos de produto)\n\n" + resumo.join("\n")).catch(() => {});
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
