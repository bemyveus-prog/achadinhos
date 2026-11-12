// Reels "Top N" (ex.: "5 coisas que parecem bobas mas facilitam a vida"):
//   ABERTURA título grande + miniaturas dos produtos
//   ITENS    cada produto com "1/5", número da vitrine, preço, foto (ou vídeo da CJ) e a narração com legenda
//   FINAL    Seguir + link da bio (cupom quando há cupom ativo)
import { mkdir, writeFile, rm, readdir, readFile } from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { imageDataUri } from "./carrossel.mjs";
import { narrate, audioDuration } from "./voz.mjs";
import { encodeFrames, mixAudio } from "./reels.mjs";
import { brl } from "./textos.mjs";
import { marcaDagua } from "./marca.mjs";
import { BRAND } from "../../lib/brand.mjs";

const run = promisify(execFile);
const W = 1080, H = 1920;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function trimSilence(v) {
  if (!v.file) return v;
  const out = v.file.replace(/\.mp3$/, "-cut.mp3");
  const sil = "silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.03";
  try {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", v.file, "-af", `${sil},areverse,${sil},areverse`, out]);
    return { file: out, duration: await audioDuration(out) };
  } catch { return v; }
}

// quadros do vídeo da CJ (720x1280, mais leve; o navegador amplia)
async function clipFrames(file, maxSec, dir) {
  await mkdir(dir, { recursive: true });
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.5", "-i", file, "-t", String(maxSec),
    "-vf", "fps=30,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280", "-q:v", "6", path.join(dir, "%04d.jpg")]);
  const names = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
  return Promise.all(names.map(async (f) => "data:image/jpeg;base64," + (await readFile(path.join(dir, f))).toString("base64")));
}

const subsOf = (text) => { const w = String(text).split(/\s+/).filter(Boolean); const o = []; for (let i = 0; i < w.length; i += 5) o.push(w.slice(i, i + 5).join(" ")); return o; };

