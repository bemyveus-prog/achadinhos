import { hasShopeeApi, parseShopeeIds, shopeeProduct, shopeeShortLink } from "./shopee";

// A Shopee responde diferente conforme quem acessa: para celular devolve uma página
// que tenta abrir o app (sem redirecionar). Tentamos várias identificações até achar o produto.
const UAS = [
  "curl/8.5.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
];

export function detectPlatform(url) {
  const h = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  if (/shopee\.|shp\.ee/.test(h)) return "shopee";
  if (/tiktok\.com/.test(h)) return "tiktok";
  return "outro";
}

// Segue redirecionamentos um a um (s.shopee.com.br -> ... -> página do produto),
// guardando todos os endereços do caminho, porque o ID pode aparecer só num deles.
async function resolveOnce(url, ua, log) {
  const chain = [url];
  let current = url;
  let html = "";
  try {
    for (let hop = 0; hop < 6; hop++) {
      const r = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": ua, Accept: "text/html,*/*", "Accept-Language": "pt-BR,pt;q=0.9" },
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      const loc = r.headers.get("location");
      log.push(`${r.status} ${short(current)}`);
      if (r.status >= 300 && r.status < 400 && loc) {
        current = new URL(loc, current).toString();
        chain.push(current);
        continue;
      }
      if (r.headers.get("content-type")?.includes("text/html")) html = (await r.text()).slice(0, 400000);
      break;
    }
  } catch (e) {
    log.push(`erro ${short(current)}: ${e.name === "TimeoutError" ? "tempo esgotado" : e.message}`);
  }
  // redirecionamento feito por JavaScript/meta refresh na página intermediária
  const jsRedirect = html.match(/(?:location\.(?:href|replace)\s*\(?\s*=?\s*|url=)["']?(https?:\/\/[^"'\s>)]+)/i);
  if (jsRedirect) chain.push(jsRedirect[1]);
  return { finalUrl: current, chain, html };
}

function short(u) {
  try { const x = new URL(u); return (x.hostname + x.pathname).slice(0, 60); } catch { return String(u).slice(0, 60); }
}

async function resolve(url, wantIds) {
  const log = [];
  let first = null;
  const started = Date.now();
  for (const ua of UAS) {
    if (Date.now() - started > 7000) break; // não estoura o tempo limite da função
    const res = await resolveOnce(url, ua, log);
    first ||= res;
    if (!wantIds) return { ...res, log };
    const ids = res.chain.map(parseShopeeIds).find(Boolean) || parseShopeeIds(res.html);
    if (ids) return { ...res, ids, log };
  }
  return { ...first, log };
}

function meta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re) || html.match(re2);
  return m ? decode(m[1]) : null;
}

function decode(s) {
  return s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function cleanTitle(t) {
  if (!t) return null;
  return t.replace(/\s*\|\s*Shopee Brasil.*$/i, "").replace(/\s*[-|]\s*TikTok.*$/i, "").trim();
}

export async function importFromUrl(rawUrl) {
  const url = rawUrl.trim();
  const platform = detectPlatform(url);
  const warnings = [];
  const out = { platform, link: url, title: null, image_url: null, price: null, original_price: null };

  const { finalUrl, html, ids: foundIds, log } = await resolve(url, platform === "shopee");
  // Link curto de afiliado (s.shopee.com.br/xxx) já é do usuário: mantém ele como destino
  const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  const isAffiliateShort = /^s\.shopee\.|shope\.ee$|shp\.ee$/.test(host);

  if (platform === "shopee") {
    const ids = foundIds;
    if (hasShopeeApi() && ids) {
      try {
        const p = await shopeeProduct(ids);
        if (p) {
          out.title = p.productName;
          out.image_url = p.imageUrl;
          const price = Number(p.priceMin || p.price);
          out.price = isFinite(price) ? price : null;
          const rate = Number(p.priceDiscountRate || 0);
          if (out.price && rate > 0 && rate < 100) out.original_price = Math.round((out.price / (1 - rate / 100)) * 100) / 100;
          out.commission = p.commissionRate ? Math.round(Number(p.commissionRate) * 1000) / 10 : null;
          out.sales = Number(p.sales) || 0;
          out.rating = Number(p.ratingStar) || 0;
          if (isAffiliateShort) {
            out.link = url; // mantém o link de afiliado colado
          } else {
            out.link = p.offerLink || out.link;
            try {
              const short = await shopeeShortLink(p.productLink || finalUrl);
              if (short) out.link = short;
            } catch (e) {
              warnings.push("Link curto não gerado, usando o link de oferta da API.");
            }
          }
        } else warnings.push("Produto não encontrado na API de afiliados (pode não ter comissão).");
      } catch (e) {
        warnings.push(e.message);
      }
    } else if (!hasShopeeApi()) {
      warnings.push("Configure SHOPEE_APP_ID e SHOPEE_APP_SECRET para puxar dados e gerar o link de afiliado automaticamente. Cole aqui o SEU link de afiliado.");
    } else {
      // Sem ID: ainda assim garante um link de afiliado a partir do link colado
      if (!isAffiliateShort) {
        try {
          const short = await shopeeShortLink(finalUrl);
          if (short) out.link = short;
        } catch {}
      }
      warnings.push(`Não achei o ID do produto nesse link. Preencha título/foto/preço à mão (seu link de afiliado fica salvo). [diagnóstico: ${log.join(" → ")}]`);
    }
  }

  // Fallback / TikTok / outros: lê as meta tags da página
  if (!out.title || !out.image_url) {
    if (html) {
      out.title ||= cleanTitle(meta(html, "og:title") || meta(html, "twitter:title"));
      out.image_url ||= meta(html, "og:image") || meta(html, "twitter:image");
      const p = meta(html, "product:price:amount") || meta(html, "og:price:amount");
      if (!out.price && p) out.price = Number(p);
    }
    // A Shopee entrega só a página genérica para quem lê sem a API: descarta título/logo genéricos
    if (platform === "shopee" && /^shopee( brasil)?\b|ofertas incr[ií]veis/i.test(out.title || "")) {
      out.title = null;
      out.image_url = null;
    }
    if (!out.title || !out.image_url) warnings.push("Não consegui ler tudo da página. Complete título/foto manualmente.");
  }

  return { ...out, warnings };
}
