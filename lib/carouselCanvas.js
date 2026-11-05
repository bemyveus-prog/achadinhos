// Desenha o carrossel (5 slides 1080x1350) num <canvas>.
// Usado no /admin (navegador) e na automação diária (automacao/, via Playwright),
// então os dois saem com o mesmo visual. Sem dependências e sem imports.

export const W = 1080;
export const H = 1350;

const FONT = `"Plus Jakarta Sans", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
const EMOJI = `"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
const WHITE = "#FFFFFF";

// ---------- identidade visual por categoria ----------
// Cada estilo tem 4 tons: A (capa e chamada), L (claro), D (escuro), P (preço).
// deco = textura desenhada por cima do degradê.
export const THEMES = {
  beleza: {
    label: "Beleza e skincare",
    A: { bg: ["#FF9EC4", "#FFC9A8"], on: "#4A1235" },
    L: { bg: ["#FFF1F5", "#FFE6EE"], on: "#4A1235" },
    D: { bg: ["#4A1235", "#7A2456"], on: WHITE, hi: "#FFC2D9" },
    P: { bg: ["#FFD6E5", "#FFE9D6"], on: "#4A1235" },
    accent: "#E5487D", good: "#C79A4B",
    sticker: { bg: WHITE, on: "#E5487D" },
    pill: { bg: "#4A1235", on: WHITE },
    shadow: "rgba(74,18,53,.28)",
    deco: "bokeh",
  },
  casa: {
    label: "Casa, cozinha e organização",
    A: { bg: ["#3E8E6A", "#74B98F"], on: WHITE },
    L: { bg: ["#F6F1E7", "#EDE6D6"], on: "#1E3A2B" },
    D: { bg: ["#1E3A2B", "#2C5240"], on: WHITE, hi: "#F2C46D" },
    P: { bg: ["#F2C46D", "#F7DCA0"], on: "#1E3A2B" },
    accent: "#D9623B", good: "#3E8E6A",
    sticker: { bg: "#F2C46D", on: "#1E3A2B" },
    pill: { bg: "#1E3A2B", on: WHITE },
    shadow: "rgba(30,58,43,.28)",
    deco: "tiles",
  },
  moda: {
    label: "Moda e acessórios",
    A: { bg: ["#8B5CF6", "#EC4899"], on: WHITE },
    L: { bg: ["#F5EFFF", "#FDEFF6"], on: "#2E1A47" },
    D: { bg: ["#1F1235", "#3B1F5E"], on: WHITE, hi: "#F9A8D4" },
    P: { bg: ["#FBCFE8", "#E9D5FF"], on: "#2E1A47" },
    accent: "#DB2777", good: "#7C3AED",
    sticker: { bg: WHITE, on: "#7C3AED" },
    pill: { bg: "#1F1235", on: WHITE },
    shadow: "rgba(46,26,71,.3)",
    deco: "stripes",
  },
  tech: {
    label: "Eletrônicos e celular",
    A: { bg: ["#1D4ED8", "#0EA5E9"], on: WHITE },
    L: { bg: ["#EEF4FF", "#E0ECFF"], on: "#0F172A" },
    D: { bg: ["#0B1120", "#17224A"], on: WHITE, hi: "#38BDF8" },
    P: { bg: ["#0F172A", "#1E293B"], on: WHITE },
    accent: "#2563EB", good: "#10B981",
    sticker: { bg: "#A3E635", on: "#0F172A" },
    pill: { bg: "#0B1120", on: WHITE },
    shadow: "rgba(2,6,23,.45)",
    deco: "grid",
  },
  pet: {
    label: "Pet",
    A: { bg: ["#F59E0B", "#FBBF24"], on: "#3B2410" },
    L: { bg: ["#FFF7E6", "#FFEFD1"], on: "#3B2410" },
    D: { bg: ["#3B2410", "#5C3A1A"], on: WHITE, hi: "#FCD34D" },
    P: { bg: ["#A7F3D0", "#D1FAE5"], on: "#3B2410" },
    accent: "#EA580C", good: "#059669",
    sticker: { bg: WHITE, on: "#EA580C" },
    pill: { bg: "#3B2410", on: WHITE },
    shadow: "rgba(59,36,16,.28)",
    deco: "paws",
  },
  infantil: {
    label: "Bebê e infantil",
    A: { bg: ["#60A5FA", "#A5B4FC"], on: WHITE },
    L: { bg: ["#EFF8FF", "#F3F0FF"], on: "#1E2A5A" },
    D: { bg: ["#1E2A5A", "#2E3F80"], on: WHITE, hi: "#FDE68A" },
    P: { bg: ["#FDE68A", "#FEF3C7"], on: "#1E2A5A" },
    accent: "#F43F5E", good: "#22C55E",
    sticker: { bg: "#FDE68A", on: "#1E2A5A" },
    pill: { bg: "#1E2A5A", on: WHITE },
    shadow: "rgba(30,42,90,.28)",
    deco: "confetti",
  },
  fitness: {
    label: "Fitness e esporte",
    A: { bg: ["#A3E635", "#4ADE80"], on: "#0B1F0E" },
    L: { bg: ["#F4FBEA", "#EAF7D9"], on: "#0B1F0E" },
    D: { bg: ["#0B0F0C", "#18221A"], on: WHITE, hi: "#A3E635" },
    P: { bg: ["#A3E635", "#D9F99D"], on: "#0B1F0E" },
    accent: "#15803D", good: "#16A34A",
    sticker: { bg: "#0B1F0E", on: "#A3E635" },
    pill: { bg: "#0B1F0E", on: "#A3E635" },
    shadow: "rgba(11,31,14,.3)",
    deco: "energy",
  },
  padrao: {
    label: "Padrão (coral)",
    A: { bg: ["#FF5A36", "#FF8A4C"], on: WHITE },
    L: { bg: ["#FFF4E8", "#FFEBD6"], on: "#2B1A12" },
    D: { bg: ["#2B1A12", "#46291C"], on: WHITE, hi: "#FFD23F" },
    P: { bg: ["#FFD23F", "#FFE27A"], on: "#2B1A12" },
    accent: "#FF5A36", good: "#1FB58F",
    sticker: { bg: "#FFD23F", on: "#2B1A12" },
    pill: { bg: "#2B1A12", on: WHITE },
    shadow: "rgba(43,26,18,.25)",
    deco: "blobs",
  },
};

