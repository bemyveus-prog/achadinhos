// Marca d'água discreta nos vídeos: o @ do perfil em texto pequeno e semitransparente,
// centralizado no topo (y≈165 de 1920), acima dos títulos e longe dos botões e da legenda do Instagram/YouTube.
//   MARCA_DAGUA: texto (padrão: INSTAGRAM_HANDLE ou @minh.asofertas); "nao" desliga.
import { spawn } from "child_process";
import { existsSync } from "fs";
import { rename, unlink } from "fs/promises";

const FONTES = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"];

function run(cmd, args) {
  return new Promise((ok, fail) => { const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] }); let e = ""; p.stderr.on("data", (d) => (e += d)); p.on("close", (c) => (c ? fail(new Error(e.slice(-400))) : ok())); });
}

export async function marcaDagua(file, log = console.log) {
  const txt = ((process.env.MARCA_DAGUA || "").trim() || (process.env.INSTAGRAM_HANDLE || "").trim() || "@minh.asofertas");
  if (/^n[aã]o$/i.test(txt)) return file;
  const fonte = FONTES.find((f) => existsSync(f));
  const esc = txt.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019");
  const draw = `drawtext=${fonte ? `fontfile='${fonte}':` : ""}text='${esc}':fontsize=h*0.019:fontcolor=white@0.55:shadowcolor=black@0.35:shadowx=2:shadowy=2:x=(w-tw)/2:y=h*0.086`;
  const tmp = file.replace(/\.mp4$/i, "") + ".marca.mp4";
  try {
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-vf", draw, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", tmp]);
    await rename(tmp, file);
    log(`  marca d'água: ${txt}`);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    log(`  marca d'água falhou (vídeo segue sem): ${e.message.slice(0, 160)}`);
  }
  return file;
}
