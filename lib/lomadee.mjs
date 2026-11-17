// Lomadee (rede de afiliados: Casas Bahia, Mondial, Brinox, Drogaria Rosário... ~130 lojas)
// API: https://api.lomadee.com.br/affiliate  ·  chave no header x-api-key (variável LOMADEE_TOKEN)
// Os links saem pelo canal do site ("Minhas Ofertas"; troque com LOMADEE_CANAL) e com mdasc = de onde veio o clique.
const BASE = "https://api.lomadee.com.br/affiliate";
const env = (k, d = "") => (process.env[k] ?? "").trim() || d;

export const hasLomadee = () => Boolean(env("LOMADEE_TOKEN"));

async function lmd(path, { method = "GET", body } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { "x-api-key": env("LOMADEE_TOKEN"), Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Lomadee ${r.status}: ${j.message || "erro"}`);
  return j;
}

// lojas em que você é afiliado: id da organização → nome, comissão, site
let _marcas = null;
export async function marcas() {
  if (_marcas) return _marcas;
  const out = new Map();
  for (let pg = 1; pg <= 12; pg++) {
    const j = await lmd(`/brands?limit=20&page=${pg}`);
    for (const b of j.data || []) {
      out.set(b.id, { id: b.id, nome: String(b.name || "").trim(), site: b.site, segmento: b.segment, comissao: Number(b.commission?.value) || 0, tipo: b.commission?.transfer || "", ativa: b.network?.active !== false });
    }
    if (!j.data?.length || pg >= (j.meta?.totalPages || 1)) break;
  }
  _marcas = out;
  return out;
}

// escolhe o link do canal do site entre os canais que a Lomadee devolve
function linkDoCanal(canais) {
  const alvo = new RegExp(env("LOMADEE_CANAL", "minhas ofertas"), "i");
  const lista = (Array.isArray(canais) ? canais : []).filter((c) => c.shortUrls?.length);
  const c = lista.find((x) => alvo.test(x.name || "")) || lista.find((x) => /blog/i.test(x.availableChannel?.name || "")) || lista[0];
  return c?.shortUrls?.[0] || null;
}

// busca produtos; preço em reais (a API usa centavos no filtro)
export async function buscarProdutos(termo, { limit = 20, precoMax = 0, precoMin = 0 } = {}) {
  const q = new URLSearchParams({ search: termo, limit: String(Math.min(100, limit)), isAvailable: "true" });
  if (precoMax) q.set("price", `${Math.round(precoMin * 100)}:${Math.round(precoMax * 100)}`);
  const [j, m] = await Promise.all([lmd(`/products?${q}`), marcas().catch(() => new Map())]);
  return (j.data || [])
    .filter((p) => !(p.feature?.tags || []).includes("demo-seed") && p.url)
    .map((p) => {
      const op = p.options?.[0] || {};
      const pr = op.pricing?.[0] || {};
      const loja = m.get(p.organizationId);
      return {
        id: String(p.id), orgId: p.organizationId, loja: loja?.nome || op.seller || "Loja", comissao: loja?.comissao || 0,
        nome: String(p.name || "").trim(), url: p.url, imagem: p.images?.[0]?.url || op.images?.[0]?.url || null,
        preco: Number(pr.price) || Number(p.price) || 0, precoDe: Number(pr.listPrice) || null,
      };
    })
    .filter((p) => p.preco > 0 && p.imagem);
}

// link de afiliado de um produto (ou de qualquer página da loja)
export async function linkProduto(orgId, url, mdasc = "site") {
  const j = await lmd("/shortener/url", { method: "POST", body: { organizationId: orgId, type: "Custom", url, ...(mdasc ? { mdasc } : {}) } });
  const link = linkDoCanal(Array.isArray(j) ? j : j.data);
  if (!link) throw new Error("a loja não liberou link para o canal do site");
  return link;
}

// campanhas ativas: cupons (com código) e ofertas de loja (Black Week, coleções...) já com o link do canal
export async function campanhas({ paginas = 25 } = {}) {
  const out = [];
  let falhas = 0;
  for (let pg = 1; pg <= paginas; pg++) {
    let j;
    try { j = await lmd(`/campaigns?limit=20&page=${pg}`); }
    catch (e) {
      // a API às vezes devolve 500 numa página: tenta de novo uma vez e segue
      await new Promise((r) => setTimeout(r, 1500));
      try { j = await lmd(`/campaigns?limit=20&page=${pg}`); } catch { if (++falhas >= 3) break; continue; }
    }
    for (const c of j.data || []) {
      if (c.status !== "onTime") continue;
      const tipo = c.type === "GenericCoupon" || c.type === "Coupon" ? "cupom" : c.type === "Offer" && c.offerType === "Url" ? "oferta" : null;
      if (!tipo) continue;
      const link = linkDoCanal(c.channels);
      if (!link) continue;
      out.push({ id: c.id, tipo, nome: String(c.name || "").trim(), codigo: c.code || null, orgId: c.organizationId, fim: c.period?.endAt || null, destaque: Boolean(c.isHighlight), link });
    }
    if (!j.data?.length || pg >= (j.meta?.totalPages || 1)) break;
  }
  return out;
}

// pedidos (para o relatório)
export async function pedidos({ de, ate, limit = 100 } = {}) {
  const q = new URLSearchParams({ limit: String(limit), page: "1" });
  if (de && ate) { q.set("from", de); q.set("to", ate); }
  const j = await lmd(`/orders?${q}`);
  return j.data || [];
}
