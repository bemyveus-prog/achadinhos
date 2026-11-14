// Vídeo a partir de várias fotos do produto: cada foto em tela cheia (fundo desfocado da própria foto),
// com zoom lento, trocando a cada `porFoto` segundos. Vira o "vídeo do produto" do Reels.
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const run = promisify(execFile);
const W = 1080, H = 1920, FPS = 30;

export async function fotosParaVideo(fotos, out, { porFoto = 2.2, log = console.log } = {}) {
  if (!fotos.length) throw new Error("nenhuma foto");
  const partes = [];
  for (let i = 0; i < fotos.length; i++) {
    const parte = path.join(path.dirname(out), `foto-${i + 1}.mp4`);
    const n = Math.round(porFoto * FPS);
    // zoom alternando: entra numa foto, sai na seguinte
    const z = i % 2 === 0 ? `1+0.10*on/${n}` : `1.10-0.10*on/${n}`;
    const filtro = [
      `[0:v]split[a][b]`,
      `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:2,eq=brightness=-0.08[bg]`,
      `[b]scale=${W - 60}:${H - 360}:force_original_aspect_ratio=decrease[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2-80,scale=${W * 2}:${H * 2},zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},format=yuv420p[v]`,
    ].join(";");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-loop", "1", "-framerate", String(FPS), "-t", porFoto.toFixed(2), "-i", fotos[i],
      "-filter_complex", filtro, "-map", "[v]", "-frames:v", String(n), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", parte]);
    partes.push(parte);
  }
  if (partes.length === 1) { await run("cp", [partes[0], out]); return { file: out, seconds: porFoto }; }
  // emenda com uma transição rápida entre as fotos
  const d = 0.35;
  const inputs = partes.flatMap((p) => ["-i", p]);
  let chain = "", prev = "[0:v]", t = porFoto - d;
  for (let i = 1; i < partes.length; i++) {
    const lab = i === partes.length - 1 ? "[v]" : `[x${i}]`;
    chain += `${prev}[${i}:v]xfade=transition=${["slideleft", "fade", "slideup", "smoothleft"][i % 4]}:duration=${d}:offset=${t.toFixed(2)}${lab};`;
    prev = lab; t += porFoto - d;
  }
  await run("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", chain.replace(/;$/, ""), "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", out]);
  const seconds = partes.length * porFoto - (partes.length - 1) * d;
  log(`  vídeo das fotos: ${partes.length} fotos, ${seconds.toFixed(1)} s`);
  return { file: out, seconds };
}

// Vários vídeos (e fotos) enviados juntos: cada um vira um trecho 1080x1920 (fundo desfocado do próprio vídeo),
// sem o áudio original, e os trechos são emendados com transição. `alvo` = duração total desejada (segue a narração).
async function duracao(file) {
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    return Number(stdout.trim()) || 0;
  } catch { return 0; }
}

// corte = segundos de cada pedaço; os vídeos se revezam (5 s do 1º, 5 s do 2º, volta no 1º de onde parou…)
export async function midiasParaVideo(midias, out, { alvo = 16, porFoto = 2.2, corte = Number(process.env.VIDEO_CORTE || 5), log = console.log } = {}) {
  if (!midias.length) throw new Error("nada para emendar");
  const nV = midias.filter((m) => m.video).length, nF = midias.length - nV;
  const fontes = [];
  for (const m of midias) {
    if (!m.video) { fontes.push({ ...m, usada: false }); continue; }
    const total = await duracao(m.file);
    const ini = total > 4 ? 0.3 : 0;
    fontes.push({ ...m, pos: ini, fim: Math.max(ini + 1, (total || 6) - 0.05) });
  }
  const filtro = [
    `[0:v]fps=${FPS},split[a][b]`,
    `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=40:2,eq=brightness=-0.08[bg]`,
    `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]`,
  ].join(";");
  const partes = [];
  let total = 0, k = 0, parados = 0;
  while (total < alvo && parados < fontes.length) {
    const f = fontes[k % fontes.length]; k++;
    const parte = path.join(path.dirname(out), `trecho-${partes.length + 1}.mp4`);
    if (!f.video) {
      if (f.usada) { parados++; continue; }
      f.usada = true; parados = 0;
      const r = await fotosParaVideo([f.file], parte, { porFoto, log: () => {} });
      partes.push({ file: r.file, s: porFoto }); total += porFoto;
      continue;
    }
    const resta = f.fim - f.pos;
    if (resta < 1.2) { parados++; continue; }
    parados = 0;
    let s = Math.min(corte, resta, Math.max(1.5, alvo - total + 0.3));
    if (resta - s < 1.2 && resta <= corte + 1.5) s = resta; // não deixa sobrar pedacinho
    await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", f.pos.toFixed(2), "-t", s.toFixed(2), "-i", f.file, "-filter_complex", filtro,
      "-map", "[v]", "-an", "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", parte]);
    f.pos += s;
    const real = (await duracao(parte)) || s;
    partes.push({ file: parte, s: real }); total += real;
  }
  if (!partes.length) throw new Error("vídeos curtos demais");
  if (partes.length === 1) { await run("cp", [partes[0].file, out]); return { file: out, seconds: partes[0].s }; }
  const d = 0.3;
  const inputs = partes.flatMap((p) => ["-i", p.file]);
  let chain = "", prev = "[0:v]", t = partes[0].s - d;
  for (let i = 1; i < partes.length; i++) {
    const lab = i === partes.length - 1 ? "[v]" : `[x${i}]`;
    chain += `${prev}[${i}:v]xfade=transition=${["fade", "slideleft", "smoothleft", "slideup"][i % 4]}:duration=${d}:offset=${t.toFixed(2)}${lab};`;
    prev = lab; t += partes[i].s - d;
  }
  await run("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", chain.replace(/;$/, ""), "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", out]);
  const seconds = partes.reduce((a, p) => a + p.s, 0) - (partes.length - 1) * d;
  log(`  ${nV} vídeo(s) + ${nF} foto(s) intercalados em ${partes.length} cortes de até ${corte} s: ${seconds.toFixed(1)} s`);
  return { file: out, seconds };
}
