// Reels do achado: vídeo vertical 1080×1920, ~15-20 s, feito só com a foto do produto e os dados reais.
// Cada cena dura o tempo da fala. O desenho é HTML animado quadro a quadro (Playwright) e o
// vídeo é montado com FFmpeg (já vem instalado no GitHub Actions).
import { mkdir, writeFile, rm } from "fs/promises";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { imageDataUri } from "./carrossel.mjs";
import { narrate } from "./voz.mjs";
import { brl, salesLabel } from "./textos.mjs";
import { marcaDagua } from "./marca.mjs";

const run = promisify(execFile);
const FPS = 30;
const W = 1080, H = 1920;

const num = (v) => String(v).replace(".", ",");

// Falas e cenas a partir do produto e dos textos (os números vêm sempre dos dados)
export function buildScenes(p, texts, { number }) {
  const scenes = [];
  scenes.push({ key: "gancho", say: texts.gancho, min: 2.4 });

  const info = [texts.nome + "."];
  if (p.rating) info.push(`Nota ${num(Number(p.rating).toFixed(1))}`);
  if (p.sales) info.push(`${p.rating ? "com " : ""}${salesLabel(p.sales)} vendidos.`);
  scenes.push({ key: "info", say: info.join(" ").replace(/\.\s*com/, ", com"), min: 2.6 });

  if (texts.destaques?.length) scenes.push({ key: "destaques", say: texts.destaques.join(". ") + ".", min: 3.2 });

  if (p.price) {
    const say = p.originalPrice && p.originalPrice > p.price
      ? `De ${brl(p.originalPrice)}, por apenas ${brl(p.price)}.`
      : `Por apenas ${brl(p.price)}.`;
    scenes.push({ key: "preco", say, min: 2.6 });
  }

  const n = number ? number.replace("#", "") : null;
  scenes.push({
    key: "cta",
    say: n ? `Corre! Link na bio. Digita o número ${n} na busca.` : "Corre! O link tá na bio.",
    min: 3.2,
  });
  return scenes;
}

