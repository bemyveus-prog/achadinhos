#!/usr/bin/env node
// Amostras das vozes da Microsoft em português, enviadas no Telegram para escolher.
import path from "path";
import { mkdir, readFile } from "fs/promises";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const FRASE = "Olha esse achadinho da Shopee! Sabe aquela forma de gelo que vaza no congelador? Essa tem tampa e solta o gelo fácil. Me segue que todo dia tem achado novo!";
const tts0 = new MsEdgeTTS();
const todas = await tts0.getVoices();
const pt = todas.filter((v) => /^pt-BR/.test(v.ShortName)).map((v) => ({ id: v.ShortName, genero: v.Gender }));
console.log("Vozes pt-BR:", pt.map((v) => `${v.id} (${v.genero})`).join(", "));
const out = path.resolve("saida/vozes"); await mkdir(out, { recursive: true });
const token = process.env.TELEGRAM_BOT_TOKEN, chat = (process.env.TELEGRAM_CHAT_ID || "").split(/[\s,;]+/)[0];
for (const v of pt) {
  for (const rate of ["+12%", "+22%"]) {
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(v.id, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioFilePath } = await tts.toFile(out, FRASE, { rate });
      tts.close();
      const nome = v.id.replace("pt-BR-", "").replace("Neural", "");
      const form = new FormData();
      form.append("chat_id", chat);
      form.append("audio", new Blob([await readFile(audioFilePath)], { type: "audio/mpeg" }), `${nome} ${rate}.mp3`);
      form.append("title", `${nome} ${rate}`);
      form.append("performer", v.genero === "Female" ? "Feminina" : "Masculina");
      form.append("caption", `🎙️ ${nome} (${v.genero === "Female" ? "feminina" : "masculina"}) · velocidade ${rate}\nPara usar: variável EDGE_VOICE = ${v.id}${rate !== "+22%" ? ` e EDGE_RATE_REELS = ${rate}` : ""}`);
      const r = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, { method: "POST", body: form });
      console.log(nome, rate, (await r.json()).ok ? "enviada" : "falhou");
    } catch (e) { console.log(v.id, rate, "erro:", e.message); }
  }
}
