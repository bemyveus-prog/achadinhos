import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Usa o MESMO desenho do gerador do /admin (lib/carouselCanvas.js),
// rodando num navegador sem tela (Playwright). Assim os dois saem iguais.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CANVAS_LIB = path.resolve(HERE, "../../lib/carouselCanvas.js");

// Baixa a foto do produto e embute como data URI (o canvas não pode usar foto de outro site)
export async function imageDataUri(src) {
  if (/^https?:\/\//.test(src)) {
    const r = await fetch(src, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Não baixei a foto do produto (${r.status})`);
    const type = r.headers.get("content-type") || "image/jpeg";
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  }
  const ext = path.extname(src).slice(1).replace("jpg", "jpeg") || "jpeg";
  return `data:image/${ext};base64,${(await readFile(src)).toString("base64")}`;
}

export async function renderCarousel(p, texts, { outDir, number, handle, theme }) {
  const { chromium } = await import("playwright");
  await mkdir(outDir, { recursive: true });
  const img = await imageDataUri(p.imageUrl);
  const lib = await readFile(CANVAS_LIB, "utf8");

  const offer = {
    id: p.itemId,
    title: p.name,
    price: p.price || null,
    original_price: p.originalPrice || null,
    platform: "shopee",
    category: p.category || "",
  };
  const stats = { sales: p.sales, rating: p.rating };
  const t = { gancho: texts.gancho, nome: texts.nome, destaques: texts.destaques || [] };

  const browser = await chromium.launch();
  const files = [];
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8">
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
      </head><body></body></html>`,
      { waitUntil: "load", timeout: 15000 },
    ).catch(() => {}); // sem internet para a fonte, segue com a fonte do sistema
    await page.addScriptTag({ type: "module", content: `${lib}\nwindow.__CC = { drawSlide, buildData, loadFonts, loadImage, SLIDE_COUNT, themeFor };` });
    await page.waitForFunction(() => window.__CC, null, { timeout: 10000 });

    const { jpgs, themeKey } = await page.evaluate(async ({ offer, t, stats, number, handle, theme, img }) => {
      const C = window.__CC;
      await C.loadFonts();
      const image = await C.loadImage(img);
      const key = theme || C.themeFor(offer);
      const d = C.buildData(offer, t, { img: image, stats, number, handle, theme: key });
      const out = [];
      for (let i = 0; i < C.SLIDE_COUNT; i++) {
        const c = document.createElement("canvas");
        C.drawSlide(c, i, d);
        out.push(c.toDataURL("image/jpeg", 0.92).split(",")[1]);
      }
      return { jpgs: out, themeKey: key };
    }, { offer, t, stats, number, handle, theme, img });

    for (const [i, b64] of jpgs.entries()) {
      const file = path.join(outDir, `${i + 1}.jpg`);
      await writeFile(file, Buffer.from(b64, "base64"));
      files.push(file);
    }
    files.themeKey = themeKey;
  } finally {
    await browser.close();
  }
  await writeFile(path.join(outDir, "legenda.txt"), texts.legenda + "\n");
  return files;
}
