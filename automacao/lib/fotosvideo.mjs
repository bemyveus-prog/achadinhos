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
