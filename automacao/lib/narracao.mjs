// Narração curta (até ~300 caracteres) a partir dos dados do produto e do texto que veio no grupo.
// Com ANTHROPIC_API_KEY usa o Claude (padrão: Haiku, barato); sem a chave, usa um modelo de texto.
import { brl, salesLabel, shortName } from "./textos.mjs";
import { claude } from "./ia.mjs";

const env = (k, d = "") => (process.env[k] ?? "").trim() || d;

function modelo(p) {
  const nome = shortName(p.name, 6);
  const partes = [`Olha esse achadinho: ${nome}.`];
  if (p.rating >= 4.5 && p.sales >= 100) partes.push(`Nota ${String(Number(p.rating).toFixed(1)).replace(".", ",")} e mais de ${salesLabel(p.sales).replace("+", "")} vendidos.`);
  else if (p.rating >= 4.5) partes.push(`Nota ${String(Number(p.rating).toFixed(1)).replace(".", ",")} de quem já comprou.`);
  if (p.price) partes.push(`Tá saindo por ${brl(p.price)}.`);
  return partes.join(" ");
}

export async function gerarNarracao(p, { contexto = "", max = 280, log = console.log } = {}) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) { log("  narração: modelo de texto (sem ANTHROPIC_API_KEY)"); return modelo(p); }
  const prompt = `Escreva a narração falada de um vídeo curto de achadinho da Shopee (afiliado), em português do Brasil.
Produto: "${p.name}"
${p.price ? `Preço: ${brl(p.price)}` : ""}${p.rating ? ` · Nota ${String(Number(p.rating).toFixed(1)).replace(".", ",")}` : ""}${p.sales ? ` · ${p.sales} vendas recentes` : ""}
Texto que veio junto com o vídeo (pode ter a descrição do produto): """${String(contexto).slice(0, 800)}"""

Regras:
- No máximo ${max} caracteres, ${max <= 160 ? "1 ou 2 frases curtas" : "2 ou 3 frases"}, tom animado e natural, como uma pessoa falando.
- Comece com um gancho que prenda nos primeiros segundos (problema que o produto resolve ou curiosidade).
- Use SÓ informações do nome do produto e do texto acima. Não invente medidas, materiais, benefícios, resultados ou promessas de saúde.
- Números no jeito brasileiro (nota 4,9; R$ 119,99), para a voz ler certo.
- Não fale de link, bio, cupom, seguir ou comentar (o final do vídeo já faz isso). Não use emojis, hashtags nem travessão.
Responda só com o texto da narração.`;
  try {
    const raw = await claude({ model: env("ANTHROPIC_MODEL_NARRACAO", "claude-haiku-5-5"), content: prompt, max: 400 });
    let t = raw.replace(/\s+/g, " ").replace(/[—–]/g, ",").replace(/^["']|["']$/g, "").trim();
    if (t.length > max + 30) t = t.slice(0, max + 20).replace(/[^.!?]*$/, "").trim() || t.slice(0, max + 20);
    if (!t) throw new Error("resposta vazia");
    log(`  narração (IA): "${t}"`);
    return t;
  } catch (e) {
    log(`  narração: IA falhou (${e.message}); usando modelo de texto`);
    return modelo(p);
  }
}
