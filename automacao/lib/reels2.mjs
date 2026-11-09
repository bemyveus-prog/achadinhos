// Reels v2 (curto, ~12 s, feito para reter e gerar comentário):
//   1. GANCHO  foto da categoria (as mesmas imagens das capas) em tela cheia + frase falada
//   2. PRODUTO a foto do produto "pula" na tela com nota e vendas
//   3. PALPITE "Quanto você acha que custa?" (contagem 3-2-1)
//   4. PREÇO   revelação grande
//   5. CHAMADA "Quanto você chutou? Comenta aí" + link na bio com o número da vitrine
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";
import { imageDataUri } from "./carrossel.mjs";
import { narrate, audioDuration } from "./voz.mjs";
import { execFile } from "child_process";
import { promisify } from "util";
const run = promisify(execFile);
import { encodeFrames, mixAudio } from "./reels.mjs";
import { brl, salesLabel } from "./textos.mjs";

const W = 1080, H = 1920;
const num = (v) => String(v).replace(".", ",");
const reais = (v) => {
  const n = Number(v);
  const r = Math.floor(n), c = Math.round((n - r) * 100);
  return c ? `${r} reais e ${c}` : `${r} reais`;
};

export function buildScenes2(p, { hook, nome, number, comment, fala = "" }) {
  const n = number ? String(number).replace("#", "") : "";
  const prova = [p.rating >= 4.5 ? `nota ${num(Number(p.rating).toFixed(1))}` : "", p.sales >= 100 ? `mais de ${salesLabel(p.sales).replace("+", "")} vendidos` : ""].filter(Boolean).join(", ");
  return [
    { key: "gancho", say: hook.replace(/\*/g, ""), min: 2.2 },
    { key: "produto", say: fala || `${nome}.${prova ? ` ${prova[0].toUpperCase() + prova.slice(1)}.` : ""}`, min: 2.2 },
    { key: "palpite", say: "Quanto você acha que custa?", min: 2.0 },
    { key: "preco", say: `Só ${reais(p.price)}!`, min: 1.8 },
    { key: "cta", say: `${comment} Link na bio${n ? `, número ${n}` : ""}.`, min: 3.0 },
  ];
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hookHtml = (t) => esc(t).replace(/\*([^*]+)\*/g, "<mark>$1</mark>");

function pageHtml() {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000}
  body{font-family:"Plus Jakarta Sans",Inter,Poppins,"DejaVu Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#2E1020}
  .abs{position:absolute}
  #coverbg{inset:-60px;background-size:cover;background-position:50% 0;filter:blur(30px) saturate(1.05)}
  #cover{left:0;bottom:0;width:${W}px;height:1350px;background-size:cover;background-position:50% 100%;transform-origin:50% 100%;
         -webkit-mask-image:linear-gradient(180deg,transparent 0,#000 220px);mask-image:linear-gradient(180deg,transparent 0,#000 220px)}
  #veil{inset:0;background:linear-gradient(180deg,rgba(255,246,242,.35) 0%,rgba(255,246,242,.1) 40%,rgba(255,246,242,0) 55%,rgba(0,0,0,.25) 100%)}
  #tag{left:80px;top:230px;background:#fff;color:var(--ac);font-weight:800;font-size:34px;letter-spacing:4px;padding:16px 30px;border-radius:999px;text-transform:uppercase}
  #hook{left:80px;right:80px;top:340px;font-weight:800;font-size:98px;line-height:1.04;letter-spacing:-3px}
  #hook mark{background:none;color:var(--ac)}
  #dark{inset:0;background:radial-gradient(circle at 50% 40%,rgba(40,10,25,.55),rgba(20,5,12,.88))}
  #card{left:140px;top:420px;width:800px;height:800px;background:#fff;border-radius:56px;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.6)}
  #card img{width:100%;height:100%;object-fit:contain}
  #clip{left:150px;top:250px;width:780px;height:1180px;border-radius:48px;overflow:hidden;background:#000;box-shadow:0 40px 100px rgba(0,0,0,.6);opacity:0}
  #clip img{width:100%;height:100%;object-fit:cover}
  #cliptag{left:0;right:0;top:1470px;text-align:center;color:#fff;font-weight:800;font-size:44px;opacity:0;text-shadow:0 4px 20px rgba(0,0,0,.6)}
  #chips{left:0;right:0;top:1290px;display:flex;justify-content:center;gap:22px}
  .chip{background:#fff;color:#2E1020;font-weight:800;font-size:46px;padding:18px 34px;border-radius:999px;box-shadow:0 14px 34px rgba(0,0,0,.35)}
  #name{left:90px;right:90px;top:250px;text-align:center;color:#fff;font-weight:800;font-size:70px;line-height:1.08;letter-spacing:-1px;text-wrap:balance;text-shadow:0 6px 24px rgba(0,0,0,.5)}
  #guess{left:0;right:0;top:250px;text-align:center;color:#fff;font-weight:800;font-size:92px;line-height:1.05;letter-spacing:-2px;text-shadow:0 6px 30px rgba(0,0,0,.55)}
  #count{left:0;right:0;top:1290px;text-align:center;color:#fff;font-weight:800;font-size:200px;text-shadow:0 10px 40px rgba(0,0,0,.5)}
  #price{left:0;right:0;top:1250px;text-align:center}
  #price small{display:block;color:#fff;font-weight:700;font-size:56px;opacity:.9}
  #price b{display:inline-block;margin-top:10px;background:var(--ac);color:#fff;font-weight:800;font-size:170px;letter-spacing:-5px;padding:6px 48px 16px;border-radius:44px;box-shadow:0 24px 60px rgba(0,0,0,.45)}
  #cta{left:70px;right:70px;top:1200px;text-align:center;color:#fff}
  #cta h2{font-weight:800;font-size:84px;line-height:1.05;letter-spacing:-2px;text-shadow:0 6px 30px rgba(0,0,0,.6)}
  #cta .emo{font-size:90px;display:block;margin-top:6px}
  #bio{margin:34px auto 0;display:inline-flex;align-items:center;gap:20px;background:#fff;color:#2E1020;font-weight:800;font-size:56px;padding:22px 40px;border-radius:999px}
  #bio i{font-style:normal;background:var(--ac);color:#fff;padding:4px 22px;border-radius:999px}
  #flash{inset:0;background:#fff;opacity:0}
</style></head><body>
<div id="coverbg" class="abs"></div><div id="cover" class="abs"></div><div id="veil" class="abs"></div>
<div id="tag" class="abs"></div><div id="hook" class="abs"></div>
<div id="dark" class="abs"></div>
<div id="name" class="abs"></div><div id="guess" class="abs">Quanto você acha<br>que custa? 🤔</div>
<div id="card" class="abs"><img id="photo"></div>
<div id="clip" class="abs"><img id="clipimg"></div><div id="cliptag" class="abs"></div>
<div id="chips" class="abs"></div><div id="count" class="abs"></div>
<div id="price" class="abs"><small>só</small><b id="pv"></b></div>
<div id="cta" class="abs"><h2 id="ctah"></h2><span class="emo">👇</span><div id="bio">Link na bio <i id="num"></i></div></div>
<div id="flash" class="abs"></div>
<script>
const $=(i)=>document.getElementById(i);
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)), ease=(x)=>1-Math.pow(1-clamp(x),3);
const back=(x)=>{x=clamp(x);const c=1.8;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
let D, starts=[];
function show(el,k,dy=40,s=1){el.style.opacity=k;el.style.transform="translateY("+(1-k)*dy+"px) scale("+s+")"}
window.setup=(d)=>{D=d;document.body.style.setProperty("--ac",d.accent);
  $("cover").style.backgroundImage="url("+d.cover+")";$("coverbg").style.backgroundImage="url("+d.cover+")";$("photo").src=d.img;
  $("tag").textContent=d.tag;$("hook").innerHTML=d.hookHtml;$("name").textContent=d.nome;
  $("chips").innerHTML=d.chips.map(c=>'<div class="chip">'+c+'</div>').join("");
  $("pv").textContent=d.price;$("ctah").textContent=d.comment;$("num").textContent=d.number||"";
  if(!d.number)$("num").style.display="none";
  let a=0;starts=d.scenes.map(s=>{const v=a;a+=s.dur;return v});
  return document.fonts.ready.then(()=>new Promise(r=>$("photo").complete?r():($("photo").onload=r)));};
window.render=(t)=>{
  let i=0;while(i<starts.length-1&&t>=starts[i+1])i++;
  const key=D.scenes[i].key, lt=t-starts[i], dur=D.scenes[i].dur;
  // 1. gancho: foto da categoria com zoom e o texto entrando
  const g=key==="gancho"?1:0;
  $("cover").style.transform="scale("+(1.02+0.06*clamp(t/(starts[1]||2)))+")";
  show($("tag"),g*ease((lt-0.05)/0.3),20);
  show($("hook"),g*ease((lt-0.15)/0.35),40);
  // escurece a partir do produto (a foto da categoria continua ao fundo)
  $("dark").style.opacity=i===0?clamp((lt-(dur-0.25))/0.25):1;
  $("veil").style.opacity=i===0?1:0.4;
  // flash na troca de cena
  $("flash").style.opacity=i>0&&lt<0.12?0.55*(1-lt/0.12):0;
  // 2. produto
  const onCard=i>=1;
  const pk=i===1?back(lt/0.45):1;
  const cardS=key==="preco"||key==="cta"?0.78:key==="palpite"?0.9:1;
  const cardY=key==="cta"?300:key==="preco"?340:420;
  $("card").style.opacity=onCard?1:0;
  $("card").style.transform="translateY("+(cardY-420)+"px) scale("+(cardS*(0.5+0.5*pk))+") rotate("+(key==="palpite"?Math.sin(lt*18)*1.2*(1-clamp(lt/1.2)):0)+"deg)";
  show($("name"),key==="produto"?ease((lt-0.25)/0.35):0,30);
  show($("chips"),key==="produto"?ease((lt-0.6)/0.35):0,40);
  // 3. palpite com contagem
  show($("guess"),key==="palpite"?ease(lt/0.3):0,30);
  const c=key==="palpite"?Math.max(1,3-Math.floor(lt/(dur/3))):0;
  $("count").textContent=c?String(c):"";
  $("count").style.opacity=key==="palpite"?1:0;
  $("count").style.transform="scale("+(key==="palpite"?1.25-0.25*ease(((lt%(dur/3))/(dur/3))/0.4):1)+")";
  // 4. preço
  $("price").style.opacity=key==="preco"?1:0;
  $("price").querySelector("small").style.opacity=key==="preco"?ease(lt/0.2):0;
  $("pv").style.transform="scale("+(key==="preco"?0.3+0.7*back((lt-0.1)/0.4):0)+") rotate(-3deg)";
  // 5. chamada
  $("cta").style.opacity=key==="cta"?1:0;
  show($("ctah"),key==="cta"?ease(lt/0.35):0,30);
  $("cta").querySelector(".emo").style.transform="translateY("+Math.abs(Math.sin(t*5))*16+"px)";
  show($("bio"),key==="cta"?ease((lt-0.5)/0.35):0,30,key==="cta"?1+0.04*Math.sin(t*6):1);
  if(window.renderClip)window.renderClip(t); // por último: o vídeo do produto manda na cena "produto"
};
</script>
<script>
// vídeo real do produto (quadros extraídos com FFmpeg), toca durante a cena "produto"
window.renderClip=(t)=>{
  if(!D.clip||!D.clip.length){return}
  let i=0;while(i<starts.length-1&&t>=starts[i+1])i++;
  const key=D.scenes[i].key, lt=t-starts[i], dur=D.scenes[i].dur;
  const on=key==="produto";
  const k=on?Math.min(1,lt/0.25)*Math.min(1,(dur-lt)/0.2):0;
  $("clip").style.opacity=k;
  $("clip").style.transform="scale("+(0.92+0.08*Math.min(1,lt/0.4))+")";
  if(on){const f=Math.floor(lt*30)%D.clip.length;if($("clipimg").dataset.f!=f){$("clipimg").src=D.clip[f];$("clipimg").dataset.f=f}}
  // com vídeo, o cartão da foto e o nome ficam escondidos nessa cena
  if(on){$("card").style.opacity=0;$("name").style.opacity=0;$("chips").style.top="1490px"}
  else{$("chips").style.top="1290px"}
  $("cliptag").style.opacity=0;
};
</script></body></html>`;
}

/** Gera o Reels v2. cover = resultado de pickCover (foto da categoria + gancho). */
// extrai os quadros do vídeo da CJ (30 fps, até maxSec) como JPEG em data URI
async function clipFrames(file, maxSec, dir) {
  const { readdir, readFile } = await import("fs/promises");
  const fdir = path.join(dir, "clip");
  await mkdir(fdir, { recursive: true });
  // pula o primeiro 0,5 s (costuma ter tela preta ou logo) e enquadra vertical 780x1180
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.5", "-i", file, "-t", String(maxSec),
    "-vf", "fps=30,scale=780:1180:force_original_aspect_ratio=increase,crop=780:1180", "-q:v", "4", path.join(fdir, "%04d.jpg")]);
  const names = (await readdir(fdir)).filter((f) => f.endsWith(".jpg")).sort();
  return Promise.all(names.map(async (f) => "data:image/jpeg;base64," + (await readFile(path.join(fdir, f))).toString("base64")));
}

export async function renderReel2(p, { cover, nome, number, handle, comment, outDir, clip = null, fala = "", log = console.log }) {
  const { chromium } = await import("playwright");
  await mkdir(outDir, { recursive: true });
  const tmp = path.join(outDir, "_tmp");
  await mkdir(tmp, { recursive: true });
  comment = comment || "Quanto você chutou? Comenta aí!";
  const scenes = buildScenes2(p, { hook: cover.hook, nome, number, comment, fala });
  // fala mais rápida e sem o silêncio que a voz traz no começo e no fim (vídeo curto retém mais)
  process.env.EDGE_RATE = process.env.EDGE_RATE_REELS || "+22%";
  const voice = await narrate(scenes.map((s) => s.say), tmp, log);
  for (const v of voice) {
    if (!v.file) continue;
    const out = v.file.replace(/\.mp3$/, "-cut.mp3");
    const sil = "silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.03";
    try {
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", v.file, "-af", `${sil},areverse,${sil},areverse`, out]);
      v.file = out; v.duration = await audioDuration(out);
    } catch { /* fica com o áudio original */ }
  }
  let acc = 0;
  // com vídeo do produto, a cena "produto" dura mais (até 5 s) para o vídeo aparecer
  let clipDur = 0;
  if (clip?.file) {
    try { clipDur = Math.max(0, Math.min(clip.maxSec || 5, (await audioDuration(clip.file)) - 0.6)); } catch { clipDur = 4; }
  }
  scenes.forEach((s, i) => {
    const min = s.key === "produto" && clipDur ? Math.max(s.min, clipDur) : s.min;
    s.dur = Math.max(min, voice[i].duration + 0.25); s.start = acc; acc += s.dur;
  });
  const total = acc;
  log(`Reels v2: ${total.toFixed(1)} s`);

  const chips = [];
  if (p.rating) chips.push(`⭐ ${num(Number(p.rating).toFixed(1))}`);
  if (p.sales >= 100) chips.push(`🛒 ${salesLabel(p.sales)} vendidos`);
  const data = {
    cover: await imageDataUri(cover.file), img: await imageDataUri(p.imageUrl),
    tag: cover.tag, accent: cover.accent || "#D0306F", hookHtml: hookHtml(cover.hook), nome,
    chips, price: brl(p.price), comment, number: number ? String(number).startsWith("#") ? number : `#${number}` : "",
    scenes: scenes.map(({ key, dur }) => ({ key, dur })),
    clip: [],
  };
  if (clip?.file) {
    const sc = scenes.find((x) => x.key === "produto");
    data.clip = await clipFrames(clip.file, sc.dur + 0.2, tmp).catch((e) => { log(`  vídeo do produto: ${e.message}`); return []; });
    log(`  vídeo do produto: ${data.clip.length} quadros`);
  }
  const browser = await chromium.launch();
  const silent = path.join(tmp, "video.mp4");
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.setContent(pageHtml(), { waitUntil: "load", timeout: 15000 }).catch(() => {});
    await page.evaluate((d) => window.setup(d), data);
    await encodeFrames(page, total, silent);
  } finally { await browser.close(); }
  const file = path.join(outDir, "reels.mp4");
  await mixAudio(silent, voice, scenes, null, total, file);
  await writeFile(path.join(outDir, "roteiro.txt"), scenes.map((s, i) => `${i + 1}. [${s.key}] ${s.say}`).join("\n") + "\n");
  await rm(tmp, { recursive: true, force: true });
  return { file, seconds: total, scenes };
}
