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

export async function gerarNarracao(p, { contexto = "", max = 280, generico = false, log = console.log } = {}) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) { log("  narração: modelo de texto (sem ANTHROPIC_API_KEY)"); return modelo(p); }
  // um estilo de gancho e um de fechamento sorteados a cada vídeo (sempre a partir da DOR que o produto resolve)
  const gancho = GANCHOS[Math.floor(Math.random() * GANCHOS.length)];
  const fecho = FECHOS[Math.floor(Math.random() * FECHOS.length)];
  const prompt = `Você é um copywriter de vídeos curtos de achadinhos${generico ? "" : " da Shopee"} (afiliado). Escreva a NARRAÇÃO falada de um vídeo de produto, em português do Brasil.
Produto: "${p.name}"
Texto que veio junto com o vídeo (pode ter a descrição do produto): """${String(contexto).slice(0, 800)}"""

Passo 1 (pense, não escreva): qual DOR, incômodo ou desejo do dia a dia esse produto resolve, e para quem.
Passo 2: escreva a narração assim:
- ABERTURA no estilo: ${gancho.nome}. Modelo: "${gancho.modelo}". Adapte ao produto e à dor (não copie o modelo palavra por palavra).
- MEIO: o produto como a solução e o ganho concreto na rotina, de forma visual.
- FECHAMENTO no estilo: ${fecho}.
Regras:
- No máximo ${max} caracteres, ${max <= 160 ? "1 ou 2 frases curtas" : "2 ou 3 frases"}, ritmo rápido, linguagem falada.
- PROIBIDO usar estas expressões gastas: "para tudo", "olha isso", "cansada de", "cansado de", "cansou de", "aproveita enquanto", "garante o seu", "você não vai acreditar", "achadinho incrível", "como vivia sem", "vale cada centavo".
- NÃO fale de nota, avaliações, vendas nem preço exato (aparecem na tela).
- Use SÓ o que dá para saber pelo nome e pelo texto acima. Não invente medidas, materiais, recursos, resultados ou promessas de saúde, nem características como "cabe em qualquer lugar", "fácil de limpar", "não enferruja" se isso não estiver escrito.
- Não diga que você comprou ou usa o produto. Não fale de link, bio, cupom, seguir ou comentar${generico ? ", nem cite nenhuma loja ou plataforma (Amazon, Shopee etc.)" : ""}. Sem emojis, hashtags ou travessão.
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

// ---------- legenda do Shopee Vídeo: no máximo 150 caracteres, com hashtags do produto ----------
const tirarAcento = (t) => String(t).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const PARADAS = new Set("de da do das dos para pra com sem e em um uma kit par pares und unidades unidade cor cores novo nova original premium promocao oferta envio imediato pronta entrega frete gratis tamanho p m g gg x ml l cm mm 1 2 3 4 5 6 10 12 16 20 24 30 48 50 100".split(" "));

export function hashtagsDoNome(name, n = 4) {
  const ws = tirarAcento(name).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !PARADAS.has(w) && !/^\d+$/.test(w));
  const tags = [];
  if (ws[0] && ws[1]) tags.push(ws[0] + ws[1]);
  if (ws[0]) tags.push(ws[0]);
  if (ws[0] && ws[2]) tags.push(ws[0] + ws[2]);
  if (ws[1]) tags.push(ws[1]);
  tags.push("achadosshopee");
  return [...new Set(tags)].slice(0, n).map((t) => "#" + t.slice(0, 30));
}

function cortar150(frase, tags) {
  let ts = [...tags];
  const montar = () => `${frase} ${ts.join(" ")}`.trim();
  while (montar().length > 150 && ts.length > 3) ts.pop();
  let f = frase;
  while (`${f} ${ts.join(" ")}`.length > 150 && f.length > 10) f = f.replace(/\s*\S+$/, "");
  return `${f} ${ts.join(" ")}`.trim().slice(0, 150);
}

export async function gerarLegendaShopee(p, { fala = "", generico = false, log = console.log } = {}) {
  const fallback = () => cortar150("Achado que facilita a rotina 👇", hashtagsDoNome(p.name).filter((t) => !generico || t !== "#achadosshopee"));
  if (!env("ANTHROPIC_API_KEY")) return fallback();
  const prompt = `Crie a legenda de um vídeo curto${generico ? "" : " do Shopee Vídeo"} para este produto: "${p.name}".