export const THEME_OPTIONS = Object.entries(THEMES).map(([value, t]) => ({ value, label: t.label }));

// Escolhe o estilo pela categoria e pelo nome do produto
const RULES = [
  ["beleza", /skin ?care|maquiagem|batom|base |rimel|m[aá]scara de c[ií]lios|s[eé]rum|hidratante|creme|perfume|cabelo|shampoo|condicionador|esmalte|unha|cosm[eé]tic|beleza|facial|protetor solar|gloss|blush|sobrancelha|depila/i],
  ["infantil", /beb[eê]|infantil|crian[cç]a|maternidade|fralda|chupeta|mamadeira|brinquedo|kids|menino|menina/i],
  ["pet", /\bpet\b|cachorro|\bgat[oa]s?\b|\bc[aã]o\b|\bc[aã]es\b|\bra[cç][aã]o\b|coleira|areia (sanit|higi)|petisco|arranhador/i],
  ["tech", /celular|smartphone|fone|bluetooth|carregador|cabo usb|usb|smartwatch|rel[oó]gio inteligente|caixa de som|eletr[oô]nic|notebook|tablet|gamer|mouse|teclado|c[aâ]mera|power ?bank|tv\b|projetor/i],
  ["fitness", /fitness|academia|treino|halter|muscula|yoga|garrafa t[eé]rmica|squeeze|esport|corrida|bicicleta|whey|el[aá]stico/i],
  ["moda", /vestido|blusa|\bcal[cç]as?\b|\bsaias?\b|camiseta|camisa|moda|bolsa|t[eê]nis|sand[aá]lia|sapato|\bbrincos?\b|\bcolar(es)?\b|\ban[eé]is\b|\banel\b|pulseira|[oó]culos|lingerie|biqu[ií]ni|cropped|jaqueta|acess[oó]rio/i],
  ["casa", /casa|cozinha|organizador|panela|pote|utens[ií]li|banheiro|toalha|len[cç]ol|travesseiro|decora|ferramenta|limpeza|lavanderia|cortina|tapete|lumin[aá]ria|jardim|soprador|parafus/i],
];