function pageHtml() {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:#140812}
  body{font-family:"Plus Jakarta Sans",Inter,Poppins,"DejaVu Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#fff;--ac:#D0306F}
  .abs{position:absolute}
  #bg{inset:-80px;background-size:cover;background-position:center;filter:blur(46px) brightness(.45) saturate(1.2)}
  #shade{inset:0;background:radial-gradient(circle at 50% 42%,rgba(40,10,25,.25),rgba(15,4,10,.85))}
  #title{left:70px;right:70px;top:300px;text-align:center;font-weight:800;font-size:96px;line-height:1.04;letter-spacing:-3px;text-wrap:balance;text-shadow:0 8px 30px rgba(0,0,0,.6)}
  #title mark{background:var(--ac);color:#fff;padding:0 14px;border-radius:16px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
  #thumbs{left:60px;right:60px;top:1060px;display:flex;flex-wrap:wrap;justify-content:center;gap:22px}
  .th{width:220px;height:220px;border-radius:30px;background:#fff center/contain no-repeat;box-shadow:0 18px 40px rgba(0,0,0,.45)}
  #badge{left:70px;top:220px;display:flex;gap:16px;align-items:center}
  #pos{background:var(--ac);color:#fff;font-weight:800;font-size:64px;padding:8px 30px;border-radius:24px}
  #numv{background:#fff;color:#2E1020;font-weight:800;font-size:48px;padding:12px 26px;border-radius:999px}
  #card{left:140px;top:400px;width:800px;height:800px;background:#fff;border-radius:56px;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,.6)}
  #card img{width:100%;height:100%;object-fit:contain}
  #clip{left:0;top:0;width:${W}px;height:${H}px;opacity:0;background:#000}
  #clip img{width:100%;height:100%;object-fit:cover}
  #price{left:0;right:0;top:1250px;text-align:center}
  #price b{display:inline-block;background:#FFD54A;color:#2E1020;font-weight:800;font-size:66px;padding:10px 34px;border-radius:22px;transform:rotate(-3deg);box-shadow:0 14px 34px rgba(0,0,0,.4)}
  #sub{left:70px;right:70px;top:1420px;text-align:center;font-weight:800;font-size:62px;line-height:1.15;letter-spacing:-1px;
       text-shadow:0 0 6px #000,0 0 14px #000,0 4px 24px rgba(0,0,0,.8)}
  #flash{inset:0;background:#fff;opacity:0}
  /* final */
  #prof{left:90px;right:90px;top:760px;background:#fff;border-radius:44px;padding:34px 36px;display:flex;align-items:center;gap:28px;box-shadow:0 30px 80px rgba(0,0,0,.5);opacity:0}
  #ava{flex:none;width:150px;height:150px;border-radius:50%;background:#eee center/cover;box-shadow:0 0 0 6px #fff,0 0 0 11px #E1306C;display:grid;place-items:center;font-weight:800;font-size:56px;color:#2E1020}
  #pinfo{flex:1;min-width:0;text-align:left}
  #phandle{font-weight:800;font-size:44px;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #ptag{font-weight:600;font-size:30px;color:#666;margin-top:4px}
  #follow{margin-top:18px;display:inline-flex;background:#0095F6;color:#fff;font-weight:800;font-size:40px;padding:14px 46px;border-radius:18px}
  #follow.on{background:#EFEFEF;color:#111}
  #finger{left:0;top:0;font-size:110px;opacity:0;filter:drop-shadow(0 10px 18px rgba(0,0,0,.4))}
  #cta{left:70px;right:70px;top:1250px;text-align:center;opacity:0}
  #cta h2{font-weight:800;font-size:64px;line-height:1.05;letter-spacing:-2px;text-shadow:0 6px 30px rgba(0,0,0,.6)}
  #cta .emo{font-size:90px;display:block;margin-top:6px}
  #bio{margin:34px auto 0;display:inline-flex;align-items:center;gap:20px;background:#fff;color:#2E1020;font-weight:800;font-size:52px;padding:22px 40px;border-radius:999px}
  #coupon{display:inline-block;margin-top:22px;background:#FFD54A;color:#2E1020;font-weight:800;font-size:46px;padding:14px 34px;border-radius:999px}
</style></head><body>
<div id="bg" class="abs"></div><div id="shade" class="abs"></div>
<div id="title" class="abs"></div><div id="thumbs" class="abs"></div>
<div id="card" class="abs"><img id="photo"></div><div id="clip" class="abs"><img id="clipimg"></div>
<div id="badge" class="abs"><span id="pos"></span><span id="numv"></span></div>
<div id="price" class="abs"><b id="pv"></b></div>
<div id="sub" class="abs"></div>
<div id="prof" class="abs"><div id="ava"></div><div id="pinfo"><div id="phandle"></div><div id="ptag">Achadinhos todo dia</div><div id="follow">Seguir</div></div></div>
<div id="finger" class="abs">👆</div>
<div id="cta" class="abs"><h2 id="ctah">Qual você levaria? Comenta o número 💬</h2><span class="emo">👆</span><div id="bio">Link na bio · procura os números</div><br><div id="coupon">🎟️ Cupom da Shopee hoje</div></div>
<div id="flash" class="abs"></div>
<script>
const $=(i)=>document.getElementById(i);
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)), ease=(x)=>1-Math.pow(1-clamp(x),3);
const back=(x)=>{x=clamp(x);const c=1.8;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
function show(el,k,dy=40,s=1){el.style.opacity=k;el.style.transform="translateY("+(1-k)*dy+"px) scale("+s+")"}
let D, starts=[];
window.setup=(d)=>{D=d;document.body.style.setProperty("--ac",d.accent||"#D0306F");
  $("title").innerHTML=d.titleHtml;
  $("thumbs").innerHTML=d.items.map(it=>'<div class="th" style="background-image:url('+it.img+')"></div>').join("");
  $("phandle").textContent=d.handle;
  if(d.avatar){$("ava").style.backgroundImage="url("+d.avatar+")"}else{$("ava").textContent=d.handle.replace("@","").slice(0,2).toUpperCase()}
  $("coupon").style.display=d.cupom?"inline-block":"none";
  let a=0;starts=d.scenes.map(s=>{const v=a;a+=s.dur;return v});
  return document.fonts.ready;};
let lastItem=-1;
window.render=(t)=>{
  let i=0;while(i<starts.length-1&&t>=starts[i+1])i++;
  const sc=D.scenes[i], key=sc.key, lt=t-starts[i], dur=sc.dur;
  const it=sc.item!=null?D.items[sc.item]:null;
  // fundo: foto do item atual (ou do primeiro na abertura/final)
  const bgItem=it||D.items[key==="cta"?D.items.length-1:0];
  if($("bg").dataset.src!==bgItem.img){$("bg").style.backgroundImage="url("+bgItem.img+")";$("bg").dataset.src=bgItem.img}
  $("bg").style.transform="scale("+(1.1+0.05*Math.sin(t/3))+")";
  $("flash").style.opacity=i>0&&lt<0.12?0.5*(1-lt/0.12):0;
  // abertura
  const isI=key==="intro";
  show($("title"),isI?ease(lt/0.35):0,40);
  $("thumbs").style.opacity=isI?1:0;
  [...$("thumbs").children].forEach((th,k)=>{const e=isI?back((lt-0.3-k*0.12)/0.4):0;th.style.transform="scale("+e+") rotate("+((k%2?3:-3)*(1-e))+"deg)"});
  // itens
  const on=!!it;
  if(on&&sc.item!==lastItem){$("photo").src=it.img;$("pos").textContent=(sc.item+1)+"/"+D.items.length;$("numv").textContent="#"+it.id;$("pv").textContent=it.price;lastItem=sc.item}
  const clip=on&&it.clip&&it.clip.length;
  $("card").style.opacity=on&&!clip?1:0;
  $("card").style.transform="scale("+(on?(0.6+0.4*back(lt/0.45))*(1+0.05*clamp(lt/dur)):0)+")";
  $("clip").style.opacity=clip?Math.min(1,(dur-lt)/0.2):0;
  if(clip){const f=Math.floor(lt*30)%it.clip.length;if($("clipimg").dataset.f!==sc.item+":"+f){$("clipimg").src=it.clip[f];$("clipimg").dataset.f=sc.item+":"+f}}
  show($("badge"),on?ease((lt-0.1)/0.3):0,-30);
  show($("price"),on&&D.showPrice?ease((lt-0.4)/0.3):0,30);
  $("price").style.top=(clip?1560:1250)+"px";
  const subs=on?it.subs:[], vd=sc.voiceDur||dur;
  if(on&&subs.length&&lt>0.18){const k=Math.min(subs.length-1,Math.floor(clamp((lt-0.18)/vd,0,0.999)*subs.length));$("sub").textContent=subs[k];$("sub").style.opacity=1}else $("sub").style.opacity=0;
  $("sub").style.top=(clip?1300:1420)+"px";
  // final
  const isC=key==="cta";
  show($("prof"),isC?ease(lt/0.35):0,60);
  const tap=1.0, fb=$("follow").getBoundingClientRect(), fx=fb.left+fb.width*0.55, fy=fb.top+fb.height*0.6;
  const fin=isC?clamp((lt-0.45)/0.35):0;
  $("finger").style.opacity=isC&&lt<tap+0.6?fin:0;
  $("finger").style.transform="translate("+(fx-30+(1-ease(fin))*180)+"px,"+(fy-10+(1-ease(fin))*260)+"px) scale("+(lt>tap&&lt<tap+0.15?0.85:1)+")";
  const fo=isC&&lt>=tap;$("follow").classList.toggle("on",fo);$("follow").textContent=fo?"Seguindo ✓":"Seguir";
  $("cta").style.opacity=isC?1:0;
  show($("cta").querySelector("h2"),isC?ease((lt-1.3)/0.35):0,30);
  const emo=$("cta").querySelector(".emo");emo.style.opacity=isC?ease((lt-1.6)/0.3):0;emo.style.transform="translateY("+(-Math.abs(Math.sin(t*5))*16)+"px)";
  show($("bio"),isC?ease((lt-1.8)/0.35):0,30,isC?1+0.04*Math.sin(t*6):1);
  show($("coupon"),isC?ease((lt-2.3)/0.35):0,30,isC?1+0.05*Math.sin(t*7):1);
};
</script></body></html>`;
}

/**
 * items: [{ id, name, imageUrl, price, fala, clipFile? }]
 */
export async function renderTop({ title, items, outDir, handle, avatar, cupom, accent, showPrice = true, log = console.log }) {
  const { chromium } = await import("playwright");
  await mkdir(outDir, { recursive: true });
  const tmp = path.join(outDir, "_tmp");
  await mkdir(tmp, { recursive: true });

  const scenes = [{ key: "intro", say: title.replace(/\*/g, ""), min: 2.4 }];
  items.forEach((it, k) => scenes.push({ key: `item${k}`, item: k, say: it.fala || it.name, min: it.clipFile ? 4.0 : 3.0 }));
  scenes.push({ key: "cta", say: `Comenta aqui qual você levaria e salva pra não perder! O link tá na bio${cupom ? ", e tem cupom da Shopee te esperando" : ", procura os números na vitrine"}!`, min: 4.2 });

  process.env.EDGE_RATE = process.env.EDGE_RATE_REELS || "+22%";
  let voice = await narrate(scenes.map((s) => s.say), tmp, log);
  voice = await Promise.all(voice.map(trimSilence));
  let acc = 0;
  scenes.forEach((s, i) => { s.voiceDur = voice[i].duration; s.dur = Math.max(s.min, voice[i].duration + 0.3); s.start = acc; acc += s.dur; });
  const total = acc;
  log(`Reels Top: ${items.length} produtos, ${total.toFixed(1)} s`);

  const data = {
    titleHtml: esc(title).replace(/\*([^*]+)\*/g, "<mark>$1</mark>").replace(/^(\d+)/, "<mark>$1</mark>"),
    handle: handle || BRAND.handle, avatar: avatar ? await imageDataUri(avatar).catch(() => null) : null, cupom, accent, showPrice,
    scenes: scenes.map(({ key, dur, item, voiceDur }) => ({ key, dur, item, voiceDur })),
    items: [],
  };
  for (const [k, it] of items.entries()) {
    const sc = scenes[k + 1];
    data.items.push({
      id: it.id, img: await imageDataUri(it.imageUrl), price: it.price ? brl(it.price) : "", subs: subsOf(sc.say),
      clip: it.clipFile ? await clipFrames(it.clipFile, sc.dur + 0.2, path.join(tmp, `clip${k}`)).catch((e) => { log(`  vídeo #${it.id}: ${e.message}`); return []; }) : [],
    });
  }

  const browser = await chromium.launch();
  const silent = path.join(tmp, "video.mp4");
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    await page.setContent(pageHtml(), { waitUntil: "load", timeout: 15000 }).catch(() => {});
    await page.evaluate((d) => window.setup(d), data);
    await encodeFrames(page, total, silent);
  } finally { await browser.close(); }
  const file = path.join(outDir, "reels-top.mp4");
  await mixAudio(silent, voice, scenes, null, total, file);
  await writeFile(path.join(outDir, "roteiro.txt"), scenes.map((s, i) => `${i + 1}. [${s.key}] ${s.say}`).join("\n") + "\n");
  await rm(tmp, { recursive: true, force: true });
  await marcaDagua(file, typeof log === "function" ? log : console.log);
  return { file, seconds: total, scenes };
}
