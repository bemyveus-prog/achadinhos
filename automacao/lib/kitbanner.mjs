// Banner "Kit 72 horas" (2:1) no topo da vitrine, abrindo a categoria Kit Emergência (?c=kit).
const TITLE = "Kit Emergência 72 horas";

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 600px; overflow: hidden; background: #111826; color: #fff;
         font-family: "Plus Jakarta Sans", Inter, "DejaVu Sans", sans-serif; position: relative; }
  .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px); background-size: 40px 40px; }
  .wrap { position: absolute; left: 70px; top: 70px; right: 520px; }
  .eyebrow { color: #F6D32D; font-weight: 800; font-size: 26px; letter-spacing: .1em; text-transform: uppercase; }
  h1 { font-size: 104px; line-height: .95; font-weight: 800; letter-spacing: -.03em; margin-top: 18px; }
  h1 span { background: #F6D32D; color: #111826; padding: 0 14px; border-radius: 12px; }
  p { margin-top: 26px; font-size: 32px; font-weight: 700; color: rgba(255,255,255,.82); line-height: 1.25; }
  .cta { margin-top: 30px; display: inline-flex; align-items: center; gap: 12px; background: #fff; color: #111826;
         font-weight: 800; font-size: 30px; padding: 14px 26px; border-radius: 999px; }
  .art { position: absolute; right: 60px; top: 90px; width: 420px; height: 420px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .bottle { width: 100%; height: 100%; }
</style></head><body>
  <div class="grid"></div>
  <div class="wrap">
    <div class="eyebrow">Prepare sua casa</div>
    <h1>Kit <span>72h</span></h1>
    <p>Água, luz, rádio e primeiros socorros: os itens que valem ter em casa</p>
    <div class="cta">Ver os itens →</div>
  </div>
  <div class="art">${Array.from({ length: 9 }, () => `<svg class="bottle" viewBox="0 0 60 120"><rect x="22" y="2" width="16" height="10" rx="3" fill="#2E7DB5"/><path d="M18 14h24l6 14v84a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6V28z" fill="#4FC3F7"/><rect x="12" y="52" width="36" height="22" fill="#fff" opacity=".9"/></svg>`).join("")}</div>
</body></html>`;

export async function createKitBanner(sb, log = console.log) {
  const { data: existing } = await sb.from("banners").select("id").eq("title", TITLE).limit(1);
  if (existing?.length) { log("Banner do kit já existe na vitrine."); return; }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  let png;
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 600 } });
    await page.setContent(html, { waitUntil: "load", timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    png = await page.screenshot({ type: "jpeg", quality: 90 });
  } finally {
    await browser.close();
  }

  const path = `kit/kit-72h-${Date.now()}.jpg`;
  const { error: upErr } = await sb.storage.from("banners").upload(path, png, { contentType: "image/jpeg", upsert: true });
  if (upErr) throw new Error(`Banner (upload): ${upErr.message}. Rodou o supabase/banners.sql?`);
  const image_url = sb.storage.from("banners").getPublicUrl(path).data.publicUrl;

  const site = (process.env.VITRINE_URL || "https://achadinhos-coral.vercel.app").replace(/\/+$/, "");
  const { error } = await sb.from("banners").insert({ image_url, link: `${site}/?c=kit`, title: TITLE, sort: -1, active: true });
  if (error) throw new Error(`Banner: ${error.message}`);
  log(`Banner "${TITLE}" no topo da vitrine (abre a categoria Kit Emergência).`);
}
