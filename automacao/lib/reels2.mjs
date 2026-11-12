// Reels v2 (curto e direto):
//   1. PRODUTO o vídeo do produto em tela cheia (ou a foto, se não houver vídeo) com a narração e legenda
//   2. CHAMADA "Me segue" (animação do botão Seguir) + link na bio, citando o cupom quando há cupom ativo
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

export function buildScenes2(p, { hook, nome, number, comment, fala = "", cupom = false, modo = "instagram" }) {
  const n = number ? String(number).replace("#", "") : "";
  const prova = [p.rating >= 4.5 ? `nota ${num(Number(p.rating).toFixed(1))}` : "", p.sales >= 100 ? `mais de ${salesLabel(p.sales).replace("+", "")} vendidos` : ""].filter(Boolean).join(", ");
  const padrao = `${hook ? hook.replace(/\*/g, "").replace(/[.!?]*$/, "") + ". " : ""}${nome}. Aproveita enquanto tá nesse preço!`;
  return [
    { key: "produto", say: fala || padrao, min: 3.0 },
    modo === "shopee"
      ? { key: "cta", say: "Gostou? Toca no produto aqui embaixo e garante o seu!", min: 3.4 }
      : { key: "cta", say: `Me segue que todo dia tem achado novo abaixo de 50 reais! E corre no link da bio, ${cupom ? "que tem cupom da Shopee te esperando!" : `procura o número ${n}!`}`, min: 4.2 },
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
  #clip{left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;background:#000;opacity:0}
  #sub{left:70px;right:70px;top:1180px;text-align:center;color:#fff;font-weight:800;font-size:62px;line-height:1.15;letter-spacing:-1px;
       text-shadow:0 0 6px #000,0 0 14px #000,0 4px 24px rgba(0,0,0,.8);-webkit-text-stroke:2px rgba(0,0,0,.55);paint-order:stroke fill}
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
  #prof{left:90px;right:90px;top:760px;background:#fff;border-radius:44px;padding:34px 36px;display:flex;align-items:center;gap:28px;box-shadow:0 30px 80px rgba(0,0,0,.5);opacity:0}
  #ava{flex:none;width:150px;height:150px;border-radius:50%;background:#eee center/cover;border:6px solid transparent;
       background-clip:padding-box;box-shadow:0 0 0 6px #fff,0 0 0 11px #E1306C;display:grid;place-items:center;font-weight:800;font-size:56px;color:#2E1020}
  #pinfo{flex:1;min-width:0;text-align:left}
  #phandle{font-weight:800;font-size:44px;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #ptag{font-weight:600;font-size:30px;color:#666;margin-top:4px}
  #follow{margin-top:18px;display:inline-flex;align-items:center;gap:10px;background:#0095F6;color:#fff;font-weight:800;font-size:40px;padding:14px 46px;border-radius:18px;transform-origin:center}
  #follow.on{background:#EFEFEF;color:#111}
  #finger{left:0;top:0;font-size:110px;opacity:0;filter:drop-shadow(0 10px 18px rgba(0,0,0,.4))}
  #ring{left:0;top:0;width:60px;height:60px;border-radius:50%;border:8px solid #fff;opacity:0}
  #coupon{display:inline-block;margin-top:22px;background:#FFD54A;color:#2E1020;font-weight:800;font-size:46px;padding:14px 34px;border-radius:999px;box-shadow:0 14px 30px rgba(0,0,0,.35)}
  #cta h2{font-weight:800;font-size:64px;line-height:1.05;letter-spacing:-2px;text-shadow:0 6px 30px rgba(0,0,0,.6)}
  #cta .emo{font-size:90px;display:block;margin-top:6px}
  #bio{margin:34px auto 0;display:inline-flex;align-items:center;gap:20px;background:#fff;color:#2E1020;font-weight:800;font-size:56px;padding:22px 40px;border-radius:999px}
  #bio i{font-style:normal;background:var(--ac);color:#fff;padding:4px 22px;border-radius:999px}
  #flash{inset:0;background:#fff;opacity:0}
  #shp{left:60px;right:60px;top:820px;text-align:center;color:#fff;opacity:0}
  #shp h2{font-weight:800;font-size:76px;line-height:1.08;letter-spacing:-2px;text-shadow:0 6px 30px rgba(0,0,0,.6)}
  #shp h2 span{color:#FFD54A}
  #shparrow{font-size:130px;margin-top:20px}
  #shpcard{margin:30px auto 0;display:flex;align-items:center;gap:22px;background:#fff;color:#222;border-radius:26px;padding:18px 22px;width:900px;text-align:left;box-shadow:0 24px 60px rgba(0,0,0,.45)}
  #shpcard img{width:130px;height:130px;object-fit:contain;border-radius:14px;background:#f3f3f3}
  #shpcard div{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
  #shpcard b{font-size:36px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #shpcard i{font-style:normal;font-size:44px;font-weight:800;color:#EE4D2D}
  #shpcard em{font-style:normal;background:#EE4D2D;color:#fff;font-weight:800;font-size:38px;padding:16px 26px;border-radius:16px}
</style></head><body>
<div id="coverbg" class="abs"></div><div id="cover" class="abs"></div><div id="veil" class="abs"></div>
<div id="tag" class="abs"></div><div id="hook" class="abs"></div>
<div id="dark" class="abs"></div>
<div id="name" class="abs"></div><div id="guess" class="abs">Quanto você acha<br>que custa? 🤔</div>
<div id="card" class="abs"><img id="photo"></div>
<div id="clip" class="abs"><img id="clipimg"></div><div id="sub" class="abs"></div><div id="cliptag" class="abs"></div>
<div id="chips" class="abs"></div><div id="count" class="abs"></div>
<div id="price" class="abs"><small>só</small><b id="pv"></b></div>
<div id="prof" class="abs"><div id="ava"></div><div id="pinfo"><div id="phandle"></div><div id="ptag">Achadinhos todo dia</div><div id="follow">Seguir</div></div></div>
<div id="ring" class="abs"></div><div id="finger" class="abs">👆</div>
<div id="cta" class="abs"><h2 id="ctah"></h2><span class="emo">👆</span><div id="bio">Link na bio <i id="num"></i></div><br><div id="coupon">🎟️ Cupom da Shopee hoje</div></div>
<div id="shp" class="abs"><h2>Gostou? <span>Toque no produto</span> aqui embaixo</h2><div id="shparrow">⬇️</div>
  <div id="shpcard"><img id="shpimg"><div><b id="shpname"></b><i id="shpprice"></i></div><em>Comprar</em></div></div>
<div id="flash" class="abs"></div>
<script>
const $=(i)=>document.getElementById(i);
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)), ease=(x)=>1-Math.pow(1-clamp(x),3);
const back=(x)=>{x=clamp(x);const c=1.8;return 1+(c+1)*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
let D, starts=[];
function show(el,k,dy=40,s=1){el.style.opacity=k;el.style.transform="translateY("+(1-k)*dy+"px) scale("+s+")"}
window.setup=(d)=>{D=d;document.body.style.setProperty("--ac",d.accent);
  $("cover").style.display="none";$("veil").style.display="none";$("coverbg").style.backgroundImage="url("+d.img+")";$("photo").src=d.img;
  $("tag").textContent=d.tag;$("hook").innerHTML=d.hookHtml;$("name").textContent=d.nome;
  $("chips").innerHTML=d.chips.map(c=>'<div class="chip">'+c+'</div>').join("");
  $("pv").textContent=d.price;$("ctah").textContent="Me segue! Todo dia tem achado novo abaixo de R$ 50";$("num").textContent=d.number||"";
  $("phandle").textContent=d.handle||"@minh.asofertas";
  if(d.avatar){$("ava").style.backgroundImage="url("+d.avatar+")"}else{$("ava").textContent=(d.handle||"@MO").replace("@","").slice(0,2).toUpperCase()}
  $("coupon").style.display=d.cupom?"inline-block":"none";
  $("shpimg").src=d.img;$("shpname").textContent=d.nome||"";$("shpprice").textContent=d.price||"";
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
  $("dark").style.opacity=1;
  // flash na troca de cena
  $("flash").style.opacity=i>0&&lt<0.12?0.55*(1-lt/0.12):0;
  // 2. produto
  const onCard=key==="produto"||key==="cta";
  const pk=key==="produto"?back(lt/0.45):1;
  const cardS=key==="preco"||key==="cta"?0.78:key==="palpite"?0.9:1;
  const cardY=key==="cta"?300:key==="preco"?340:420;
  $("card").style.opacity=onCard?1:0;
  $("card").style.transform="translateY("+(cardY-420)+"px) scale("+(cardS*(0.5+0.5*pk)*(key==="produto"?1+0.05*clamp(lt/dur):1))+") rotate("+(key==="palpite"?Math.sin(lt*18)*1.2*(1-clamp(lt/1.2)):0)+"deg)";
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
  const shopee=D.modo==="shopee";
  const isC=key==="cta"&&!shopee;
  // modo Shopee Vídeo: chama para o produto vinculado embaixo do vídeo (sem "seguir" nem "link na bio")
  const isS=key==="cta"&&shopee;
  show($("shp"),isS?ease(lt/0.35):0,40);
  $("shparrow").style.transform="translateY("+(isS?Math.abs(Math.sin(t*5))*30:0)+"px)";
  $("shpcard").style.transform="scale("+(isS?1+0.03*Math.sin(t*6):1)+")";
  if(isS){$("card").style.opacity=1-ease(lt/0.3)}
  // 1) cartão do perfil entra e o dedo toca em "Seguir" (vira "Seguindo ✓")
  show($("prof"),isC?ease(lt/0.35):0,60);
  if(isC){$("card").style.opacity=1-ease(lt/0.3)}
  const tap=1.0, fb=$("follow").getBoundingClientRect();
  const fx=fb.left+fb.width*0.55, fy=fb.top+fb.height*0.6;
  const fin=isC?clamp((lt-0.45)/0.35):0;
  $("finger").style.opacity=isC&&lt<tap+0.6?fin:0;
  $("finger").style.transform="translate("+(fx-30+(1-ease(fin))*180)+"px,"+(fy-10+(1-ease(fin))*260)+"px) scale("+(lt>tap&&lt<tap+0.15?0.85:1)+")";
  const on=isC&&lt>=tap;
  $("follow").classList.toggle("on",on);$("follow").textContent=on?"Seguindo ✓":"Seguir";
  $("follow").style.transform="scale("+(isC&&lt>tap&&lt<tap+0.25?1.12:1)+")";
  const rk=isC?clamp((lt-tap)/0.45):0;
  $("ring").style.opacity=rk>0&&rk<1?1-rk:0;
  $("ring").style.transform="translate("+(fx-30)+"px,"+(fy-30)+"px) scale("+(1+rk*3)+")";
  // 2) chamada + link da bio (e cupom, se houver)
  $("cta").style.opacity=isC?1:0;
  $("cta").style.top="1250px";
  show($("ctah"),isC?ease((lt-1.3)/0.35):0,30);
  $("cta").querySelector(".emo").style.transform="translateY("+(-Math.abs(Math.sin(t*5))*16)+"px)";
  $("cta").querySelector(".emo").style.opacity=isC?ease((lt-1.6)/0.3):0;
  show($("bio"),isC?ease((lt-1.8)/0.35):0,30,isC?1+0.04*Math.sin(t*6):1);
  show($("coupon"),isC?ease((lt-2.3)/0.35):0,30,isC?1+0.05*Math.sin(t*7):1);
  // legenda da narração, em blocos curtos (muita gente assiste sem som)
  const subs=D.subs||[];const vs=0.18, vd=D.voiceDur||dur;
  $("sub").style.top=(D.clip&&D.clip.length?1180:1420)+"px";
  if(key==="produto"&&subs.length){const k=Math.min(subs.length-1,Math.floor(clamp((lt-vs)/vd,0,0.999)*subs.length));$("sub").textContent=subs[k];$("sub").style.opacity=lt>vs?1:0}
  else $("sub").style.opacity=0;
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
  const k=on?Math.min(1,(dur-lt)/0.2):0;
  $("clip").style.opacity=k;
  if(on){const f=Math.floor(lt*30)%D.clip.length;if($("clipimg").dataset.f!=f){$("clipimg").src=D.clip[f];$("clipimg").dataset.f=f}}
  // com vídeo, o cartão da foto e o nome ficam escondidos nessa cena
  if(on){$("card").style.opacity=0;$("name").style.opacity=0;$("chips").style.top="1560px"}
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
  // pula o primeiro 0,5 s (costuma ter tela preta ou logo) e enquadra em tela cheia 1080x1920
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", "0.5", "-i", file, "-t", String(maxSec),
    "-vf", "fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", "-q:v", "5", path.join(fdir, "%04d.jpg")]);
  const names = (await readdir(fdir)).filter((f) => f.endsWith(".jpg")).sort();
  return Promise.all(names.map(async (f) => "data:image/jpeg;base64," + (await readFile(path.join(fdir, f))).toString("base64")));
}

