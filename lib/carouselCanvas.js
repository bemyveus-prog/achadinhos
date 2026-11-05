// Desenha o carrossel (5 slides 1080x1350) num <canvas>, direto no navegador.
// Mesmo visual da automação diária (automacao/lib/carrossel.mjs).

export const W = 1080;
export const H = 1350;

const C = {
  coral: "#FF5A36",
  cream: "#FFF4E8",
  ink: "#2B1A12",
  sun: "#FFD23F",
  mint: "#1FB58F",
  white: "#FFFFFF",
};
const FONT = `"Plus Jakarta Sans", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
const EMOJI = `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

export const brl = (v) => "R$ " + Number(v).toFixed(2).replace(".", ",");

export function salesLabel(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000) return `${Math.floor(n / 1_000_000)} milhão+`;
  if (n >= 10_000) return `${Math.floor(n / 1000)} mil+`;
  if (n >= 1000) return `${(Math.floor(n / 100) / 10).toString().replace(".", ",")} mil+`;
  return String(n);
}

// Nome curto, sem o "SEO" que os vendedores colocam no título
export function shortName(name, maxWords = 6) {
  return String(name || "")
    .replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g, " ")
    .replace(/\b(envio imediato|pronta entrega|promo[cç][aã]o|oferta|original|lan[cç]amento|frete gr[aá]tis)\b/gi, " ")
    .replace(/[|/+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, maxWords)
    .join(" ");
}

export function discountOf(price, original) {
  const p = Number(price), o = Number(original);
  if (!p || !o || o <= p) return 0;
  return Math.round((1 - p / o) * 100);
}

export function defaultTexts(offer, number, stats = {}) {
  const off = discountOf(offer.price, offer.original_price);
  const nome = shortName(offer.title);
  const loja = offer.platform === "tiktok" ? "TikTok Shop" : "Shopee";
  const lines = [`${nome} 🛒`, ""];
  if (stats.rating && stats.sales) lines.push(`⭐ Nota ${Number(stats.rating).toFixed(1).replace(".", ",")} e ${salesLabel(stats.sales)} vendidos`);
  if (offer.price) lines.push(offer.original_price && off ? `💸 De ${brl(offer.original_price)} por ${brl(offer.price)}` : `💸 Por ${brl(offer.price)}`);
  lines.push("", number ? `👉 Link na bio! Digite ${number} na busca.` : "👉 Link na bio!");
  lines.push("", `#achadinhos #achadinhos${loja === "Shopee" ? "shopee" : "tiktokshop"} #${loja === "Shopee" ? "shopee" : "tiktokshop"} #comprinhas #achados`);
  return {
    gancho: off >= 30 ? `${off}% OFF nesse achadinho da ${loja}` : `Achei isso na ${loja} e precisava te mostrar`,
    nome,
    destaques: ["", "", ""],
    legenda: lines.join("\n"),
  };
}

// ---------- utilidades de desenho ----------

function font(ctx, weight, size) {
  ctx.font = `${weight} ${size}px ${FONT}`;
}

function wrap(ctx, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

// Escreve um texto quebrando linhas e diminuindo a fonte até caber em maxLines
function fitText(ctx, text, { x, y, maxWidth, size, minSize = 40, maxLines = 3, weight = 800, color, lineHeight = 1.04, align = "left" }) {
  let s = size, lines;
  for (; s >= minSize; s -= 4) {
    font(ctx, weight, s);
    lines = wrap(ctx, text, maxWidth);
    if (lines.length <= maxLines) break;
  }
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
  }
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * s * lineHeight));
  ctx.textAlign = "left";
  return y + lines.length * s * lineHeight;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function box(ctx, x, y, w, h, r, fill, shadow) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur || 0;
    ctx.shadowOffsetY = shadow.y || 0;
  }
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

