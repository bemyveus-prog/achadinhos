// Escolhe o tema e os 5 produtos de um "Top 5" (usado pelo vídeo Top e pelo carrossel Top).
// O título é um GANCHO que bate na dor: começa pela situação chata que a pessoa vive e promete os 5 achados que resolvem.
import { claude } from "./ia.mjs";

const env = (k, d) => (process.env[k] ?? "").trim() || d;

export async function escolherTop(sb, { log = console.log, chave = "top_recentes" } = {}) {
  if (!env("ANTHROPIC_API_KEY")) throw new Error("O Top automático precisa da ANTHROPIC_API_KEY");
  const agora = new Date().toISOString();
  const { data: prods } = await sb.from("offers").select("id,title,price,category").eq("active", true).eq("kind", "produto")
    .not("image_url", "is", null).or(`expires_at.is.null,expires_at.gt.${agora}`).order("id", { ascending: false }).limit(150);
  if ((prods || []).length < 5) throw new Error("Poucos produtos na vitrine para um Top");
  // não repete os produtos dos últimos Tops (vídeo e carrossel dividem a lista)
  const { data: rec } = await sb.from("bot_config").select("value").eq("key", chave).maybeSingle();
  let recentes = new Set(); try { recentes = new Set(JSON.parse(rec?.value || "[]")); } catch {}
  let livres = prods.filter((p) => !recentes.has(p.id));
  if (livres.length < 8) livres = prods;
  const lista = livres.map((p) => `${p.id} | ${String(p.title).slice(0, 90)} | R$ ${Number(p.price || 0).toFixed(2)}${p.category ? ` | ${p.category}` : ""}`).join("\n");
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long" });
  const prompt = `Hoje é ${hoje}. Você é estrategista de conteúdo de um perfil de achadinhos da Shopee e monta posts "Top 5".
Produtos disponíveis (id | nome | preço | categoria):
${lista}

1) Escolha UMA DOR do dia a dia que 5 desses produtos resolvem JUNTOS (mesmo cômodo, mesma situação ou mesmo tipo de pessoa). Ex.: pia sempre bagunçada, cozinha pequena, pouco tempo pra limpar, roupa amassada, maquiagem que derrete, criança entediada, banheiro com cheiro ruim.
2) TÍTULO = gancho que bate nessa dor, para parar a rolagem. Até 60 caracteres. Comece pela situação ou pela dor, de um jeito que a pessoa se reconheça, e prometa os 5 achados. Modelos (adapte, não copie): "Sua pia vive bagunçada? 5 achados que resolvem", "5 achados pra quem odeia lavar louça", "Cozinha pequena? Esses 5 salvam espaço", "Gasta horas limpando? 5 achados que cortam pela metade". Se a data combinar (Natal, Black Friday, volta às aulas), pode usar.
3) Para cada produto:
   - FALA: 1 frase de narração (até 110 caracteres) que liga o produto àquela dor e mostra o ganho na rotina. Cada uma com abertura diferente.
   - CARTAO: o benefício em até 45 caracteres, para escrever no cartão do carrossel (curto, concreto, sem ponto final).
Regras: só o que dá para saber pelo nome (não invente medidas, materiais ou resultados); sem preço exato, nota ou vendas; sem emoji, sem travessão; proibido "para tudo", "olha isso", "cansada de", "aproveita enquanto". Se o título citar preço ("até R$ 30"), todos precisam respeitar.
Responda EXATAMENTE assim, sem nada antes ou depois:
DOR: a dor em poucas palavras
TITULO: o título
123 | fala | cartão
456 | fala | cartão
(5 linhas, ids da lista)`;
  const t = await claude({ model: env("ANTHROPIC_MODEL_TOP", "claude-sonnet-5-5"), content: prompt, max: 1200 });
  const out = {
    dor: ((t.match(/DOR:\s*(.+)/i) || [])[1] || "").trim(),
    title: ((t.match(/TITULO:\s*(.+)/i) || [])[1] || "").trim().replace(/^["']|["']$/g, ""),
    items: [],
  };
  for (const m of t.matchAll(/^\s*#?(\d+)\s*\|\s*([^|\n]+?)\s*(?:\|\s*(.+))?$/gm)) out.items.push({ id: Number(m[1]), fala: m[2].trim().replace(/[—–]/g, ","), cartao: (m[3] || "").trim().replace(/[—–]/g, ",").replace(/\.$/, "") });
  if (!out.title) { log("Resposta da IA:", t.slice(0, 500)); throw new Error("A IA não mandou o título"); }
  const valid = new Set(prods.map((p) => p.id));
  out.items = out.items.filter((i) => valid.has(i.id)).slice(0, 5);
  const price = new Map(prods.map((p) => [p.id, Number(p.price) || 0]));
  const lim = (out.title.match(/(?:até|abaixo de|menos de)\s*R\$\s*([\d.,]+)/i) || [])[1];
  if (lim) {
    const max = Number(lim.replace(/\./g, "").replace(",", "."));
    out.items = out.items.filter((i) => price.get(i.id) <= max);
  }
  if (out.items.length < 3) throw new Error("A IA não escolheu produtos suficientes");
  out.title = out.title.replace(/\b5\b/, String(out.items.length));
  log(`Top: "${out.title}" (dor: ${out.dor || "?"}) com ${out.items.map((i) => "#" + i.id).join(", ")}`);
  const novos = [...out.items.map((i) => i.id), ...recentes].slice(0, 60);
  await sb.from("bot_config").upsert({ key: chave, value: JSON.stringify(novos), updated_at: new Date().toISOString() });
  return out;
}
