// Narração curta (até ~300 caracteres) a partir dos dados do produto e do texto que veio no grupo.
// Com ANTHROPIC_API_KEY usa o Claude (padrão: Haiku, barato); sem a chave, usa um modelo de texto.
import { brl, salesLabel, shortName } from "./textos.mjs";
import { claude } from "./ia.mjs";

const env = (k, d = "") => (process.env[k] ?? "").trim() || d;

function modelo(p) {
  const nome = shortName(p.name, 6);
  const ganchos = [`Para tudo e olha esse achadinho: ${nome}!`, `Sabe aquele achado que facilita a vida? ${nome}!`, `Eu não sabia que precisava disso até ver: ${nome}!`];
  const g = ganchos[Math.floor(Date.now() / 3600000) % ganchos.length];
  return `${g} ${p.price ? "Tá com um preço ótimo, aproveita enquanto dura." : "Corre pra ver."}`;
}

export async function gerarNarracao(p, { contexto = "", max = 280, log = console.log } = {}) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) { log("  narração: modelo de texto (sem ANTHROPIC_API_KEY)"); return modelo(p); }
  const prompt = `Você é um copywriter de vídeos curtos de achadinhos da Shopee (afiliado). Escreva a NARRAÇÃO falada de um vídeo de produto, em português do Brasil.
Produto: "${p.name}"${p.price ? `\nPreço: ${brl(p.price)}` : ""}
Texto que veio junto com o vídeo (pode ter a descrição do produto): """${String(contexto).slice(0, 800)}"""

Objetivo: fazer a pessoa querer o produto AGORA.
Estrutura:
1. Gancho forte no primeiro segundo: uma dor, desejo ou situação do dia a dia que a pessoa reconhece ("Cansada de...", "Sabe quando...", "Para tudo!", "Ninguém te contou que...").
2. O produto como a solução, com o benefício que muda a rotina (o que a pessoa ganha), de forma visual e emocional.
3. Fechamento com vontade de comprar já: "aproveita enquanto tá nesse preço", "eu já garanti o meu", "corre", sem prometer estoque acabando.
Regras:
- No máximo ${max} caracteres, ${max <= 160 ? "1 ou 2 frases curtas" : "2 ou 3 frases"}, ritmo rápido, linguagem falada e próxima ("você", "olha isso").
- NÃO fale de nota, avaliações, quantidade de vendas nem do preço exato (aparecem na tela).
- Use SÓ o que dá para saber pelo nome e pelo texto acima. Não invente medidas, materiais, recursos, resultados ou promessas de saúde.
- Não fale de link, bio, cupom, seguir ou comentar (o final do vídeo já faz isso). Sem emojis, hashtags ou travessão.
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