function pill(ctx, text, { x, y, bg, color, size = 28, padX = 26, h = 62, weight = 800, letter = 3, align = "left" }) {
  font(ctx, weight, size);
  const canSpace = "letterSpacing" in ctx;
  if (canSpace) ctx.letterSpacing = `${letter}px`;
  const w = ctx.measureText(text).width + padX * 2;
  const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  box(ctx, left, y, w, h, h / 2, bg);
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  // o espaçamento extra fica depois da última letra: compensa para centralizar
  ctx.fillText(text, left + padX + (canSpace ? letter / 2 : 0), y + h / 2 + 1);
  if (canSpace) ctx.letterSpacing = "0px";
  return w;
}

// Foto do produto num cartão branco arredondado (object-fit: contain), com leve giro
function photo(ctx, img, { x, y, w, h, r = 48, rotate = 0, pad = 0 }) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  box(ctx, -w / 2, -h / 2, w, h, r, C.white, { color: "rgba(43,26,18,.25)", blur: 50, y: 24 });
  rr(ctx, -w / 2, -h / 2, w, h, r);
  ctx.clip();
  if (img) {
    const s = Math.min((w - pad * 2) / img.width, (h - pad * 2) / img.height);
    const iw = img.width * s, ih = img.height * s;
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  } else {
    ctx.fillStyle = "#F3EDE6";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    font(ctx, 700, 36);
    ctx.fillStyle = "#B8AFA6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("sem foto", 0, 0);
  }
  ctx.restore();
}

function page(ctx, i, total = 5) {
  pill(ctx, `${i}/${total}`, { x: W - 64, y: 56, bg: "rgba(255,255,255,.9)", color: C.ink, size: 28, padX: 22, h: 56, weight: 700, letter: 0, align: "right" });
}

