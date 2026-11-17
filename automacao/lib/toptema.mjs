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

// ---------- Top 5 com produtos NOVOS buscados na Shopee ----------
// 1) a IA escolhe a dor + o gancho + 5 buscas (5 tipos de produto que resolvem a dor);
// 2) cada busca vai na API de afiliados: pega o melhor (nota, vendas, comissão), gera o SEU link e coloca na vitrine;
// 3) a IA escreve a fala e o cartão de cada produto, já com o nome real.
// Se a API da Shopee falhar, cai no Top com os produtos que já estão na vitrine.
export async function escolherTopShopee(sb, { log = console.log, chave = "top_recentes", subId = "top" } = {}) {
  const { hasShopeeApi, searchOffers, shortLink } = await import("./shopee.mjs");
  const { normalize } = await import("./escolha.mjs");
  if (!hasShopeeApi()) { log("  sem API da Shopee: usando a vitrine"); return escolherTop(sb, { log, chave }); }
  const { data: dd } = await sb.from("bot_config").select("value").eq("key", "top_dores").maybeSingle();
  let dores = []; try { dores = JSON.parse(dd?.value || "[]"); } catch {}
  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long" });
  const p1 = `Hoje é ${hoje}. Você é estrategista de conteúdo de um perfil de achadinhos da Shopee e vai montar um post "Top 5".
1) Escolha UMA dor do dia a dia, bem concreta, que 5 produtos baratos (até uns R$ 80) resolvem juntos: mesmo cômodo, mesma situação ou mesmo tipo de pessoa. Ex.: pia sempre bagunçada, cozinha pequena, banheiro com mofo, roupa amassada, maquiagem que derrete no calor, criança entediada em casa, carro sujo, falta de tomada.
   NÃO repita estas dores recentes: ${dores.slice(0, 15).join("; ") || "nenhuma"}.
2) TÍTULO: gancho que bate nessa dor, até 60 caracteres, começando pela situação em que a pessoa se reconhece e prometendo os 5 achados. Ex.: "Sua pia vive bagunçada? 5 achados que resolvem", "5 achados pra quem odeia lavar louça".
3) 7 BUSCAS para a Shopee Brasil (5 principais + 2 de reserva), uma por linha: 2 a 4 palavras, como um cliente digitaria, cada uma um TIPO de produto DIFERENTE, popular e barato, todos ligados à dor (ex.: "organizador de pia", "escorredor de louça dobrável"). Prefira produtos comuns, que têm muitas opções na Shopee.
Responda EXATAMENTE assim:
DOR: ...
TITULO: ...
BUSCA: ...
BUSCA: ...
BUSCA: ...
BUSCA: ...
BUSCA: ...
BUSCA: ...
BUSCA: ...`;
  const t1 = await claude({ model: env("ANTHROPIC_MODEL_TOP", "claude-sonnet-5-5"), content: p1, max: 500 });
  const dor = ((t1.match(/DOR:\s*(.+)/i) || [])[1] || "").trim();
  let title = ((t1.match(/TITULO:\s*(.+)/i) || [])[1] || "").trim().replace(/^["']|["']$/g, "");
  const buscas = [...t1.matchAll(/BUSCA:\s*(.+)/gi)].map((m) => m[1].trim()).filter(Boolean).slice(0, 8);
  if (!title || buscas.length < 3) { log("Resposta da IA:", t1.slice(0, 400)); return escolherTop(sb, { log, chave }); }
  log(`Tema: "${title}" (dor: ${dor}) · buscas: ${buscas.join(" | ")}`);

  // melhor produto de cada busca
  const nota = (x) => x.rating * Math.log10(x.sales + 10) * (0.5 + Math.min(x.commission, 0.25) * 4) * (x.price <= 50 ? 1.25 : x.price <= 80 ? 1.1 : 1);
  const usados = new Set();
  const achados = [];
  for (const kw of buscas) {
    const vistos = new Map();
    for (const sortType of [2, 5, 1]) {
      try {
        const { nodes = [] } = await searchOffers({ keyword: kw, sortType, page: 1, limit: 40 });
        for (const n of nodes) { const x = normalize(n); if (!vistos.has(x.itemId)) vistos.set(x.itemId, x); }
      } catch (e) { log(`  busca "${kw}": ${e.message}`); }
    }
    const bons = [...vistos.values()]
      .filter((x) => x.imageUrl && x.price > 0 && x.price <= Number(env("TOP_PRECO_MAX", "100")) && x.rating >= 4.5 && x.sales >= 100 && x.commission >= 0.01 && !usados.has(x.itemId))
      // nota e vendas pesam mais que comissão; produto barato (impulso) ganha um bônus
      .sort((a, b) => nota(b) - nota(a));
    const x = bons[0];
    if (!x) { log(`  "${kw}": nada bom`); continue; }
    usados.add(x.itemId);
    achados.push({ ...x, busca: kw });
    log(`  "${kw}" → ${x.name.slice(0, 60)} · R$ ${x.price} · ${(x.commission * 100).toFixed(1)}% · ${x.sales} vendas`);
    if (achados.length >= 5) break;
  }
  if (achados.length < 3) { log("  poucos produtos na Shopee para esse tema: usando a vitrine"); return escolherTop(sb, { log, chave }); }

  // na vitrine (com o SEU link); se o produto já estiver lá, reaproveita
  const dias = Number(env("DIAS_NA_VITRINE", "15"));
  for (const a of achados) {
    const { data: ja } = await sb.from("offers").select("id").eq("active", true).or(`description.eq.top:${a.itemId},description.like.%:${a.itemId}`).limit(1);
    if (ja?.length) { a.id = ja[0].id; continue; }
    let link = a.offerLink;
    try { link = (await shortLink(a.productLink, subId)) || link; } catch (e) { log(`  link curto: ${e.message}`); }
    const { data, error } = await sb.from("offers").insert({
      kind: "produto", title: a.name.slice(0, 120), description: `top:${a.itemId}`, image_url: a.imageUrl,
      price: a.price, original_price: a.originalPrice, link, platform: "shopee", active: true,
      expires_at: dias > 0 ? new Date(Date.now() + dias * 86400000).toISOString() : null,
    }).select("id").single();
    if (error) { log(`  vitrine: ${error.message}`); continue; }
    a.id = data.id;
  }
  const comId = achados.filter((a) => a.id);
  if (comId.length < 3) return escolherTop(sb, { log, chave });

  // falas e cartões com os nomes reais
  const p2 = `Post "Top ${comId.length}" com o título "${title}" (dor: ${dor}).
Produtos (id | nome):
${comId.map((a) => `${a.id} | ${a.name.slice(0, 100)}`).join("\n")}
Para cada produto escreva:
- FALA: 1 frase de narração (até 110 caracteres) que liga o produto à dor e mostra o ganho na rotina; cada uma com abertura diferente.
- CARTAO: o benefício em até 45 caracteres (curto, concreto, sem ponto final).
Só o que dá para saber pelo nome; sem preço, nota ou vendas; sem emoji e sem travessão; proibido "para tudo", "olha isso", "cansada de", "aproveita enquanto".
Responda só com as linhas no formato: id | fala | cartão`;
  const t2 = await claude({ model: env("ANTHROPIC_MODEL_TOP", "claude-sonnet-5-5"), content: p2, max: 900 });
  const textos = new Map();
  for (const m of t2.matchAll(/^\s*#?(\d+)\s*\|\s*([^|\n]+?)\s*(?:\|\s*(.+))?$/gm)) textos.set(Number(m[1]), { fala: m[2].trim().replace(/[—–]/g, ","), cartao: (m[3] || "").trim().replace(/[—–]/g, ",").replace(/\.$/, "") });
  const items = comId.map((a) => ({ id: a.id, fala: textos.get(a.id)?.fala || "", cartao: textos.get(a.id)?.cartao || "" }));
  title = title.replace(/\b5\b/, String(items.length));

  // lembra a dor (para variar) e os produtos usados
  const agora = new Date().toISOString();
  const { data: rec } = await sb.from("bot_config").select("value").eq("key", chave).maybeSingle();
  let recentes = []; try { recentes = JSON.parse(rec?.value || "[]"); } catch {}
  await sb.from("bot_config").upsert([
    { key: "top_dores", value: JSON.stringify([dor, ...dores].filter(Boolean).slice(0, 30)), updated_at: agora },
    { key: chave, value: JSON.stringify([...items.map((i) => i.id), ...recentes].slice(0, 60)), updated_at: agora },
  ]);
  log(`Top: "${title}" com ${items.map((i) => "#" + i.id).join(", ")} (novos na vitrine)`);
  return { dor, title, items };
}
