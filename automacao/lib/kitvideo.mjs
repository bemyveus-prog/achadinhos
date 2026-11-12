// Vídeo infográfico "Kit de emergência 72h" (1080×1920), no estilo guia oficial:
// fundo azul-marinho, destaques em amarelo, números grandes e garrafinhas de água.
// Todos os números foram conferidos nas fontes (ver FONTES no fim do arquivo).
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";
import { narrate } from "./voz.mjs";
import { encodeFrames, mixAudio } from "./reels.mjs";
import { marcaDagua } from "./marca.mjs";

const W = 1080, H = 1920;

// ---------- desenhos ----------
const bottle = (label = "") => `<svg class="bt" viewBox="0 0 60 120"><rect x="22" y="2" width="16" height="10" rx="3" fill="#2E7DB5"/>
<path d="M18 14h24l6 14v84a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6V28z" fill="#4FC3F7"/><path d="M18 14h24l6 14v84a6 6 0 0 1-6 6h-6V14z" fill="#3BA9DB"/>
<rect x="12" y="50" width="36" height="24" fill="#fff" opacity=".92"/>${label ? `<text x="30" y="67" text-anchor="middle" font-size="14" font-weight="800" fill="#1B4F72">${label}</text>` : ""}</svg>`;

const FLAGS = {
  ue: `<svg viewBox="0 0 90 60"><rect width="90" height="60" fill="#1F3FA6"/>${Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * 2 * Math.PI; return `<circle cx="${45 + 18 * Math.cos(a)}" cy="${30 + 18 * Math.sin(a)}" r="2.6" fill="#FFD617"/>`; }).join("")}</svg>`,
  uk: `<svg viewBox="0 0 90 60"><rect width="90" height="60" fill="#22307A"/><path d="M0 0L90 60M90 0L0 60" stroke="#fff" stroke-width="12"/>
<path d="M0 0L90 60M90 0L0 60" stroke="#C8102E" stroke-width="4"/><path d="M45 0v60M0 30h90" stroke="#fff" stroke-width="18"/><path d="M45 0v60M0 30h90" stroke="#C8102E" stroke-width="10"/></svg>`,
  mx: `<svg viewBox="0 0 90 60"><rect width="30" height="60" fill="#006847"/><rect x="30" width="30" height="60" fill="#fff"/><rect x="60" width="30" height="60" fill="#CE1126"/><circle cx="45" cy="30" r="8" fill="#8C5A2B"/></svg>`,
  ca: `<svg viewBox="0 0 90 60"><rect width="90" height="60" fill="#fff"/><rect width="22" height="60" fill="#D52B1E"/><rect x="68" width="22" height="60" fill="#D52B1E"/>
<path d="M45 14l3 7 5-2-2 9 5-3 1 4 6-1-3 6 3 2-11 6 1 5h-6l1-5-11-6 3-2-3-6 6 1 1-4 5 3-2-9 5 2z" fill="#D52B1E"/></svg>`,
  us: `<svg viewBox="0 0 90 60"><rect width="90" height="60" fill="#fff"/>${Array.from({ length: 7 }, (_, i) => `<rect y="${i * 60 / 6.5}" width="90" height="${60 / 13}" fill="#B22234"/>`).join("")}
<rect width="38" height="32" fill="#3C3B6E"/>${Array.from({ length: 20 }, (_, i) => `<circle cx="${5 + (i % 5) * 7}" cy="${5 + Math.floor(i / 5) * 7.5}" r="1.4" fill="#fff"/>`).join("")}</svg>`,
  br: `<svg viewBox="0 0 90 60"><rect width="90" height="60" fill="#009C3B"/><path d="M45 6L84 30 45 54 6 30z" fill="#FFDF00"/><circle cx="45" cy="30" r="13" fill="#002776"/>
<path d="M33 27q12-4 24 5" stroke="#fff" stroke-width="2" fill="none"/></svg>`,
};