export async function renderReel2(p, { cover, nome, number, handle, comment, outDir, clip = null, fala = "", avatar = null, cupom = false, modo = "instagram", log = console.log }) {
  const { chromium } = await import("playwright");
  await mkdir(outDir, { recursive: true });
  const tmp = path.join(outDir, "_tmp");
  await mkdir(tmp, { recursive: true });
  comment = comment || "Quanto você chutou? Comenta aí!";
  const scenes = buildScenes2(p, { hook: cover?.hook || "", nome, number, comment, fala, cupom, modo });
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
    cover: null, img: await imageDataUri(p.imageUrl),
    tag: "", accent: cover?.accent || "#D0306F", hookHtml: "", nome,
    chips, price: brl(p.price), comment, number: number ? String(number).startsWith("#") ? number : `#${number}` : "",
    scenes: scenes.map(({ key, dur }) => ({ key, dur })),
    clip: [],
    // legenda: a fala do produto em blocos de ~5 palavras
    subs: (() => { const w = scenes[0].say.split(/\s+/).filter(Boolean); const out = []; for (let i = 0; i < w.length; i += 5) out.push(w.slice(i, i + 5).join(" ")); return out; })(),
    voiceDur: voice[0]?.duration || 0,
    handle: handle || "@minh.asofertas",
    modo,
    avatar: avatar ? await imageDataUri(avatar).catch(() => null) : null,
    cupom,
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