function pageHtml() {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #111; }
  body { font-family: "Plus Jakarta Sans", Inter, "DejaVu Sans", system-ui, sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
  .abs { position: absolute; }
  #bg { inset: -80px; background-size: cover; background-position: center; filter: blur(48px) brightness(.42) saturate(1.25); transform-origin: center; }
  #shade { inset: 0; background: linear-gradient(180deg, rgba(0,0,0,.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 62%, rgba(0,0,0,.55) 100%); }
  #brand { left: 80px; top: 150px; display: flex; align-items: center; gap: 14px; font-weight: 800; font-size: 30px; letter-spacing: .08em; text-transform: uppercase; }
  #brand i { width: 16px; height: 16px; border-radius: 50%; background: #EE4D2D; box-shadow: 0 0 0 6px rgba(238,77,45,.3); }
  #card { left: 130px; top: 0; width: 820px; height: 820px; border-radius: 52px; background: #fff; overflow: hidden;
          box-shadow: 0 40px 90px rgba(0,0,0,.55); transform-origin: 50% 0; }
  #card img { width: 100%; height: 100%; object-fit: contain; transform-origin: 50% 50%; }
  #badge { width: 220px; height: 220px; border-radius: 50%; background: #EE4D2D; display: grid; place-items: center;
           font-weight: 800; font-size: 66px; letter-spacing: -.02em; box-shadow: 0 18px 40px rgba(238,77,45,.5); }
  .big { font-weight: 800; letter-spacing: -.02em; line-height: 1.08; text-wrap: balance; }
  #hook { left: 80px; right: 80px; top: 250px; font-size: 84px; text-shadow: 0 6px 30px rgba(0,0,0,.5); }
  #hook mark { background: #EE4D2D; color: #fff; padding: 0 14px; border-radius: 14px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  #name { left: 80px; right: 80px; font-size: 66px; text-align: center; }
  #chips { left: 0; right: 0; display: flex; justify-content: center; gap: 22px; }
  .chip { display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,.14); border: 2px solid rgba(255,255,255,.25);
          padding: 18px 30px; border-radius: 999px; font-size: 44px; font-weight: 700; backdrop-filter: blur(6px); }
  .chip svg { width: 44px; height: 44px; }
  #bullets { left: 90px; right: 90px; display: grid; gap: 30px; }
  .bullet { display: flex; align-items: center; gap: 26px; font-size: 56px; font-weight: 800; line-height: 1.12; }
  .bullet b { flex: none; width: 74px; height: 74px; border-radius: 50%; background: #EE4D2D; display: grid; place-items: center; }
  .bullet b svg { width: 42px; height: 42px; }
  #price { left: 0; right: 0; text-align: center; }
  #old { display: inline-block; position: relative; font-size: 72px; font-weight: 700; color: rgba(255,255,255,.75); }
  #old s { position: absolute; left: -8px; top: 52%; height: 7px; background: #EE4D2D; border-radius: 4px; text-decoration: none; }
  #por { font-size: 50px; font-weight: 700; margin-top: 18px; color: rgba(255,255,255,.85); }
  #new { font-size: 196px; font-weight: 800; letter-spacing: -.04em; color: #FFB199; line-height: 1; margin-top: 4px; transform-origin: 50% 60%; }
  #cta { left: 0; right: 0; text-align: center; }
  #cta h2 { font-size: 92px; }
  #search { margin: 54px auto 0; width: 900px; height: 160px; border-radius: 40px; background: #fff; color: #1c1917; display: flex; align-items: center;
            gap: 26px; padding: 0 44px; font-size: 76px; font-weight: 800; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
  #search svg { width: 58px; height: 58px; flex: none; color: #8a817a; }
  #caret { width: 6px; height: 70px; background: #EE4D2D; border-radius: 3px; }
  #bio { margin-top: 70px; font-size: 62px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 18px; }
  #bio svg { width: 60px; height: 60px; color: #EE4D2D; }
  #handle { margin-top: 16px; font-size: 46px; font-weight: 700; color: rgba(255,255,255,.75); }
</style></head><body>
  <div id="bg" class="abs"></div><div id="shade" class="abs"></div>
  <div id="brand" class="abs"><i></i><span>Achadinho da Shopee</span></div>
  <div id="card" class="abs"><img id="photo" alt=""></div>
  <div id="badge" class="abs"></div>
  <div id="hook" class="abs big"></div>
  <div id="name" class="abs big"></div>
  <div id="chips" class="abs"></div>
  <div id="bullets" class="abs"></div>
  <div id="price" class="abs"><div id="old"><span id="oldv"></span><s></s></div><div id="por">por apenas</div><div id="new"></div></div>
  <div id="cta" class="abs">
    <h2 class="big">Gostou? Corre!</h2>
    <div id="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span id="typed"></span><i id="caret"></i></div>
    <div id="bio"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg><span>Link na bio</span></div>
    <div id="handle"></div>
  </div>
<script>
const STAR = '<svg viewBox="0 0 24 24" fill="#FFC53D"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>';
const BAG = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l1 13H5L6 7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const back = (x) => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const lerp = (a, b, k) => a + (b - a) * k;
let D = null, starts = [];

// posição do card (y, escala) em cada cena
const CARD = { gancho: [560, 1.0], info: [380, 0.98], destaques: [330, 0.62], preco: [380, 0.72], cta: [380, 0.6] };

window.setup = (data) => {
  D = data;
  $("bg").style.backgroundImage = "url(" + data.img + ")";
  $("photo").src = data.img;
  $("hook").innerHTML = data.hookHtml;
  $("name").textContent = data.nome;
  $("chips").innerHTML = (data.rating ? '<div class="chip">' + STAR + data.rating + '</div>' : '') + (data.sales ? '<div class="chip">' + BAG + data.sales + ' vendidos</div>' : '');
  $("bullets").innerHTML = data.destaques.map((d) => '<div class="bullet"><b>' + CHECK + '</b><span>' + d + '</span></div>').join("");
  $("badge").textContent = data.discount ? "-" + data.discount + "%" : "";
  $("badge").style.display = data.discount ? "grid" : "none";
  $("oldv").textContent = data.oldPrice || "";
  $("old").style.display = data.oldPrice ? "inline-block" : "none";
  $("new").textContent = data.newPrice || "";
  $("handle").textContent = data.handle || "";
  starts = []; let acc = 0;
  for (const s of data.scenes) { starts.push(acc); acc += s.dur; }
  return document.fonts.ready.then(() => new Promise((r) => $("photo").complete ? r() : ($("photo").onload = r)));
};

function show(el, k, dy = 40) { el.style.opacity = k; el.style.transform = "translateY(" + (1 - k) * dy + "px)"; }

window.render = (t) => {
  const keys = D.scenes.map((s) => s.key);
  let i = 0; while (i < starts.length - 1 && t >= starts[i + 1]) i++;
  const key = keys[i], lt = t - starts[i], dur = D.scenes[i].dur;
  const out = clamp((dur - lt) / 0.22);           // some no finalzinho da cena
  const vis = (k) => (k === key ? 1 : 0);

  // fundo respira devagar
  $("bg").style.transform = "scale(" + (1.15 + 0.06 * Math.sin(t / 3)) + ")";

  // card: vai da posição da cena anterior para a desta
  const prev = CARD[keys[i - 1]] || [CARD.gancho[0] + 120, 1.12];
  const cur = CARD[key];
  const m = ease(lt / 0.55);
  const y = lerp(prev[0], cur[0], m), s = lerp(prev[1], cur[1], m);
  const intro = i === 0 ? ease(lt / 0.6) : 1;
  $("card").style.transform = "translateY(" + y + "px) scale(" + s + ")";
  $("card").style.opacity = intro;
  $("photo").style.transform = "scale(" + (1.0 + 0.07 * (lt / dur)) + ")";   // zoom lento (Ken Burns)

  // selo de desconto: entra no gancho e acompanha o card até o preço
  const badgeOn = key === "gancho" || key === "info" || key === "preco";
  const bk = badgeOn ? back((lt - (key === "gancho" ? 0.55 : 0.25)) / 0.45) : 0;
  $("badge").style.left = (130 + 820 * s - 170) + "px";
  $("badge").style.top = (y - 70) + "px";
  $("badge").style.transform = "rotate(-10deg) scale(" + (bk * (key === "preco" ? 1.1 : 1)) + ")";

  // gancho
  show($("hook"), vis("gancho") * ease((lt - 0.15) / 0.4) * out, -50);
  $("brand").style.opacity = key === "gancho" ? 0 : (key === "cta" ? 0 : 0.95 * ease(lt / 0.4));

  // nome + chips
  const cardBottom = (k) => CARD[k][0] + 820 * CARD[k][1];
  $("name").style.top = (cardBottom("info") + 60) + "px";
  show($("name"), vis("info") * ease((lt - 0.2) / 0.4) * out);
  $("chips").style.top = (cardBottom("info") + 260) + "px";
  show($("chips"), vis("info") * ease((lt - 0.6) / 0.4) * out, 60);

  // destaques, um por vez
  $("bullets").style.top = (cardBottom("destaques") + 90) + "px";
  const bl = [...$("bullets").children];
  const gap = Math.min(0.75, (dur - 0.8) / Math.max(1, bl.length));
  bl.forEach((b, j) => show(b, vis("destaques") * ease((lt - 0.35 - j * gap) / 0.35) * out, 0) || (b.style.transform = "translateX(" + (1 - ease((lt - 0.35 - j * gap) / 0.35)) * -60 + "px)"));
  $("bullets").style.opacity = vis("destaques");

  // preço: risca o antigo e o novo "pula"
  $("price").style.top = (cardBottom("preco") + 70) + "px";
  $("price").style.opacity = vis("preco") * out;
  show($("old"), ease((lt - 0.15) / 0.3), 20);
  $("old").querySelector("s").style.width = (ease((lt - 0.45) / 0.35) * ($("oldv").offsetWidth + 16)) + "px";
  show($("por"), ease((lt - 0.7) / 0.3), 20);
  const pk = back((lt - 0.95) / 0.5);
  $("new").style.opacity = clamp((lt - 0.95) / 0.2);
  $("new").style.transform = "scale(" + (0.4 + 0.6 * pk) + ")";

  // chamada: digita o número na busca e a seta pula
  $("cta").style.top = (cardBottom("cta") + 80) + "px";
  $("cta").style.opacity = vis("cta");
  show($("cta").querySelector("h2"), ease((lt - 0.1) / 0.35));
  show($("search"), ease((lt - 0.35) / 0.35), 30);
  const txt = D.number || "";
  $("typed").textContent = txt.slice(0, Math.floor(clamp((lt - 0.8) / 0.7) * (txt.length + 0.999)));
  $("caret").style.opacity = Math.floor(t * 2.2) % 2 ? 0.15 : 1;
  const bounce = Math.abs(Math.sin(t * 5)) * 18;
  show($("bio"), ease((lt - 1.3) / 0.35), 30);
  $("bio").querySelector("svg").style.transform = "translateY(" + -bounce + "px)";
  show($("handle"), ease((lt - 1.5) / 0.35), 20);
};
</script></body></html>`;
}

// Destaca 1-2 palavras do gancho (números/%/OFF ou a última palavra forte)
function hookHtml(text) {
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const safe = esc(text);
  const m = safe.match(/\d+\s?%\s?OFF|\d+\s?%|R\$\s?[\d.,]+/i);
  if (m) return safe.replace(m[0], `<mark>${m[0]}</mark>`);
  const words = safe.split(" ");
  const idx = words.findIndex((w) => /shopee|achad|barat|incr[ií]vel|viral/i.test(w));
  if (idx >= 0) words[idx] = `<mark>${words[idx]}</mark>`;
  return words.join(" ");
}

export async function encodeFrames(page, totalSec, outFile) {
  const frames = Math.ceil(totalSec * FPS);
  const ff = spawn("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-maxrate", "6M", "-bufsize", "12M", "-pix_fmt", "yuv420p", "-r", String(FPS), outFile,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise((res, rej) => ff.on("close", (c) => (c === 0 ? res() : rej(new Error("FFmpeg falhou ao montar o vídeo")))));
  for (let f = 0; f < frames; f++) {
    await page.evaluate((t) => window.render(t), f / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 90 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await done;
  return frames;
}

export async function mixAudio(video, voice, scenes, music, totalSec, outFile) {
  const inputs = ["-i", video];
  const parts = [];
  let n = 1;
  voice.forEach((v, i) => {
    if (!v.file) return;
    inputs.push("-i", v.file);
    parts.push(`[${n}:a]adelay=${Math.round((scenes[i].start + 0.18) * 1000)}:all=1,volume=1.0[v${n}]`);
    n++;
  });
  const voiceLabels = parts.map((p) => p.match(/\[(v\d+)\]$/)[1]);
  if (music) {
    inputs.push("-stream_loop", "-1", "-i", music);
    parts.push(`[${n}:a]volume=${voiceLabels.length ? 0.13 : 0.35},atrim=0:${totalSec.toFixed(2)},afade=t=out:st=${(totalSec - 1).toFixed(2)}:d=1[m]`);
    voiceLabels.push("m");
    n++;
  }
  if (!voiceLabels.length) {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", video, "-f", "lavfi", "-t", totalSec.toFixed(2), "-i", "anullsrc=r=44100:cl=stereo",
      "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", outFile]);
    return;
  }
  const mix = `${voiceLabels.map((l) => `[${l}]`).join("")}amix=inputs=${voiceLabels.length}:normalize=0,apad,atrim=0:${totalSec.toFixed(2)}[a]`;
  await run("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", [...parts, mix].join(";"),
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-movflags", "+faststart", outFile]);
}

/**
 * Gera o Reels. Devolve { file, seconds, scenes }.
 * p: { name, imageUrl, price, originalPrice, discount, rating, sales }
 * texts: { nome, gancho, destaques }
 */
export async function renderReel(p, texts, { outDir, number, handle, music, log = console.log }) {
  const { chromium } = await import("playwright");
  await mkdir(outDir, { recursive: true });
  const tmp = path.join(outDir, "_reels_tmp");
  await mkdir(tmp, { recursive: true });

  const scenes = buildScenes(p, texts, { number });
  const voice = await narrate(scenes.map((s) => s.say), tmp, log);
  let acc = 0;
  scenes.forEach((s, i) => {
    s.dur = Math.max(s.min, voice[i].duration + 0.5);
    s.start = acc;
    acc += s.dur;
  });
  const total = acc;
  log(`Reels: ${scenes.length} cenas, ${total.toFixed(1)} s`);

  const discount = p.discount ? Math.round(p.discount)
    : p.originalPrice && p.price && p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
  const data = {
    img: await imageDataUri(p.imageUrl),
    hookHtml: hookHtml(texts.gancho),
    nome: texts.nome,
    rating: p.rating ? num(Number(p.rating).toFixed(1)) : "",
    sales: p.sales ? salesLabel(p.sales) : "",
    destaques: (texts.destaques || []).slice(0, 3),
    discount: discount >= 5 ? discount : 0,
    oldPrice: p.originalPrice && p.originalPrice > p.price ? brl(p.originalPrice) : "",
    newPrice: p.price ? brl(p.price) : "",
    number: number || "",
    handle: handle || "",
    scenes: scenes.map(({ key, dur }) => ({ key, dur })),
  };

  const browser = await chromium.launch();
  const silent = path.join(tmp, "video.mp4");
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.setContent(pageHtml(), { waitUntil: "load", timeout: 15000 }).catch(() => {});
    await page.evaluate((d) => window.setup(d), data);
    await encodeFrames(page, total, silent);
  } finally {
    await browser.close();
  }

  const file = path.join(outDir, "reels.mp4");
  await mixAudio(silent, voice, scenes, music, total, file);
  await writeFile(path.join(outDir, "reels-roteiro.txt"), scenes.map((s, i) => `${i + 1}. [${s.key}] ${s.say}`).join("\n") + "\n");
  await rm(tmp, { recursive: true, force: true });
  await marcaDagua(file, typeof log === "function" ? log : console.log);
  return { file, seconds: total, scenes };
}
