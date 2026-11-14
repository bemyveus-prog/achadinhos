// Narração do Reels. Ordem: ElevenLabs (se ELEVENLABS_API_KEY + voz escolhida) → Fish Audio (se FISH_API_KEY + FISH_VOICE_ID) → voz neural da Microsoft (grátis).
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

// ElevenLabs (ELEVENLABS_API_KEY). A voz vem do bot (/vozes → bot_config "voz_eleven") ou de ELEVENLABS_VOICE_ID.
// "microsoft" no bot desliga. Sem crédito/erro: cai para a voz da Microsoft sozinho.
let vozEleven;
async function vozElevenEscolhida() {
  if (vozEleven !== undefined) return vozEleven;
  vozEleven = env("ELEVENLABS_VOICE_ID", "");
  try {
    const url = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
    if (url && key) {
      const r = await fetch(`${url}/rest/v1/bot_config?key=eq.voz_eleven&select=value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      const v = (await r.json())?.[0]?.value;
      if (v) vozEleven = v;
    }
  } catch {}
  if (vozEleven === "microsoft") vozEleven = "";
  return vozEleven;
}
async function eleven(text, out) {
  const key = env("ELEVENLABS_API_KEY");
  if (!key) return false;
  const voice = (await vozElevenEscolhida()).split("|")[0];
  if (!voice) return false;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: env("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true, speed: Number(env("ELEVENLABS_SPEED", "1.08")) } }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 160)}`);
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
  let providers = [["ElevenLabs", eleven], ["Fish Audio", fish], ["voz Microsoft", edge]];
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
