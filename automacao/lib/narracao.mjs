// Narração curta (até ~300 caracteres) a partir dos dados do produto e do texto que veio no grupo.
// Com ANTHROPIC_API_KEY usa o Claude (padrão: Haiku, barato); sem a chave, usa um modelo de texto.
import { brl, salesLabel, shortName } from "./textos.mjs";

const env = (k, d = "") => (process.env[k] ?? "").trim() || d;

function modelo(p) {
  const nome = shortName(p.name, 6);
  const partes = [`Olha esse achadinho: ${nome}.`];
  if (p.rating >= 4.5 && p.sales >= 100) partes.push(`Nota ${String(Number(p.rating).toFixed(1)).replace(".", ",")} e mais de ${salesLabel(p.sales).replace("+", "")} vendidos.`);
  else if (p.rating >= 4.5) partes.push(`Nota ${String(Number(p.rating).toFixed(1)).replace(".", ",")} de quem já comprou.`);
  if (p.price) partes.push(`Tá saindo por ${brl(p.price)}.`);
  return partes.join(" ");
}

export async function gerarNarracao(p, { contexto = "", log = console.log } = {}) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) { log("  narração: modelo de texto (sem ANTHROPIC_API_KEY)"); return modelo(p); }
  const prompt = `Escreva a narração falada de um vídeo curto de achadinho da Shopee (afiliado), em português do Brasil.
Produto: "${p.name}"
${p.price ? `Preço: ${brl(p.price)}` : ""}${p.rating ? ` · Nota ${p.rating}` : ""}${p.sales ? ` · ${p.sales} vendas recentes` : ""}
Texto que veio junto com o vídeo (pode ter a descrição do produto): """${String(contexto).slice(0, 800)}"""

Regras:
- No máximo 280 caracteres, 2 ou 3 frases, tom animado e natural, como uma pessoa falando.
- Comece com um gancho que prenda nos primeiros segundos (problema que o produto resolve ou curiosidade).
- Use SÓ informações do nome do produto e do texto acima. Não invente medidas, materiais, resultados ou promessas de saúde.
- Não fale de link, bio, cupom, seguir ou comentar (o final do vídeo já faz isso). Não use emojis, hashtags nem travessão.
Responda só com o texto da narração.`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: env("ANTHROPIC_MODEL_NARRACAO", "claude-haiku-5-5"), max_tokens: 300, messages: [{ role: "user", content: prompt }] }),
      signal: AbortSignal.timeout(30000),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || r.status);
    let t = (j.content || []).map((c) => c.text || "").join(" ").replace(/\s+/g, " ").replace(/[—–]/g, ",").replace(/^["']|["']$/g, "").trim();
    if (t.length > 310) t = t.slice(0, 300).replace(/[^.!?]*$/, "").trim() || t.slice(0, 300);
    if (!t) throw new Error("resposta vazia");
    log(`  narração (IA): "${t}"`);
    return t;
  } catch (e) {
    log(`  narração: IA falhou (${e.message}); usando modelo de texto`);
    return modelo(p);
  }
}
