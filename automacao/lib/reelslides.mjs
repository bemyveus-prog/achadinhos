// Reels de "slides narrados" (campanhas, explicações): cada cena tem uma imagem, um texto grande e a fala
// com legenda; no fim, o mesmo final dos outros Reels (Seguir + link da bio).
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { imageDataUri } from "./carrossel.mjs";
import { narrate, audioDuration } from "./voz.mjs";
import { encodeFrames, mixAudio } from "./reels.mjs";

const run = promisify(execFile);
const W = 1080, H = 1920;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const subsOf = (t) => { const w = String(t).split(/\s+/).filter(Boolean); const o = []; for (let i = 0; i < w.length; i += 5) o.push(w.slice(i, i + 5).join(" ")); return o; };

async function trimSilence(v) {
  if (!v.file) return v;
  const out = v.file.replace(/\.mp3$/, "-cut.mp3");
  const sil = "silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.03";
  try { await run("ffmpeg", ["-y", "-loglevel", "error", "-i", v.file, "-af", `${sil},areverse,${sil},areverse`, out]); return { file: out, duration: await audioDuration(out) }; }
  catch { return v; }
}

function pageHtml() {
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:#140812}
  body{font-family:"Plus Jakarta Sans",Inter,Poppins,"DejaVu Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased;color:#fff;--ac:#D0306F}
  .abs{position:absolute}
  #bg{inset:0;background:var(--bg)}
  #dots{inset:0;background-image:radial-gradient(rgba(255,255,255,.12) 2px,transparent 2.5px);background-size:52px 52px}
  #big{left:70px;right:70px;top:230px;text-align:center;font-weight:800;font-size:84px;line-height:1.05;letter-spacing:-2px;text-wrap:balance;text-shadow:0 6px 24px rgba(0,0,0,.35)}
  #big mark{background:#FFD54A;color:#7A0A14;padding:0 14px;border-radius:16px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
  #pic{left:90px;right:90px;top:560px;height:760px;display:flex;align-items:center;justify-content:center}
  #pic img{width:100%;height:auto;max-height:100%;object-fit:contain;border-radius:30px;border:10px solid #fff;box-shadow:0 30px 70px rgba(0,0,0,.45)}
  #pic.duo img{width:47%;margin:0 1.5%}
  #badge{left:0;right:0;top:1300px;text-align:center}
  #badge b{display:inline-block;background:#FFD54A;color:#7A0A14;font-weight:800;font-size:64px;padding:12px 36px;border-radius:24px;transform:rotate(-3deg);box-shadow:0 14px 34px rgba(0,0,0,.35)}
  #sub{left:70px;right:70px;top:1470px;text-align:center;font-weight:800;font-size:58px;line-height:1.15;text-shadow:0 0 6px #000,0 0 14px #000,0 4px 24px rgba(0,0,0,.8)}
  #flash{inset:0;background:#fff;opacity:0}
  #prof{left:90px;right:90px;top:760px;background:#fff;border-radius:44px;padding:34px 36px;display:flex;align-items:center;gap:28px;box-shadow:0 30px 80px rgba(0,0,0,.5);opacity:0}
  #ava{flex:none;width:150px;height:150px;border-radius:50%;background:#eee center/cover;box-shadow:0 0 0 6px #fff,0 0 0 11px #E1306C;display:grid;place-items:center;font-weight:800;font-size:56px;color:#2E1020}
  #pinfo{flex:1;min-width:0;text-align:left}
  #phandle{font-weight:800;font-size:44px;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #ptag{font-weight:600;font-size:30px;color:#666;margin-top:4px}
  #follow{margin-top:18px;display:inline-flex;background:#0095F6;color:#fff;font-weight:800;font-size:40px;padding:14px 46px;border-radius:18px}
  #follow.on{background:#EFEFEF;color:#111}
  #finger{left:0;top:0;font-size:110px;opacity:0;filter:drop-shadow(0 10px 18px rgba(0,0,0,.4))}
  #cta{left:70px;right:70px;top:1250px;text-align:center;opacity:0}
  #cta h2{font-weight:800;font-size:62px;line-height:1.08;letter-spacing:-1px;text-shadow:0 6px 30px rgba(0,0,0,.5)}
  #cta .emo{font-size:90px;display:block;margin-top:6px}
  #bio{margin:30px auto 0;display:inline-flex;align-items:center;gap:20px;background:#fff;color:#7A0A14;font-weight:800;font-size:54px;padding:22px 44px;border-radius:999px}
</style></head><body>
<div id="bg" class="abs"></div><div id="dots" class="abs"></div>
<div id="big" class="abs"></div><div id="pic" class="abs"></div><div id="badge" class="abs"><b id="bv"></b></div><div id="sub" class="abs"></div>
<div id="prof" class="abs"><div id="ava"></div><div id="pinfo"><div id="phandle"></div><div id="ptag">Achadinhos todo dia</div><div id="follow">Seguir</div></div></div>
<div id="finger" class="abs">👆</div>
<div id="cta" class="abs"><h2 id="ctah"></h2><span class="emo">👆</span><div id="bio">Link na bio</div></div>
<div id="flash" class="abs"></div>
<script>
const $=(i)=>document.getElementById(i);
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)), ease=(x)=>1-Math.pow(1-clamp(x),3);
const back=(x)=>{x=clamp(x);const c=1.8;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
function show(el,k,dy=40,s=1){el.style.opacity=k;el.style.transform="translateY("+(1-k)*dy+"px) scale("+s+")"}
let D, starts=[], last=-1;
window.setup=(d)=>{D=d;document.body.style.setProperty("--bg",d.bg);$("phandle").textContent=d.handle;$("ctah").textContent=d.ctaText;
  if(d.avatar){$("ava").style.backgroundImage="url("+d.avatar+")"}else{$("ava").textContent=d.handle.replace("@","").slice(0,2).toUpperCase()}
  let a=0;starts=d.scenes.map(s=>{const v=a;a+=s.dur;return v});return document.fonts.ready;};
window.render=(t)=>{
  let i=0;while(i<starts.length-1&&t>=starts[i+1])i++;
  const sc=D.scenes[i], lt=t-starts[i], dur=sc.dur, isC=sc.key==="cta";
  if(i!==last){last=i;
    $("big").innerHTML=sc.bigHtml||"";
    $("pic").className="abs"+(sc.imgs&&sc.imgs.length>1?" duo":"");
    $("pic").innerHTML=(sc.imgs||[]).map(u=>'<img src="'+u+'">').join("");
    $("bv").textContent=sc.badge||"";$("badge").style.display=sc.badge?"block":"none";}
  $("flash").style.opacity=i>0&&lt<0.12?0.45*(1-lt/0.12):0;
  show($("big"),!isC?ease(lt/0.35):0,30);
  const pk=!isC?back(lt/0.45):0;
  $("pic").style.opacity=isC?0:1;
  $("pic").style.transform="scale("+((0.7+0.3*pk)*(1+0.04*clamp(lt/dur)))+") rotate("+(Math.sin(i*1.7)*1.5)+"deg)";
  show($("badge"),!isC&&sc.badge?back((lt-0.5)/0.4):0,0,1);
  const subs=sc.subs||[], vd=sc.voiceDur||dur;
  if(!isC&&subs.length&&lt>0.18){const k=Math.min(subs.length-1,Math.floor(clamp((lt-0.18)/vd,0,0.999)*subs.length));$("sub").textContent=subs[k];$("sub").style.opacity=1}else $("sub").style.opacity=0;
  show($("prof"),isC?ease(lt/0.35):0,60);
  const tap=1.0, fb=$("follow").getBoundingClientRect(), fx=fb.left+fb.width*0.55, fy=fb.top+fb.height*0.6;
  const fin=isC?clamp((lt-0.45)/0.35):0;
  $("finger").style.opacity=isC&&lt<tap+0.6?fin:0;
  $("finger").style.transform="translate("+(fx-30+(1-ease(fin))*180)+"px,"+(fy-10+(1-ease(fin))*260)+"px) scale("+(lt>tap&&lt<tap+0.15?0.85:1)+")";
  const fo=isC&&lt>=tap;$("follow").classList.toggle("on",fo);$("follow").textContent=fo?"Seguindo ✓":"Seguir";
  $("cta").style.opacity=isC?1:0;
  show($("ctah"),isC?ease((lt-1.3)/0.35):0,30);
  const emo=$("cta").querySelector(".emo");emo.style.opacity=isC?ease((lt-1.6)/0.3):0;emo.style.transform="translateY("+(-Math.abs(Math.sin(t*5))*16)+"px)";
  show($("bio"),isC?ease((lt-1.8)/0.35):0,30,isC?1+0.04*Math.sin(t*6):1);
};
</script></body></html>`;
}

/**
 * slides: [{ big: "texto com *destaque*", imgs: [arquivo...], badge: "50% OFF", say: "fala" }]
 * cta: { say, text }
 */
export async function renderSlides({ slides, cta, outDir, handle, avatar, bg, log = console.log }) {
  const { chromium } = await import("playwright");
  await mkdir(outDir, { recursive: true });
  const tmp = path.join(outDir, "_tmp");
  await mkdir(tmp, { recursive: true });
  const scenes = slides.map((s, k) => ({ key: `s${k}`, say: s.say, min: 2.2, s }));
  scenes.push({ key: "cta", say: cta.say, min: 4.0 });
  process.env.EDGE_RATE = process.env.EDGE_RATE_REELS || "+18%";
  let voice = await narrate(scenes.map((x) => x.say), tmp, log);
  voice = await Promise.all(voice.map(trimSilence));
  let acc = 0;
  scenes.forEach((x, i) => { x.voiceDur = voice[i].duration; x.dur = Math.max(x.min, voice[i].duration + 0.35); x.start = acc; acc += x.dur; });
  const total = acc;
  log(`Reels slides: ${scenes.length} cenas, ${total.toFixed(1)} s`);
  const data = {
    bg: bg || "radial-gradient(circle at 30% 20%,#E8283C,#8E0616 75%)",
    handle: handle || "@minh.asofertas", avatar: avatar ? await imageDataUri(avatar).catch(() => null) : null, ctaText: cta.text,
    scenes: [],
  };
  for (const x of scenes) {
    data.scenes.push({
      key: x.key, dur: x.dur, voiceDur: x.voiceDur, subs: x.key === "cta" ? [] : subsOf(x.say), badge: x.s?.badge || "",
      bigHtml: x.s ? esc(x.s.big).replace(/\*([^*]+)\*/g, "<mark>$1</mark>") : "",
      imgs: x.s ? await Promise.all((x.s.imgs || []).map((f) => imageDataUri(f))) : [],
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
  const file = path.join(outDir, "reels-slides.mp4");
  await mixAudio(silent, voice, scenes, null, total, file);
  await writeFile(path.join(outDir, "roteiro.txt"), scenes.map((x, i) => `${i + 1}. ${x.say}`).join("\n") + "\n");
  await rm(tmp, { recursive: true, force: true });
  return { file, seconds: total };
}
