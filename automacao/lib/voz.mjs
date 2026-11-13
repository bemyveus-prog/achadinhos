// Narração do Reels. Ordem: Fish Audio (se FISH_API_KEY + FISH_VOICE_ID) → voz neural da Microsoft (grátis).
// Se nenhuma funcionar, o vídeo sai sem narração (só com a música, se houver).
import { mkdir, writeFile, rename } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";

const run = promisify(execFile);
const env = (k, d) => (process.env[k] ?? "").trim() || d;

export async function audioDuration(file) {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim()) || 0;
}

async function fish(text, out) {
  const key = env("FISH_API_KEY");
  const voice = env("FISH_VOICE_ID");
  if (!key || !voice) return false;
  const r = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", model: env("FISH_MODEL", "s1") },
    body: JSON.stringify({ text, reference_id: voice, format: "mp3", latency: "normal" }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`Fish ${r.status}: ${(await r.text()).slice(0, 120)}`);
  await writeFile(out, Buffer.from(await r.arrayBuffer()));
  return true;
}

// rodízio entre as vozes femininas (uma por vídeo); EDGE_VOICE fixa uma voz específica
const VOZES_FEMININAS = ["pt-BR-FranciscaNeural", "pt-BR-ThalitaMultilingualNeural"];
const vozFixa = env("EDGE_VOICE", "");
export const VOZ_DO_VIDEO = vozFixa && vozFixa !== "rodizio" ? vozFixa : VOZES_FEMININAS[Math.floor(Math.random() * VOZES_FEMININAS.length)];

async function edge(text, out) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOZ_DO_VIDEO, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const dir = path.dirname(out);
  const { audioFilePath } = await tts.toFile(dir, text, { rate: env("EDGE_RATE", "+12%") });
  tts.close();
  await rename(audioFilePath, out);
  return true;
}

/**
 * Gera um mp3 por fala. Devolve [{ file, duration }] (file = null quando não deu para narrar aquela fala).
 */
// Só para o áudio (a legenda na tela continua escrita certo): a voz lê "Shopee" como "Shopei"; testado: "Chopí" soa certo
export const falaParaVoz = (t) => String(t ?? "").replace(/shopee/gi, "Chopí");

export async function narrate(lines, dir, log = console.log) {
  await mkdir(dir, { recursive: true });
  let providers = [["Fish Audio", fish], ["voz Microsoft", edge]];
  let chosen = null;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const file = path.join(dir, `fala-${i + 1}.mp3`);
    const fala = falaParaVoz(lines[i]);
    let ok = false;
    for (const [name, fn] of chosen ? [chosen] : [...providers]) {
      try {
        if (await fn(fala, file)) {
          ok = true;
          if (!chosen) { chosen = [name, fn]; log(`Narração: ${name}${name === "voz Microsoft" ? ` (${VOZ_DO_VIDEO.replace("pt-BR-", "").replace("Neural", "")})` : ""}`); }
          break;
        }
      } catch (e) {
        log(`${name} falhou (${e.message})`);
        providers = providers.filter(([n]) => n !== name); // não tenta de novo nas próximas falas
      }
    }
    out.push(ok ? { file, duration: await audioDuration(file) } : { file: null, duration: 0 });
  }
  if (!chosen) log("Sem narração (nenhuma voz disponível); o Reels sai só com a trilha.");
  return out;
}
