import { claude } from "./ia.mjs";
// Textos do carrossel. Os números (preço, vendas, nota, desconto) vêm sempre da API.
// A IA (opcional) só escreve gancho, nome curto e destaques, a partir do nome do produto.

export const brl = (v) => "R$ " + Number(v).toFixed(2).replace(".", ",");

export function salesLabel(n) {
  if (n >= 1_000_000) return `${Math.floor(n / 1_000_000)} milhão+`;
  if (n >= 10_000) return `${Math.floor(n / 1000)} mil+`;
  if (n >= 1000) return `${(Math.floor(n / 100) / 10).toString().replace(".", ",")} mil+`;
  return String(n);
}

// Nome curto sem o "SEO" que os vendedores colocam no título
export function shortName(name, maxWords = 6) {
  const clean = name
    .replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g, " ")
    .replace(/\b(envio imediato|pronta entrega|promo[cç][aã]o|oferta|original|lan[cç]amento|frete gr[aá]tis)\b/gi, " ")
    .replace(/[|/+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let words = clean.split(" ").slice(0, maxWords);
  // não termina no meio de uma expressão ("2 em", "Kit de", "com")
  const loose = /^(de|da|do|das|dos|em|e|com|para|pra|p|a|o|as|os|no|na|ao|à|\d+|x|kit|\+|-)$/i;
  if (/^\d+$/.test(words.at(-1) || "") && /^em$/i.test(clean.split(" ")[words.length] || "")) words = words.slice(0, -1); // "2" de "2 em 1"
  while (words.length > 2 && loose.test(words.at(-1))) words.pop();
  return words.join(" ");
}

export function templateTexts(p) {
  const nome = shortName(p.name);
  return {
    nome,
    gancho: p.discount >= 30 ? `${Math.round(p.discount)}% OFF nesse achadinho da Shopee` : "Achei isso na Shopee e precisava te mostrar",
    destaques: [],
    legenda: [
      `${nome} 🛒`,
      "",
      p.rating && p.sales ? `⭐ Nota ${Number(p.rating).toFixed(1).replace(".", ",")} e ${salesLabel(p.sales)} vendidos` : "",
      p.originalPrice ? `💸 De ${brl(p.originalPrice)} por ${brl(p.price)}` : `💸 Por ${brl(p.price)}`,
      "",
      "👉 Link na bio! Digite o número do produto na busca.",
      "",
      "#achadinhos #achadinhosshopee #shopee #achadosdashopee #comprinhas",
    ].join("\n"),
  };
}

const AI_PROMPT = (p) => `Você escreve carrosséis de Instagram para um perfil de achadinhos da Shopee (afiliado).
Produto (título do anúncio): "${p.name}"
Preço: ${brl(p.price)}${p.originalPrice ? ` (antes ${brl(p.originalPrice)})` : ""}.${p.rating ? ` Nota ${p.rating}.` : ""}${p.sales ? ` ${p.sales} vendidos.` : ""}

Regras:
- Use SOMENTE o que dá para afirmar a partir do título do anúncio. Não invente medidas, materiais, resultados ou números.
- Nada de promessa de saúde, cura, emagrecimento ou resultado garantido.
- Português do Brasil, tom animado e direto. Sem travessão.

Responda só com JSON neste formato:
{"nome": "nome curto do produto, até 5 palavras",
 "gancho": "frase de capa, até 9 palavras, curiosa",
 "destaques": ["3 destaques curtos, até 6 palavras cada, tirados do título"],
 "para_quem": "para quem é, até 10 palavras",
 "legenda": "legenda do post com 3 a 5 linhas, emojis, terminando com 'Link na bio! Digite o número do produto na busca.' e 5 hashtags"}`;

export async function aiTexts(p, log = console.log) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const text = await claude({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", content: AI_PROMPT(p), max: 1200 });
    const out = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const strip = (s) => String(s || "").replace(/[—–]/g, ",").trim();
    return {
      nome: strip(out.nome),
      gancho: strip(out.gancho),
      destaques: (out.destaques || []).map(strip).filter(Boolean).slice(0, 3),
      paraQuem: strip(out.para_quem),
      legenda: strip(out.legenda),
    };
  } catch (e) {
    log(`IA indisponível (${e.message}), usando textos padrão.`);
    return null;
  }
}

export async function buildTexts(p, log) {
  const base = templateTexts(p);
  const ai = await aiTexts(p, log);
  if (!ai) return base;
  return {
    nome: ai.nome || base.nome,
    gancho: ai.gancho || base.gancho,
    destaques: ai.destaques,
    paraQuem: ai.paraQuem,
    legenda: ai.legenda || base.legenda,
  };
}
