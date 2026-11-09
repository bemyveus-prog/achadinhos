#!/usr/bin/env node
// Gera a capa (imagem do pin) dos produtos da vitrine que ainda não têm. O feed /rss do Pinterest usa essas capas.
//   node pins.mjs [--max 40]
import { fillMissingPins } from "./lib/pins.mjs";
const i = process.argv.indexOf("--max");
fillMissingPins({ max: i > 0 ? Number(process.argv[i + 1]) : 40 }).catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