Narração do vídeo (para combinar o tom): """${String(fala).slice(0, 300)}"""
Regras:
- TOTAL com as hashtags: no máximo 140 caracteres (conte espaços e #).
- 1 frase curta e chamativa (pode ter 1 emoji) + de 3 a 5 hashtags.
- Hashtags em PORTUGUÊS DO BRASIL = palavras-chave que um cliente digitaria na busca${generico ? "" : " da Shopee Brasil"} para achar ESTE produto (ex.: para um escorredor de louça: #escorredordelouca #escorredorinox #organizacaocozinha). Tudo minúsculo, sem acento, sem espaço. No máximo 1 hashtag genérica.
- Não fale de preço, nota, vendas, link ou bio${generico ? ", nem cite loja ou plataforma (Amazon, Shopee etc.)" : ""}.
Responda só com a legenda pronta.`;
  try {
    const t = (await claude({ model: env("ANTHROPIC_MODEL_NARRACAO", "claude-haiku-5-5"), content: prompt, max: 200 })).replace(/\s+/g, " ").replace(/[—–]/g, ",").trim();
    let tags = (t.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => "#" + tirarAcento(h.slice(1)).toLowerCase());
    const frase = t.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();
    if (generico) tags = tags.filter((h) => !/shopee|amazon/.test(h));
    if (tags.length < 3) tags = [...new Set([...tags, ...hashtagsDoNome(p.name).filter((t) => !generico || t !== "#achadosshopee")])];
    const leg = cortar150(frase, [...new Set(tags)].slice(0, 5));
    log(`  legenda Shopee (${leg.length}): ${leg}`);
    return leg;
  } catch (e) {
    log(`  legenda Shopee: IA falhou (${e.message}); usando modelo`);
    return fallback();
  }
}


// ---------- headline curta para o topo do formato "máscara" ----------
export async function gerarHeadline(p, { fala = "", log = console.log } = {}) {
  if (!env("ANTHROPIC_API_KEY")) return "";
  const prompt = `Escreva a HEADLINE (título no topo de um vídeo curto) para este produto: "${p.name}".
Narração do vídeo: """${String(fala).slice(0, 300)}"""
Regras:
- No máximo 42 caracteres, em português do Brasil, tom de achadinho que desperta curiosidade ou toca numa dor do dia a dia.
- Coloque UMA ou DUAS palavras-chave entre asteriscos para destacar (ex.: "A pia *nunca mais* ficou bagunçada").
- Sem preço, sem nome de loja ou plataforma, sem hashtags, sem aspas, no máximo 1 emoji.
Responda só com a headline.`;
  try {
    const raw = await claude({ model: env("ANTHROPIC_MODEL_NARRACAO", "claude-haiku-5-5"), content: prompt, max: 100 });
    // às vezes vem com opções ou explicação: fica só com a primeira linha que pareça a headline
    const linhas = raw.split(/\n+/).map((l) => l.replace(/^[-*\d.)\s]+(?=\S)/, "").replace(/^\*\*|\*\*$/g, "").replace(/^(headline|título)\s*:\s*/i, "").trim()).filter(Boolean);
    const t = (linhas.find((l) => !/:$/.test(l) && l.replace(/\*/g, "").length >= 10 && l.replace(/\*/g, "").length <= 60) || "").replace(/^["']|["']$/g, "").replace(/[—–]/g, ",").trim();
    const limpo = t.replace(/\*/g, "");
    if (!limpo || limpo.length > 60) throw new Error(`headline fora do tamanho: ${raw.replace(/\s+/g, " ").slice(0, 160)}`);
    log(`  headline: ${t}`);
    return t;
  } catch (e) { log(`  headline: ${e.message}`); return ""; }
}
