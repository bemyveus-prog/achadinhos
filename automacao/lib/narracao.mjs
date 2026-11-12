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

// Banco de ganchos (sempre partindo da dor/desejo que o produto resolve)
export const GANCHOS = [
  { nome: "pergunta de dor", modelo: "Você também sofre com [a dor] todo santo dia?" },
  { nome: "situação do dia a dia", modelo: "Sabe quando [situação chata que a pessoa vive]?" },
  { nome: "erro comum", modelo: "Para de [hábito ruim que causa a dor], existe um jeito bem mais fácil." },
  { nome: "segredo", modelo: "O truque que ninguém te conta pra [resultado desejado]." },
  { nome: "imagine", modelo: "Imagina [a rotina sem a dor / o resultado desejado] sem esforço nenhum." },
  { nome: "público-alvo", modelo: "Se você [perfil de quem tem a dor], precisa ver isso." },
  { nome: "promessa direta", modelo: "Isso aqui acaba com [a dor] em segundos." },
  { nome: "curiosidade", modelo: "Por que ninguém fala desse achado pra [uso/dor]?" },
  { nome: "antes e depois", modelo: "Antes: [cena da dor]. Depois: [cena resolvida]." },
  { nome: "desafio", modelo: "Duvido você ver isso e não querer um pra [lugar/uso]." },
  { nome: "presente", modelo: "Achei o presente perfeito pra quem [perfil/dor]." },
  { nome: "comparação de custo", modelo: "Pra que gastar com [solução cara] se existe isso?" },
  { nome: "lista rápida", modelo: "Três motivos pra você querer isso na sua [casa/rotina]." },
  { nome: "exagero leve", modelo: "Sua [cozinha/rotina/casa] nunca mais vai ser a mesma." },
];
const FECHOS = [
  "convite curto para conferir o preço de hoje, sem mencionar valor",
  "frase de efeito curta e original sobre como a rotina fica melhor (crie uma frase nova, não use clichês)",
  "urgência leve e honesta sobre o preço poder mudar, sem prometer estoque acabando",
  "chamada para mandar para alguém que precisa disso",
  "frase direta de recomendação, curta e confiante",
];

export async function gerarNarracao(p, { contexto = "", max = 280, log = console.log } = {}) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) { log("  narração: modelo de texto (sem ANTHROPIC_API_KEY)"); return modelo(p); }
  // um estilo de gancho e um de fechamento sorteados a cada vídeo (sempre a partir da DOR que o produto resolve)
  const gancho = GANCHOS[Math.floor(Math.random() * GANCHOS.length)];
  const fecho = FECHOS[Math.floor(Math.random() * FECHOS.length)];
  const prompt = `Você é um copywriter de vídeos curtos de achadinhos da Shopee (afiliado). Escreva a NARRAÇÃO falada de um vídeo de produto, em português do Brasil.
Produto: "${p.name}"
Texto que veio junto com o vídeo (pode ter a descrição do produto): """${String(contexto).slice(0, 800)}"""

Passo 1 (pense, não escreva): qual DOR, incômodo ou desejo do dia a dia esse produto resolve, e para quem.
Passo 2: escreva a narração assim:
- ABERTURA no estilo: ${gancho.nome}. Modelo: "${gancho.modelo}". Adapte ao produto e à dor (não copie o modelo palavra por palavra).
- MEIO: o produto como a solução e o ganho concreto na rotina, de forma visual.
- FECHAMENTO no estilo: ${fecho}.
Regras:
- No máximo ${max} caracteres, ${max <= 160 ? "1 ou 2 frases curtas" : "2 ou 3 frases"}, ritmo rápido, linguagem falada.
- PROIBIDO usar estas expressões gastas: "para tudo", "olha isso", "cansada de", "cansado de", "aproveita enquanto", "garante o seu", "você não vai acreditar", "achadinho incrível", "como vivia sem", "vale cada centavo".
- NÃO fale de nota, avaliações, vendas nem preço exato (aparecem na tela).
- Use SÓ o que dá para saber pelo nome e pelo texto acima. Não invente medidas, materiais, recursos, resultados ou promessas de saúde, nem características como "cabe em qualquer lugar", "fácil de limpar", "não enferruja" se isso não estiver escrito.
- Não diga que você comprou ou usa o produto. Não fale de link, bio, cupom, seguir ou comentar. Sem emojis, hashtags ou travessão.
Responda só com o texto da narração.`;
  try {
    const raw = await claude({ model: env("ANTHROPIC_MODEL_NARRACAO", "claude-haiku-5-5"), content: prompt, max: 400 });
    let t = raw.replace(/\s+/g, " ").replace(/[—–]/g, ",").replace(/^["']|["']$/g, "").trim();
    if (t.length > max + 30) t = t.slice(0, max + 20).replace(/[^.!?]*$/, "").trim() || t.slice(0, max + 20);
    if (!t) throw new Error("resposta vazia");
    log(`  narração (IA, gancho "${gancho.nome}"): "${t}"`);
    return t;
  } catch (e) {
    log(`  narração: IA falhou (${e.message}); usando modelo de texto`);
    return modelo(p);
  }
}
