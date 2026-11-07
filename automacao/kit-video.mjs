#!/usr/bin/env node
// Vídeo "Kit de emergência 72h" para Reels/Shorts, com legenda do Instagram e texto do YouTube.
//   node kit-video.mjs        (narração: Fish se configurada, senão voz Microsoft)
import path from "path";
import { writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { renderKitVideo, FONTES } from "./lib/kitvideo.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const env = (k, d) => (process.env[k] ?? "").trim() || d;
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);

// voz mais séria para esse tema (pode trocar com a variável EDGE_VOICE_KIT)
process.env.EDGE_VOICE = env("EDGE_VOICE_KIT", "pt-BR-AntonioNeural");
process.env.EDGE_RATE = env("EDGE_RATE_KIT", "+6%");

const handle = env("HANDLE_KIT", "@mindloop_u");

async function main() {
  const outDir = path.resolve(env("PASTA_SAIDA", path.join(HERE, "saida")), "kit-72h");
  const { file, seconds } = await renderKitVideo({ outDir, handle, music: env("MUSICA", "") || null, log });

  const fontes = FONTES.map((f) => `• ${f}`).join("\n");
  await writeFile(path.join(outDir, "legenda-instagram.txt"), `⚠️ Se faltar água e luz por 3 dias, sua casa aguenta?

Vários países já pedem um kit de emergência para 72 horas. No Brasil ainda não há campanha nacional, mas a Defesa Civil de SP orienta água e comida para 3 dias, e a do Paraná fala em 2 L de água por pessoa por dia.

👉 Separei todos os itens do kit na vitrine do link da bio: toque em "Kit Emergência".

Salva esse vídeo e manda pra quem mora com você. 💛

#kitdeemergencia #defesacivil #prevencao #emergencia #dicas
`);
  await writeFile(path.join(outDir, "youtube.txt"), `TÍTULO:
Kit de emergência de 72 horas: quanto de água sua família precisa? #shorts

DESCRIÇÃO:
Se faltar água e luz por três dias, sua casa aguenta? Vários países recomendam um kit de emergência para 72 horas. Veja a conta da água (2 L por pessoa por dia) e o que mais ter no kit.

Os itens do kit estão na vitrine do link do perfil, na categoria "Kit Emergência".

Fontes:
${fontes}

#kitdeemergencia #defesacivil #shorts
`);
  log(`Pronto: ${file} (${seconds.toFixed(1)} s) + capa.jpg, legenda-instagram.txt e youtube.txt`);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