const ICONS = {
  comida: `<svg viewBox="0 0 24 24"><rect x="5" y="6" width="14" height="14" rx="2"/><path d="M5 10h14M8 3h8l1 3H7z"/></svg>`,
  lanterna: `<svg viewBox="0 0 24 24"><path d="M8 3h8v5l-2 3v10h-4V11L8 8z"/><path d="M12 14v2"/></svg>`,
  radio: `<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="12" rx="2"/><circle cx="15.5" cy="14" r="3"/><path d="M6 12h4M6 15h4M7 8l10-5"/></svg>`,
  bateria: `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M10 2h4M12 9l-2 4h4l-2 4"/></svg>`,
  socorro: `<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6V4h6v2M12 10v6M9 13h6"/></svg>`,
  documento: `<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>`,
  calendario: `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4"/></svg>`,
  alerta: `<svg viewBox="0 0 24 24"><path d="M12 3L2 21h20z" fill="#F6D32D" stroke="#F6D32D"/><path d="M12 10v5" stroke="#10161F" stroke-width="2.4"/><circle cx="12" cy="18" r="1.3" fill="#10161F" stroke="none"/></svg>`,
};

const hl = (t) => `<span class="hl">${t}</span>`;

// ---------- cenas ----------
export function kitScenes({ handle }) {
  return [
    {
      key: "gancho", min: 3.6,
      say: "Se faltar água e luz por três dias, a sua casa aguenta?",
      html: `<div class="icon-alert" data-pop="0.1">${ICONS.alerta}</div>
        <div class="eyebrow" data-in="0.2">Alerta de preparação</div>
        <h1 data-in="0.35">Se faltar ${hl("água e luz")}…</h1>
        <p class="lead" data-in="1.1">e o socorro demorar <b>3 dias</b>, sua casa aguenta?</p>`,
    },
    {
      key: "72h", min: 4,
      say: "Vários países já pedem um kit de emergência para setenta e duas horas.",
      html: `<div class="eyebrow" data-in="0.1">A referência no mundo</div>
        <div class="mega" data-pop="0.3"><span data-count="72" data-from="0" data-at="0.3">72</span><small>horas</small></div>
        <p class="lead" data-in="0.9">de autonomia para cada família, com água, comida e o básico</p>`,
    },
    {
      key: "paises", min: 4.4,
      say: "União Europeia, Reino Unido, México e Canadá usam três dias como referência.",
      html: `<div class="eyebrow" data-in="0.1">Guias oficiais de preparação</div>
        <h2 data-in="0.2">Quem já ${hl("recomenda")}</h2>
        <div class="rows">
          ${[["ue", "União Europeia", "mínimo de 72 h"], ["uk", "Reino Unido", "3 dias"], ["mx", "México", "72 h"], ["ca", "Canadá", "72 h"]]
            .map(([f, n, v], i) => `<div class="row" data-in="${0.5 + i * 0.45}"><span class="flag">${FLAGS[f]}</span><b>${n}</b><em>${v}</em></div>`).join("")}
        </div>`,
    },
    {
      key: "agua-mundo", min: 4.6,
      say: "Na água: dois litros por pessoa, por dia, no Canadá. Quase quatro, nos Estados Unidos.",
      html: `<div class="eyebrow" data-in="0.1">E a água?</div>
        <h2 data-in="0.2">Por pessoa, ${hl("por dia")}</h2>
        <div class="cards">
          <div class="card" data-in="0.5"><span class="flag">${FLAGS.ca}</span><b>Canadá</b><div class="big"><span data-count="2" data-from="0" data-at="0.7">2</span> L</div><small>Governo do Canadá</small></div>
          <div class="card" data-in="1.4"><span class="flag">${FLAGS.us}</span><b>Estados Unidos</b><div class="big">≈ <span data-count="3.8" data-from="0" data-at="1.6" data-dec="1">3,8</span> L</div><small>FEMA · 1 galão</small></div>
        </div>`,
    },
    {
      key: "brasil", min: 4.6,
      say: "E no Brasil? Não há campanha nacional, mas a Defesa Civil de São Paulo orienta três dias.",
      html: `<span class="flag flag-big" data-pop="0.1">${FLAGS.br}</span>
        <h1 data-in="0.3">E no ${hl("Brasil")}?</h1>
        <p class="lead" data-in="0.9">Ainda não há uma campanha nacional.</p>
        <div class="card wide" data-in="1.8"><small>Defesa Civil de São Paulo</small><div class="big">água e comida para <span class="y">3 dias</span></div></div>`,
    },
    {
      key: "6L", min: 5.4,
      say: "No Paraná, a conta é dois litros por pessoa, por dia. Seis litros em três dias.",
      html: `<div class="eyebrow" data-in="0.1">Referência da Defesa Civil do Paraná</div>
        <h2 data-in="0.2">A conta começa ${hl("pela água.")}</h2>
        <p class="cyan" data-in="0.6">2 L por pessoa, por dia</p>
        <div class="days">${[1, 2, 3].map((d) => `<div class="day"><div class="pair">${[0, 1].map((b) => `<span data-pop="${0.9 + (d - 1) * 0.5 + b * 0.15}">${bottle("1L")}</span>`).join("")}</div><i></i><b data-in="${1 + (d - 1) * 0.5}">DIA ${d}</b></div>`).join("")}</div>
        <div class="mega y" data-pop="2.6"><span data-count="6" data-from="0" data-at="2.6">6</span> L</div>
        <p class="lead" data-in="2.9">por pessoa para três dias</p>`,
    },
    {
      key: "24L", min: 4.4,
      say: "Pra quatro pessoas, vinte e quatro litros.",
      html: `<h2 data-in="0.1">Quatro moradores ${hl("em casa.")}</h2>
        <div class="family">${[1, 2, 3, 4].map((r) => `<div class="frow" data-in="${0.3 + (r - 1) * 0.25}"><span class="n">${r}</span><div class="bts">${Array.from({ length: 6 }, (_, b) => `<span data-pop="${0.35 + (r - 1) * 0.25 + b * 0.05}">${bottle()}</span>`).join("")}</div><b>6 L</b></div>`).join("")}</div>
        <div class="mega y" data-pop="1.6"><span data-count="24" data-from="0" data-at="1.6">24</span> L</div>
        <p class="lead" data-in="1.9">para quatro pessoas em três dias</p>`,
    },
    {
      key: "kit", min: 5.2,
      say: "E mais: comida que não estraga, lanterna, rádio, carregador, primeiros socorros e documentos.",
      html: `<div class="eyebrow" data-in="0.1">Além da água</div>
        <h2 data-in="0.2">O que mais ter ${hl("no kit")}</h2>
        <div class="items">${[["comida", "Comida que não estraga"], ["lanterna", "Lanterna e pilhas"], ["radio", "Rádio a pilha"], ["bateria", "Carregador portátil"], ["socorro", "Primeiros socorros e remédios de uso contínuo"], ["documento", "Documentos em saco plástico"]]
          .map(([ic, t], i) => `<div class="item" data-in="${0.5 + i * 0.6}"><span class="ic">${ICONS[ic]}</span><b>${t}</b></div>`).join("")}</div>`,
    },
    {
      key: "revisar", min: 3.4,
      say: "Revise tudo a cada seis meses.",
      html: `<div class="icon-cal" data-pop="0.1">${ICONS.calendario}</div>
        <h1 data-in="0.3">Revise a cada ${hl("6 meses")}</h1>
        <p class="lead" data-in="0.9">e troque água, comida e pilhas que venceram</p>`,
    },
    {
      key: "cta", min: 4.8,
      say: "Os itens do kit estão na vitrine do link da bio. Toque em Kit Emergência.",
      html: `<div class="eyebrow" data-in="0.1">Montei o kit pra você</div>
        <h2 data-in="0.2">Todos os itens na ${hl("vitrine da bio")}</h2>
        <div class="chips" data-in="0.9"><span class="chip">Todos</span><span class="chip on" data-tap="1.6">Kit Emergência</span><span class="chip">Casa</span></div>
        <div class="bio" data-in="1.4"><span class="arrow">↑</span> Link na bio</div>
        ${handle ? `<p class="handle" data-in="1.7">${handle}</p>` : ""}`,
    },
  ];
}