function emoji(ctx, ch, cx, cy, size) {
  ctx.font = `${size}px ${EMOJI}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ch, cx, cy);
  ctx.textAlign = "left";
}

// ---------- slides ----------

function slide1(ctx, d) {
  ctx.fillStyle = C.coral;
  ctx.fillRect(0, 0, W, H);
  pill(ctx, `ACHADINHO ${d.loja.toUpperCase()}`, { x: 64, y: 56, bg: C.ink, color: C.white });
  page(ctx, 1);
  fitText(ctx, d.gancho, { x: 64, y: 160, maxWidth: W - 128, size: 104, maxLines: 3, color: C.white });
  photo(ctx, d.img, { x: 110, y: 560, w: W - 220, h: 640, rotate: -2 });
  if (d.off >= 5) {
    ctx.save();
    ctx.translate(W - 56 - 125, 500 + 125);
    ctx.rotate((10 * Math.PI) / 180);
    ctx.shadowColor = "rgba(43,26,18,.25)";
    ctx.shadowOffsetY = 14;
    ctx.beginPath();
    ctx.arc(0, 0, 125, 0, Math.PI * 2);
    ctx.fillStyle = C.sun;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = C.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    font(ctx, 800, 72);
    ctx.fillText(`-${d.off}%`, 0, -14);
    font(ctx, 800, 30);
    ctx.fillText("hoje", 0, 48);
    ctx.restore();
  }
  pill(ctx, "arrasta pro lado →", { x: W / 2, y: H - 56 - 66, bg: C.ink, color: C.white, size: 32, h: 66, padX: 32, letter: 0, align: "center" });
}

function slide2(ctx, d) {
  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, W, H);
  pill(ctx, "APROVADO", { x: 64, y: 56, bg: C.coral, color: C.white });
  page(ctx, 2);
  const stats = [];
  if (d.sales) stats.push(["🛒", salesLabel(d.sales), "vendidos"]);
  if (d.rating) stats.push(["⭐", `${Number(d.rating).toFixed(1).replace(".", ",")} de 5`, "nota de quem comprou"]);
  if (d.off >= 5) stats.push(["💸", `${d.off}% OFF`, "no preço de hoje"]);
  if (d.price) stats.push(["🏷️", brl(d.price), "preço de hoje"]);
  const titulo = d.sales ? "Por que todo mundo tá comprando" : "Por que vale a pena";
  fitText(ctx, titulo, { x: 64, y: 160, maxWidth: W - 128, size: 92, maxLines: 2, color: C.ink });

  let y = 420;
  // números primeiro; se faltar, completa com os destaques digitados e, no fim, com o "link na bio"
  const list = [...stats, ...d.destaques.filter(Boolean).map((t) => ["✅", t, ""])];
  if (list.length < 2) list.push(["🔗", "Link na bio", "é só tocar e comprar"]);
  list.splice(3);
  for (const [ic, big, small] of list) {
    box(ctx, 64, y, W - 128, 178, 36, C.white, { color: "rgba(43,26,18,.08)", y: 10 });
    ctx.beginPath();
    ctx.arc(64 + 40 + 55, y + 89, 55, 0, Math.PI * 2);
    ctx.fillStyle = C.cream;
    ctx.fill();
    emoji(ctx, ic, 64 + 40 + 55, y + 92, 58);
    if (small) {
      fitText(ctx, big, { x: 260, y: y + 36, maxWidth: W - 128 - 230, size: 66, minSize: 40, maxLines: 1, color: C.ink, weight: 800 });
      font(ctx, 600, 32);
      ctx.fillStyle = "rgba(43,26,18,.65)";
      ctx.textBaseline = "top";
      ctx.fillText(small, 260, y + 112);
    } else {
      fitText(ctx, big, { x: 260, y: y + 40, maxWidth: W - 128 - 230, size: 44, minSize: 30, maxLines: 2, color: C.ink, weight: 700, lineHeight: 1.15 });
    }
    y += 204;
  }
  photo(ctx, d.img, { x: W - 64 - 270, y: H - 48 - 270, w: 270, h: 270, r: 40, rotate: 4 });
}

function slide3(ctx, d) {
  ctx.fillStyle = C.ink;
  ctx.fillRect(0, 0, W, H);
  pill(ctx, "O QUE É", { x: 64, y: 56, bg: C.sun, color: C.ink });
  page(ctx, 3);
  fitText(ctx, d.nome, { x: 64, y: 160, maxWidth: W - 128, size: 88, maxLines: 2, color: C.sun });
  photo(ctx, d.img, { x: 64, y: 420, w: W - 128, h: 500, r: 48 });
  const dest = d.destaques.filter(Boolean);
  if (dest.length) {
    let y = 960;
    for (const t of dest.slice(0, 3)) {
      ctx.beginPath();
      ctx.arc(64 + 29, y + 29, 29, 0, Math.PI * 2);
      ctx.fillStyle = C.mint;
      ctx.fill();
      font(ctx, 800, 32);
      ctx.fillStyle = C.white;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✓", 64 + 29, y + 31);
      ctx.textAlign = "left";
      fitText(ctx, t, { x: 64 + 80, y: y + 6, maxWidth: W - 128 - 80, size: 40, minSize: 30, maxLines: 1, color: C.white, weight: 700 });
      y += 96;
    }
  } else {
    fitText(ctx, d.title, { x: 64, y: 960, maxWidth: W - 128, size: 40, minSize: 32, maxLines: 4, color: "rgba(255,255,255,.9)", weight: 600, lineHeight: 1.3 });
  }
}

function slide4(ctx, d) {
  ctx.fillStyle = C.sun;
  ctx.fillRect(0, 0, W, H);
  pill(ctx, "QUANTO CUSTA", { x: 64, y: 56, bg: C.ink, color: C.white });
  page(ctx, 4);
  fitText(ctx, "Olha esse preço", { x: 64, y: 160, maxWidth: W - 128, size: 100, maxLines: 1, color: C.ink });
  photo(ctx, d.img, { x: 280, y: 330, w: 520, h: 520, r: 44, rotate: -3 });
  const hasOld = Boolean(d.original && d.off);
  const bh = d.price ? 80 + (hasOld ? 60 : 0) + 150 + (d.off ? 70 : 0) : 220;
  const by = 880;
  box(ctx, 64, by, W - 128, bh, 44, C.white, { color: "rgba(43,26,18,.15)", y: 12 });
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (d.price) {
    let y = by + 40;
    if (hasOld) {
      font(ctx, 700, 44);
      ctx.fillStyle = "rgba(43,26,18,.5)";
      const t = `de ${brl(d.original)}`;
      ctx.fillText(t, W / 2, y);
      const tw = ctx.measureText(t).width;
      ctx.fillRect(W / 2 - tw / 2, y + 24, tw, 4);
      y += 60;
    }
    font(ctx, 800, 130);
    ctx.fillStyle = C.coral;
    ctx.fillText(brl(d.price), W / 2, y);
    y += 150;
    if (d.off) {
      ctx.textAlign = "left";
      pill(ctx, `${d.off}% de desconto`, { x: W / 2, y, bg: C.mint, color: C.white, size: 34, h: 58, letter: 0, align: "center" });
    }
  } else {
    font(ctx, 800, 72);
    ctx.fillStyle = C.coral;
    ctx.fillText("Preço no link da bio", W / 2, by + 70);
  }
  ctx.textAlign = "center";
  font(ctx, 600, 26);
  ctx.fillStyle = "rgba(43,26,18,.6)";
  ctx.fillText(`Preço do dia ${d.date}. Pode mudar, confira no link.`, W / 2, H - 76);
  ctx.textAlign = "left";
}

function slide5(ctx, d) {
  ctx.fillStyle = C.coral;
  ctx.fillRect(0, 0, W, H);
  pill(ctx, "ONDE COMPRAR", { x: 64, y: 56, bg: C.white, color: C.coral });
  page(ctx, 5);
  fitText(ctx, "Quer o seu?", { x: 64, y: 160, maxWidth: W - 128, size: 118, maxLines: 1, color: C.white });
  photo(ctx, d.img, { x: 330, y: 420, w: 420, h: 420, r: 44, rotate: 3 });
  const by = 900, bh = 330;
  box(ctx, 64, by, W - 128, bh, 44, C.white);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (d.number) {
    font(ctx, 700, 36);
    ctx.fillStyle = C.ink;
    ctx.fillText("Na vitrine da bio, digite", W / 2, by + 40);
    font(ctx, 800, 150);
    ctx.fillStyle = C.coral;
    ctx.fillText(d.number, W / 2, by + 86);
  } else {
    font(ctx, 700, 36);
    ctx.fillStyle = C.ink;
    ctx.fillText("Tá tudo no", W / 2, by + 50);
    font(ctx, 800, 110);
    ctx.fillStyle = C.coral;
    ctx.fillText("link da bio", W / 2, by + 100);
  }
  ctx.textAlign = "left";
  pill(ctx, "toca no link da bio 👆", { x: W / 2, y: by + bh - 92, bg: C.ink, color: C.white, size: 36, h: 66, padX: 32, letter: 0, align: "center" });
  if (d.handle) {
    font(ctx, 700, 30);
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(d.handle, W / 2, H - 44);
    ctx.textAlign = "left";
  }
}

const SLIDES = [slide1, slide2, slide3, slide4, slide5];
export const SLIDE_COUNT = SLIDES.length;

export async function loadFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all([
    document.fonts.load(`800 80px "Plus Jakarta Sans"`),
    document.fonts.load(`700 40px "Plus Jakarta Sans"`),
    document.fonts.load(`600 30px "Plus Jakarta Sans"`),
  ]).catch(() => {});
}

// Carrega a foto pelo proxy do próprio site (evita bloqueio de CORS no canvas)
export function loadImage(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const tryLoad = (src, cross, next) => {
      const img = new Image();
      if (cross) img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = next;
      img.src = src;
    };
    tryLoad(`/api/img?url=${encodeURIComponent(url)}`, false, () => tryLoad(url, true, () => resolve(null)));
  });
}

export function drawSlide(canvas, i, d) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  SLIDES[i](ctx, d);
}

export function buildData(offer, texts, { img, stats = {}, number, handle }) {
  return {
    img,
    loja: offer.platform === "tiktok" ? "TikTok Shop" : "Shopee",
    title: offer.title,
    price: offer.price ? Number(offer.price) : null,
    original: offer.original_price ? Number(offer.original_price) : null,
    off: discountOf(offer.price, offer.original_price),
    sales: stats.sales || 0,
    rating: stats.rating || 0,
    gancho: texts.gancho,
    nome: texts.nome || shortName(offer.title),
    destaques: texts.destaques || [],
    number,
    handle,
    date: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }),
  };
}