export function themeFor(offer = {}) {
  const text = `${offer.category || ""} ${offer.title || ""}`;
  for (const [key, re] of RULES) if (re.test(text)) return key;
  return "padrao";
}

// ---------- textos ----------

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

function isLight(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// número aleatório repetível (o mesmo produto sempre sai com a mesma textura)
function rng(seed) {
  let s = 0;
  for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
function photo(ctx, img, { x, y, w, h, r = 48, rotate = 0, pad = 0, shadow = "rgba(0,0,0,.25)" }) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  box(ctx, -w / 2, -h / 2, w, h, r, WHITE, { color: shadow, blur: 50, y: 24 });
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
  pill(ctx, `${i}/${total}`, { x: W - 64, y: 56, bg: "rgba(255,255,255,.9)", color: "#1C1917", size: 28, padX: 22, h: 56, weight: 700, letter: 0, align: "right" });
}

function emoji(ctx, ch, cx, cy, size) {
  ctx.font = `${size}px ${EMOJI}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ch, cx, cy);
  ctx.textAlign = "left";
}

// ---------- fundos ----------

function star(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill();
}

function glow(ctx, x, y, r, color, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

const DECO = {
  bokeh(ctx, R, c, a) {
    for (let i = 0; i < 8; i++) glow(ctx, R() * W, R() * H, 120 + R() * 220, c, 0.35 * a);
    ctx.fillStyle = rgba(c, 0.75 * a);
    for (let i = 0; i < 12; i++) star(ctx, R() * W, R() * H, 8 + R() * 18);
  },
  tiles(ctx, R, c, a) {
    ctx.strokeStyle = rgba(c, 0.16 * a);
    ctx.lineWidth = 2;
    for (let x = 45; x < W; x += 90) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 45; y < H; y += 90) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    glow(ctx, W * 0.85, H * 0.2, 520, c, 0.3 * a);
    glow(ctx, W * 0.1, H * 0.9, 420, c, 0.22 * a);
  },
  stripes(ctx, R, c, a) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.fillStyle = rgba(c, 0.1 * a);
    for (let x = -1400; x < 1400; x += 84) ctx.fillRect(x, -1400, 22, 2800);
    ctx.restore();
    glow(ctx, W * 0.2, H * 0.15, 480, c, 0.3 * a);
  },
  grid(ctx, R, c, a) {
    ctx.fillStyle = rgba(c, 0.22 * a);
    for (let x = 24; x < W; x += 48) for (let y = 24; y < H; y += 48) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
    glow(ctx, W * 0.9, H * 0.12, 640, "#38BDF8", 0.45 * a);
    glow(ctx, W * 0.05, H * 0.95, 520, "#A78BFA", 0.3 * a);
  },
  paws(ctx, R, c, a) {
    ctx.fillStyle = rgba(c, 0.2 * a);
    for (let i = 0; i < 11; i++) {
      const x = R() * W, y = R() * H, s = 0.6 + R() * 0.8;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((R() - 0.5) * 1.2);
      ctx.scale(s, s);
      ctx.beginPath(); ctx.ellipse(0, 18, 30, 25, 0, 0, Math.PI * 2); ctx.fill();
      for (const [dx, dy] of [[-30, -18], [-11, -36], [11, -36], [30, -18]]) { ctx.beginPath(); ctx.ellipse(dx, dy, 11, 14, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  },
  confetti(ctx, R, c, a) {
    const colors = ["#FFFFFF", "#FDE68A", "#F9A8D4", "#A7F3D0", "#BFDBFE"];
    for (let i = 0; i < 46; i++) {
      ctx.fillStyle = rgba(c === WHITE ? colors[i % colors.length] : c, (c === WHITE ? 0.6 : 0.14) * a);
      ctx.save();
      ctx.translate(R() * W, R() * H);
      ctx.rotate(R() * Math.PI);
      if (i % 2) { ctx.beginPath(); ctx.arc(0, 0, 6 + R() * 8, 0, Math.PI * 2); ctx.fill(); }
      else { rr(ctx, -14, -5, 28, 10, 5); ctx.fill(); }
      ctx.restore();
    }
  },
  energy(ctx, R, c, a) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.35);
    ctx.fillStyle = rgba(c, 0.1 * a);
    for (let i = 0; i < 6; i++) ctx.fillRect(-1300 + R() * 2600, -1400, 50 + R() * 110, 2800);
    ctx.restore();
  },
  blobs(ctx, R, c, a) {
    for (let i = 0; i < 5; i++) glow(ctx, R() * W, R() * H, 180 + R() * 260, c, 0.28 * a);
    ctx.fillStyle = rgba(c, 0.18 * a);
    for (let i = 0; i < 30; i++) { ctx.beginPath(); ctx.arc(R() * W, R() * H, 3 + R() * 4, 0, Math.PI * 2); ctx.fill(); }
  },
};

// degradê + textura do estilo. Em fundo claro a textura usa a cor do texto, bem suave.
function background(ctx, tone, t, seed) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, tone.bg[0]);
  g.addColorStop(1, tone.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const light = isLight(tone.bg[0]);
  const color = light && t.deco !== "bokeh" ? tone.on : WHITE;
  const strength = light ? (t.deco === "bokeh" ? 0.9 : 0.45) : 1;
  ctx.save();
  DECO[t.deco](ctx, rng(seed), color, strength);
  ctx.restore();
}

// ---------- slides ----------

function slide1(ctx, d) {
  const t = d.t, A = t.A;
  background(ctx, A, t, d.seed + 1);
  pill(ctx, `ACHADINHO ${d.loja.toUpperCase()}`, { x: 64, y: 56, bg: t.pill.bg, color: t.pill.on });
  page(ctx, 1);
  fitText(ctx, d.gancho, { x: 64, y: 160, maxWidth: W - 128, size: 104, maxLines: 3, color: A.on });
  photo(ctx, d.img, { x: 110, y: 560, w: W - 220, h: 640, rotate: -2, shadow: t.shadow });
  if (d.off >= 5) {
    ctx.save();
    ctx.translate(W - 56 - 125, 500 + 125);
    ctx.rotate((10 * Math.PI) / 180);
    ctx.shadowColor = t.shadow;
    ctx.shadowOffsetY = 14;
    ctx.beginPath();
    ctx.arc(0, 0, 125, 0, Math.PI * 2);
    ctx.fillStyle = t.sticker.bg;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = t.sticker.on;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    font(ctx, 800, 72);
    ctx.fillText(`-${d.off}%`, 0, -14);
    font(ctx, 800, 30);
    ctx.fillText("hoje", 0, 48);
    ctx.restore();
  }
  pill(ctx, "arrasta pro lado →", { x: W / 2, y: H - 56 - 66, bg: t.pill.bg, color: t.pill.on, size: 32, h: 66, padX: 32, letter: 0, align: "center" });
}

function slide2(ctx, d) {
  const t = d.t, L = t.L;
  background(ctx, L, t, d.seed + 2);
  pill(ctx, "APROVADO", { x: 64, y: 56, bg: t.accent, color: WHITE });
  page(ctx, 2);
  const stats = [];
  if (d.sales) stats.push(["🛒", salesLabel(d.sales), "vendidos"]);
  if (d.rating) stats.push(["⭐", `${Number(d.rating).toFixed(1).replace(".", ",")} de 5`, "nota de quem comprou"]);
  if (d.off >= 5) stats.push(["💸", `${d.off}% OFF`, "no preço de hoje"]);
  if (d.price) stats.push(["🏷️", brl(d.price), "preço de hoje"]);
  const titulo = d.sales ? "Por que todo mundo tá comprando" : "Por que vale a pena";
  fitText(ctx, titulo, { x: 64, y: 160, maxWidth: W - 128, size: 92, maxLines: 2, color: L.on });

  // números primeiro; se faltar, completa com os destaques digitados e, no fim, com o "link na bio"
  const list = [...stats, ...d.destaques.filter(Boolean).map((x) => ["✅", x, ""])];
  if (list.length < 2) list.push(["🔗", "Link na bio", "é só tocar e comprar"]);
  list.splice(3);
  let y = 420;
  for (const [ic, big, small] of list) {
    box(ctx, 64, y, W - 128, 178, 36, WHITE, { color: rgba(L.on, 0.1), y: 10 });
    ctx.beginPath();
    ctx.arc(64 + 40 + 55, y + 89, 55, 0, Math.PI * 2);
    ctx.fillStyle = L.bg[0];
    ctx.fill();
    emoji(ctx, ic, 64 + 40 + 55, y + 92, 58);
    if (small) {
      fitText(ctx, big, { x: 260, y: y + 36, maxWidth: W - 128 - 230, size: 66, minSize: 40, maxLines: 1, color: L.on, weight: 800 });
      font(ctx, 600, 32);
      ctx.fillStyle = rgba(L.on, 0.65);
      ctx.textBaseline = "top";
      ctx.fillText(small, 260, y + 112);
    } else {
      fitText(ctx, big, { x: 260, y: y + 40, maxWidth: W - 128 - 230, size: 44, minSize: 30, maxLines: 2, color: L.on, weight: 700, lineHeight: 1.15 });
    }
    y += 204;
  }
  photo(ctx, d.img, { x: W - 64 - 270, y: H - 48 - 270, w: 270, h: 270, r: 40, rotate: 4, shadow: t.shadow });
}

function slide3(ctx, d) {
  const t = d.t, D = t.D;
  background(ctx, D, t, d.seed + 3);
  pill(ctx, "O QUE É", { x: 64, y: 56, bg: D.hi, color: D.bg[0] });
  page(ctx, 3);
  fitText(ctx, d.nome, { x: 64, y: 160, maxWidth: W - 128, size: 88, maxLines: 2, color: D.hi });
  photo(ctx, d.img, { x: 64, y: 420, w: W - 128, h: 500, r: 48, shadow: "rgba(0,0,0,.4)" });
  const dest = d.destaques.filter(Boolean);
  if (dest.length) {
    let y = 960;
    for (const x of dest.slice(0, 3)) {
      ctx.beginPath();
      ctx.arc(64 + 29, y + 29, 29, 0, Math.PI * 2);
      ctx.fillStyle = t.good;
      ctx.fill();
      font(ctx, 800, 32);
      ctx.fillStyle = WHITE;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("✓", 64 + 29, y + 31);
      ctx.textAlign = "left";
      fitText(ctx, x, { x: 64 + 80, y: y + 6, maxWidth: W - 128 - 80, size: 40, minSize: 30, maxLines: 1, color: D.on, weight: 700 });
      y += 96;
    }
  } else {
    fitText(ctx, d.title, { x: 64, y: 960, maxWidth: W - 128, size: 40, minSize: 32, maxLines: 4, color: rgba(D.on === WHITE ? "#FFFFFF" : D.on, 0.9), weight: 600, lineHeight: 1.3 });
  }
}

function slide4(ctx, d) {
  const t = d.t, P = t.P;
  background(ctx, P, t, d.seed + 4);
  const tag = isLight(P.bg[0]) ? t.pill : { bg: t.accent, on: WHITE }; // em fundo escuro a etiqueta escura sumiria
  pill(ctx, "QUANTO CUSTA", { x: 64, y: 56, bg: tag.bg, color: tag.on });
  page(ctx, 4);
  fitText(ctx, "Olha esse preço", { x: 64, y: 160, maxWidth: W - 128, size: 100, maxLines: 1, color: P.on });
  photo(ctx, d.img, { x: 280, y: 330, w: 520, h: 520, r: 44, rotate: -3, shadow: t.shadow });
  const hasOld = Boolean(d.original && d.off);
  const bh = d.price ? 80 + (hasOld ? 60 : 0) + 150 + (d.off ? 70 : 0) : 220;
  const by = 880;
  box(ctx, 64, by, W - 128, bh, 44, WHITE, { color: t.shadow, y: 12, blur: 20 });
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (d.price) {
    let y = by + 40;
    if (hasOld) {
      font(ctx, 700, 44);
      ctx.fillStyle = "rgba(28,25,23,.5)";
      const txt = `de ${brl(d.original)}`;
      ctx.fillText(txt, W / 2, y);
      const tw = ctx.measureText(txt).width;
      ctx.fillRect(W / 2 - tw / 2, y + 24, tw, 4);
      y += 60;
    }
    font(ctx, 800, 130);
    ctx.fillStyle = t.accent;
    ctx.fillText(brl(d.price), W / 2, y);
    y += 150;
    if (d.off) {
      ctx.textAlign = "left";
      pill(ctx, `${d.off}% de desconto`, { x: W / 2, y, bg: t.good, color: WHITE, size: 34, h: 58, letter: 0, align: "center" });
    }
  } else {
    font(ctx, 800, 72);
    ctx.fillStyle = t.accent;
    ctx.fillText("Preço no link da bio", W / 2, by + 70);
  }
  ctx.textAlign = "center";
  font(ctx, 600, 26);
  ctx.fillStyle = rgba(P.on === WHITE ? "#FFFFFF" : P.on, 0.65);
  ctx.fillText(`Preço do dia ${d.date}. Pode mudar, confira no link.`, W / 2, H - 76);
  ctx.textAlign = "left";
}

function slide5(ctx, d) {
  const t = d.t, A = t.A;
  background(ctx, A, t, d.seed + 5);
  pill(ctx, "ONDE COMPRAR", { x: 64, y: 56, bg: WHITE, color: t.accent });
  page(ctx, 5);
  fitText(ctx, "Quer o seu?", { x: 64, y: 160, maxWidth: W - 128, size: 118, maxLines: 1, color: A.on });
  photo(ctx, d.img, { x: 330, y: 420, w: 420, h: 420, r: 44, rotate: 3, shadow: t.shadow });
  const by = 900, bh = 330;
  box(ctx, 64, by, W - 128, bh, 44, WHITE, { color: t.shadow, y: 12, blur: 20 });
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  if (d.number) {
    font(ctx, 700, 36);
    ctx.fillStyle = "#1C1917";
    ctx.fillText("Na vitrine da bio, digite", W / 2, by + 40);
    font(ctx, 800, 150);
    ctx.fillStyle = t.accent;
    ctx.fillText(d.number, W / 2, by + 86);
  } else {
    font(ctx, 700, 36);
    ctx.fillStyle = "#1C1917";
    ctx.fillText("Tá tudo no", W / 2, by + 50);
    font(ctx, 800, 110);
    ctx.fillStyle = t.accent;
    ctx.fillText("link da bio", W / 2, by + 100);
  }
  ctx.textAlign = "left";
  pill(ctx, "toca no link da bio 👆", { x: W / 2, y: by + bh - 92, bg: t.pill.bg, color: t.pill.on, size: 36, h: 66, padX: 32, letter: 0, align: "center" });
  if (d.handle) {
    font(ctx, 700, 30);
    ctx.fillStyle = rgba(A.on === WHITE ? "#FFFFFF" : A.on, 0.85);
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
    if (url.startsWith("data:")) return tryLoad(url, false, () => resolve(null));
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

export function buildData(offer, texts, { img, stats = {}, number, handle, theme }) {
  const key = theme && THEMES[theme] ? theme : themeFor(offer);
  return {
    img,
    t: THEMES[key],
    seed: `${offer.id || ""}${offer.title || ""}`,
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