function pageHtml(scenes) {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #10161F; }
  body { font-family: "Plus Jakarta Sans", Inter, "DejaVu Sans", sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
  #grid { position: absolute; inset: -60px; background-image: linear-gradient(rgba(255,255,255,.035) 2px, transparent 2px),
          linear-gradient(90deg, rgba(255,255,255,.035) 2px, transparent 2px); background-size: 90px 90px; }
  #glow { position: absolute; inset: 0; background: radial-gradient(1100px 900px at 50% 38%, rgba(246,211,45,.07), transparent 70%); }
  .scene { position: absolute; left: 0; right: 0; top: 230px; bottom: 380px; padding: 0 80px; display: flex; flex-direction: column;
           align-items: center; justify-content: center; text-align: center; gap: 34px; opacity: 0; }
  .eyebrow { color: #F6D32D; font-weight: 800; font-size: 36px; letter-spacing: .06em; text-transform: uppercase; }
  h1 { font-size: 112px; font-weight: 800; letter-spacing: -.035em; line-height: 1.04; text-wrap: balance; }
  h2 { font-size: 88px; font-weight: 800; letter-spacing: -.03em; line-height: 1.06; text-wrap: balance; }
  .hl { background: #F6D32D; color: #10161F; padding: 0 16px; border-radius: 10px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  .lead { font-size: 50px; font-weight: 700; color: rgba(255,255,255,.86); line-height: 1.25; max-width: 900px; text-wrap: balance; }
  .lead b, .y { color: #F6D32D; }
  .cyan { font-size: 64px; font-weight: 800; color: #4FC3F7; }
  .mega { font-size: 300px; font-weight: 800; letter-spacing: -.05em; line-height: .9; display: flex; align-items: baseline; gap: 22px; }
  .mega small { font-size: 96px; letter-spacing: -.02em; color: #F6D32D; }
  .mega.y { color: #F6D32D; font-size: 260px; }
  .icon-alert svg, .icon-cal svg { width: 230px; height: 230px; }
  .icon-cal svg { fill: none; stroke: #F6D32D; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  .flag svg { display: block; width: 100%; height: 100%; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.4); }
  .flag { width: 150px; height: 100px; flex: none; }
  .flag-big { width: 300px; height: 200px; }
  .rows { width: 100%; display: grid; gap: 26px; margin-top: 10px; }
  .row { display: flex; align-items: center; gap: 34px; background: rgba(255,255,255,.06); border: 2px solid rgba(255,255,255,.1);
         border-radius: 28px; padding: 26px 34px; text-align: left; }
  .row b { flex: 1; font-size: 54px; font-weight: 800; }
  .row em { font-style: normal; font-size: 50px; font-weight: 800; color: #F6D32D; }
  .cards { display: grid; gap: 30px; width: 100%; }
  .card { background: rgba(255,255,255,.06); border: 2px solid rgba(255,255,255,.12); border-radius: 32px; padding: 36px 40px;
          display: grid; justify-items: center; gap: 10px; }
  .card b { font-size: 50px; }
  .card .big { font-size: 120px; font-weight: 800; color: #4FC3F7; letter-spacing: -.03em; line-height: 1; }
  .card.wide .big { font-size: 64px; color: #fff; line-height: 1.15; }
  .card small { font-size: 34px; color: rgba(255,255,255,.65); font-weight: 700; }
  .days { display: flex; gap: 60px; justify-content: center; }
  .day { display: grid; justify-items: center; gap: 18px; }
  .day .pair { display: flex; gap: 10px; }
  .day i { width: 230px; height: 4px; background: rgba(255,255,255,.25); border-radius: 2px; }
  .day b { font-size: 46px; font-weight: 800; }
  .bt { width: 100px; height: 200px; display: block; }
  .family { width: 100%; display: grid; gap: 22px; }
  .frow { display: flex; align-items: center; gap: 26px; padding-bottom: 18px; border-bottom: 2px solid rgba(255,255,255,.12); }
  .frow .n { width: 76px; height: 76px; border-radius: 50%; background: #1E2A3A; display: grid; place-items: center; font-size: 38px; font-weight: 800; color: #4FC3F7; flex: none; }
  .frow .bts { display: flex; gap: 14px; flex: 1; }
  .frow .bt { width: 66px; height: 132px; }
  .frow b { font-size: 50px; }
  .items { width: 100%; display: grid; gap: 22px; }
  .item { display: flex; align-items: center; gap: 30px; text-align: left; background: rgba(255,255,255,.06); border-radius: 26px; padding: 22px 30px; }
  .item .ic { width: 96px; height: 96px; border-radius: 24px; background: #F6D32D; display: grid; place-items: center; flex: none; }
  .item .ic svg { width: 60px; height: 60px; fill: none; stroke: #10161F; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .item b { font-size: 46px; font-weight: 800; line-height: 1.15; }
  .chips { display: flex; gap: 22px; justify-content: center; }
  .chip { font-size: 46px; font-weight: 800; padding: 22px 38px; border-radius: 999px; background: #fff; color: #10161F; opacity: .55; }
  .chip.on { background: #F6D32D; opacity: 1; box-shadow: 0 0 0 0 rgba(246,211,45,.6); }
  .bio { font-size: 72px; font-weight: 800; display: flex; align-items: center; gap: 22px; margin-top: 20px; }
  .bio .arrow { color: #F6D32D; font-size: 100px; display: inline-block; }
  .handle { font-size: 48px; font-weight: 700; color: rgba(255,255,255,.75); }
  #bar { position: absolute; left: 80px; right: 80px; top: 150px; height: 8px; border-radius: 4px; background: rgba(255,255,255,.12); overflow: hidden; }
  #bar i { display: block; height: 100%; width: 0; background: #F6D32D; }
</style></head><body>
  <div id="grid"></div><div id="glow"></div><div id="bar"><i></i></div>
  ${scenes.map((s) => `<section class="scene" data-key="${s.key}">${s.html}</section>`).join("\n")}
<script>
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const back = (x) => { x = clamp(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
let starts = [], durs = [], total = 0;
const secs = [...document.querySelectorAll(".scene")];
window.setup = (d) => { durs = d; starts = []; let a = 0; for (const x of d) { starts.push(a); a += x; } total = a; return document.fonts.ready; };
const fmt = (v, dec) => dec ? v.toFixed(dec).replace(".", ",") : String(Math.round(v));
window.render = (t) => {
  let i = 0; while (i < starts.length - 1 && t >= starts[i + 1]) i++;
  const lt = t - starts[i], dur = durs[i];
  document.querySelector("#grid").style.transform = "translateY(" + (-(t * 14) % 90) + "px)";
  document.querySelector("#bar i").style.width = (100 * clamp(t / total)) + "%";
  secs.forEach((s, j) => {
    if (j !== i) { s.style.opacity = 0; return; }
    s.style.opacity = Math.min(ease(lt / 0.3), clamp((dur - lt) / 0.25));
    s.querySelectorAll("[data-in]").forEach((el) => {
      const k = ease((lt - Number(el.dataset.in)) / 0.4);
      el.style.opacity = k; el.style.transform = "translateY(" + (1 - k) * 46 + "px)";
    });
    s.querySelectorAll("[data-pop]").forEach((el) => {
      const x = (lt - Number(el.dataset.pop)) / 0.45;
      el.style.opacity = clamp(x * 3); el.style.transform = "scale(" + (0.3 + 0.7 * back(x)) + ")"; el.style.display = "inline-block";
    });
    s.querySelectorAll("[data-count]").forEach((el) => {
      const k = ease((lt - Number(el.dataset.at)) / 0.9);
      el.textContent = fmt(Number(el.dataset.from) + (Number(el.dataset.count) - Number(el.dataset.from)) * k, Number(el.dataset.dec || 0));
    });
    s.querySelectorAll("[data-tap]").forEach((el) => {
      const x = lt - Number(el.dataset.tap);
      const p = x > 0 ? (x % 1.2) / 1.2 : 0;
      el.style.boxShadow = x > 0 ? "0 0 0 " + (p * 34) + "px rgba(246,211,45," + (0.55 * (1 - p)) + ")" : "none";
      el.style.transform = x > 0 && x < 0.18 ? "scale(.94)" : "scale(1)";
    });
    s.querySelectorAll(".arrow").forEach((el) => { el.style.transform = "translateY(" + (-Math.abs(Math.sin(t * 5)) * 22) + "px)"; });
  });
};
</script></body></html>`;
}

export async function renderKitVideo({ outDir, handle, music, log = console.log }) {
  const { chromium } = await import("playwright");
  await mkdir(outDir, { recursive: true });
  const tmp = path.join(outDir, "_tmp");
  await mkdir(tmp, { recursive: true });

  const scenes = kitScenes({ handle });
  const voice = await narrate(scenes.map((s) => s.say), tmp, log);
  let acc = 0;
  scenes.forEach((s, i) => { s.dur = Math.max(s.min, voice[i].duration + 0.35); s.start = acc; acc += s.dur; });
  log(`Vídeo do kit: ${scenes.length} cenas, ${acc.toFixed(1)} s`);

  const browser = await chromium.launch();
  const silent = path.join(tmp, "video.mp4");
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.setContent(pageHtml(scenes), { waitUntil: "load", timeout: 15000 }).catch(() => {});
    await page.evaluate((d) => window.setup(d), scenes.map((s) => s.dur));
    await encodeFrames(page, acc, silent);
    // capa (para YouTube/Reels): cena dos 24 L, já completa
    const capa = scenes.findIndex((s) => s.key === "24L");
    await page.evaluate((t) => window.render(t), scenes[capa].start + scenes[capa].dur - 0.4);
    await page.screenshot({ path: path.join(outDir, "capa.jpg"), type: "jpeg", quality: 92 });
  } finally {
    await browser.close();
  }

  const file = path.join(outDir, "kit-72h.mp4");
  await mixAudio(silent, voice, scenes, music, acc, file);
  await writeFile(path.join(outDir, "roteiro.txt"), scenes.map((s, i) => `${i + 1}. [${s.key}] ${s.say}`).join("\n") + "\n");
  await rm(tmp, { recursive: true, force: true });
  await marcaDagua(file, typeof log === "function" ? log : console.log);
  return { file, seconds: acc };
}

export const FONTES = [
  "Defesa Civil de São Paulo (SP Sempre Alerta) – plano familiar: água e alimentos para três dias: https://www.spsemprealerta.sp.gov.br/orientacoes/plano-familiar-de-emergencia/",
  "Defesa Civil do Paraná – kit de emergência pessoal: 2 litros por pessoa, por dia: https://www.defesacivil.pr.gov.br/Pagina/Kit-de-Emergencia-pessoal",
  "Governo do Canadá (Get Prepared) – 72 horas, 2 litros de água por pessoa por dia",
  "FEMA / Ready.gov (EUA) – um galão (≈3,8 L) de água por pessoa por dia, para vários dias",
  "União Europeia – Estratégia de Preparação (mar/2025): mínimo de 72 horas",
  "Reino Unido – campanha de preparação (nov/2026): suprimentos para três dias",
  "México – Proteção Civil: mochila de emergência para 72 horas",
];
