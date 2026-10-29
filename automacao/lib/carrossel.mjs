import { readFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import { brl, salesLabel } from "./textos.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Baixa a foto do produto e embute no HTML (o navegador não precisa acessar a Shopee)
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

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
:root{--coral:#FF5A36;--cream:#FFF4E8;--ink:#2B1A12;--sun:#FFD23F;--mint:#1FB58F}
body{font-family:'Inter','Inter Display',system-ui,sans-serif;background:#111}
.s{width:1080px;height:1350px;position:relative;overflow:hidden}
.tag{position:absolute;top:56px;left:64px;font-weight:800;font-size:28px;letter-spacing:3px;padding:14px 26px;border-radius:50px}
.pg{position:absolute;top:56px;right:64px;font-weight:700;font-size:28px;padding:12px 22px;border-radius:40px;background:rgba(255,255,255,.9);color:var(--ink)}
h1{font-weight:900;letter-spacing:-2px;line-height:1.02}
.photo{position:absolute;background:#fff;border-radius:48px;overflow:hidden;box-shadow:0 30px 60px rgba(43,26,18,.22)}
.photo img{width:100%;height:100%;object-fit:contain;display:block}
.handle{position:absolute;bottom:44px;left:0;right:0;text-align:center;font-weight:700;font-size:30px;opacity:.75}

.s1{background:var(--coral);color:#fff}
.s1 .tag{background:var(--ink);color:#fff}
.s1 h1{position:absolute;top:160px;left:64px;right:64px;font-size:104px}
.s1 .photo{left:110px;right:110px;top:560px;height:640px;transform:rotate(-2deg)}
.s1 .sticker{position:absolute;right:56px;top:500px;width:250px;height:250px;border-radius:50%;background:var(--sun);color:var(--ink);display:grid;place-items:center;text-align:center;transform:rotate(10deg);box-shadow:0 14px 0 rgba(43,26,18,.25)}
.s1 .sticker b{display:block;font-size:76px;font-weight:900;line-height:1}
.s1 .sticker span{font-size:30px;font-weight:800}
.s1 .swipe{position:absolute;bottom:56px;left:0;right:0;text-align:center}
.s1 .swipe span{background:var(--ink);color:#fff;font-weight:800;font-size:32px;padding:14px 32px;border-radius:40px}

.s2{background:var(--cream);color:var(--ink)}
.s2 .tag{background:var(--coral);color:#fff}
.s2 h1{position:absolute;top:160px;left:64px;right:64px;font-size:92px}
.stats{position:absolute;left:64px;right:64px;top:420px;display:flex;flex-direction:column;gap:26px}
.stat{background:#fff;border-radius:36px;padding:34px 40px;display:flex;align-items:center;gap:30px;box-shadow:0 10px 0 rgba(43,26,18,.08)}
.stat .ic{flex:none;width:110px;height:110px;border-radius:50%;display:grid;place-items:center;font-size:60px;background:var(--cream)}
.stat b{display:block;font-size:66px;font-weight:900;line-height:1}
.stat span{font-size:32px;font-weight:600;opacity:.7}
.s2 .photo{width:270px;height:270px;right:64px;bottom:48px;transform:rotate(4deg)}

.s3{background:var(--ink);color:#fff}
.s3 .tag{background:var(--sun);color:var(--ink)}
.s3 h1{position:absolute;top:160px;left:64px;right:64px;font-size:88px}
.s3 h1 em{font-style:normal;color:var(--sun)}
.s3 .photo{left:64px;right:64px;top:420px;height:500px}
.list{position:absolute;left:64px;right:64px;top:940px;display:flex;flex-direction:column;gap:18px}
.li{display:flex;gap:20px;align-items:center;font-size:40px;font-weight:700;line-height:1.15}
.li i{flex:none;width:58px;height:58px;border-radius:50%;background:var(--mint);display:grid;place-items:center;font-style:normal;font-size:32px}
.fullname{position:absolute;left:64px;right:64px;top:950px;font-size:40px;font-weight:600;line-height:1.3;opacity:.9}
.forwho{position:absolute;left:64px;right:64px;bottom:60px;font-size:32px;font-weight:600;color:var(--sun)}

.s4{background:var(--sun);color:var(--ink)}
.s4 .tag{background:var(--ink);color:#fff}
.s4 h1{position:absolute;top:160px;left:64px;right:64px;font-size:100px}
.s4 .photo{width:520px;height:520px;left:280px;top:330px;transform:rotate(-3deg)}
.pricebox{position:absolute;left:64px;right:64px;top:910px;background:#fff;border-radius:44px;padding:40px;text-align:center;box-shadow:0 12px 0 rgba(43,26,18,.15)}
.pricebox .old{font-size:44px;font-weight:700;opacity:.5;text-decoration:line-through}
.pricebox .new{font-size:130px;font-weight:900;color:var(--coral);line-height:1.05;letter-spacing:-3px}
.pricebox .off{display:inline-block;margin-top:10px;background:var(--mint);color:#fff;font-weight:800;font-size:34px;padding:10px 26px;border-radius:40px}
.s4 .note{position:absolute;bottom:50px;left:0;right:0;text-align:center;font-size:26px;font-weight:600;opacity:.6}

.s5{background:var(--coral);color:#fff}
.s5 .tag{background:#fff;color:var(--coral)}
.s5 h1{position:absolute;top:160px;left:64px;right:64px;font-size:118px}
.s5 .photo{width:420px;height:420px;left:330px;top:420px;transform:rotate(3deg)}
.cta{position:absolute;left:64px;right:64px;top:900px;background:#fff;color:var(--ink);border-radius:44px;padding:40px;text-align:center}
.cta small{display:block;font-size:36px;font-weight:700;margin-bottom:6px}
.cta .n{font-size:150px;font-weight:900;color:var(--coral);line-height:1;letter-spacing:-4px}
.cta .bio{display:inline-block;margin-top:14px;background:var(--ink);color:#fff;font-weight:800;font-size:36px;padding:14px 32px;border-radius:40px}
`;

function slides(p, t, ctx) {
  const total = 5;
  const pg = (i) => `<div class="pg">${i}/${total}</div>`;
  const img = `<img src="${ctx.img}">`;
  const handle = ctx.handle ? `<div class="handle">${esc(ctx.handle)}</div>` : "";
  const off = p.discount >= 5 ? Math.round(p.discount) : 0;

  const s1 = `<div class="s s1">
    <div class="tag">ACHADINHO SHOPEE</div>${pg(1)}
    <h1>${esc(t.gancho)}</h1>
    <div class="photo">${img}</div>
    ${off ? `<div class="sticker"><div><b>-${off}%</b><span>hoje</span></div></div>` : ""}
    <div class="swipe"><span>arrasta pro lado →</span></div>
  </div>`;

  const s2 = `<div class="s s2">
    <div class="tag">APROVADO</div>${pg(2)}
    <h1>Por que todo mundo tá comprando</h1>
    <div class="stats">
      <div class="stat"><div class="ic">🛒</div><div><b>${salesLabel(p.sales)}</b><span>vendidos na Shopee</span></div></div>
      <div class="stat"><div class="ic">⭐</div><div><b>${p.rating.toFixed(1).replace(".", ",")} de 5</b><span>nota de quem comprou</span></div></div>
      ${off ? `<div class="stat"><div class="ic">💸</div><div><b>${off}% OFF</b><span>no preço de hoje</span></div></div>` : ""}
    </div>
    <div class="photo">${img}</div>
  </div>`;

  const body3 = t.destaques?.length
    ? `<div class="list">${t.destaques.map((d) => `<div class="li"><i>✓</i>${esc(d)}</div>`).join("")}</div>`
    : `<div class="fullname">${esc(p.name.slice(0, 140))}</div>`;
  const s3 = `<div class="s s3">
    <div class="tag">O QUE É</div>${pg(3)}
    <h1><em>${esc(t.nome)}</em></h1>
    <div class="photo">${img}</div>
    ${body3}
    ${t.paraQuem ? `<div class="forwho">Pra quem: ${esc(t.paraQuem)}</div>` : ""}
  </div>`;

  const s4 = `<div class="s s4">
    <div class="tag">QUANTO CUSTA</div>${pg(4)}
    <h1>Olha esse preço</h1>
    <div class="photo">${img}</div>
    <div class="pricebox">
      ${p.originalPrice ? `<div class="old">de ${brl(p.originalPrice)}</div>` : ""}
      <div class="new">${brl(p.price)}</div>
      ${off ? `<div class="off">${off}% de desconto</div>` : ""}
    </div>
    <div class="note">Preço do dia ${ctx.date}. Pode mudar, confira no link.</div>
  </div>`;

  const s5 = `<div class="s s5">
    <div class="tag">ONDE COMPRAR</div>${pg(5)}
    <h1>Quer o seu?</h1>
    <div class="photo">${img}</div>
    <div class="cta">
      ${ctx.number
        ? `<small>Na vitrine da bio, digite</small><div class="n">${ctx.number}</div>`
        : `<small>Tá tudo no</small><div class="n" style="font-size:110px">link da bio</div>`}
      <div class="bio">toca no link da bio 👆</div>
    </div>
    ${handle}
  </div>`;

  return [s1, s2, s3, s4, s5];
}

export async function renderCarousel(p, texts, { outDir, number, handle }) {
  const { chromium } = await import("playwright");
  await mkdir(outDir, { recursive: true });
  const img = await imageDataUri(p.imageUrl);
  const date = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const html = slides(p, texts, { img, number, handle, date });

  const browser = await chromium.launch();
  const files = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
    for (let i = 0; i < html.length; i++) {
      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@600;700;800;900&display=swap" rel="stylesheet">
        <style>${CSS}</style></head><body>${html[i]}</body></html>`,
        { waitUntil: "load", timeout: 15000 },
      ).catch(() => {}); // sem internet para a fonte, segue com a fonte do sistema
      await page.evaluate(() => document.fonts?.ready);
      const file = path.join(outDir, `${i + 1}.jpg`);
      await page.locator(".s").screenshot({ path: file, type: "jpeg", quality: 92 });
      files.push(file);
    }
  } finally {
    await browser.close();
  }
  await writeFile(path.join(outDir, "legenda.txt"), texts.legenda + "\n");
  return files;
}
