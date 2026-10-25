import { hasShopeeApi, parseShopeeIds, shopeeProduct, shopeeShortLink } from "./shopee";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export function detectPlatform(url) {
  const h = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  if (/shopee\.|shp\.ee/.test(h)) return "shopee";
  if (/tiktok\.com/.test(h)) return "tiktok";
  return "outro";
}

// Segue redirecionamentos de links curtos (s.shopee.com.br, vm.tiktok.com...)
async function resolve(url) {
  try {
    const r = await fetch(url, { redirect: "follow", headers: { "User-Agent": UA }, cache: "no-store" });
    const html = r.headers.get("content-type")?.includes("text/html") ? await r.text() : "";
    return { finalUrl: r.url || url, html };
  } catch {
    return { finalUrl: url, html: "" };
  }
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

  const { finalUrl, html } = await resolve(url);

  if (platform === "shopee") {
    const ids = parseShopeeIds(finalUrl) || parseShopeeIds(url);
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
          out.link = p.offerLink || out.link;
          try {
            const short = await shopeeShortLink(p.productLink || finalUrl);
            if (short) out.link = short;
          } catch (e) {
            warnings.push("Link curto não gerado, usando o link de oferta da API.");
          }
        } else warnings.push("Produto não encontrado na API de afiliados (pode não ter comissão).");
      } catch (e) {
        warnings.push(e.message);
      }
    } else if (!hasShopeeApi()) {
      warnings.push("Configure SHOPEE_APP_ID e SHOPEE_APP_SECRET para puxar dados e gerar o link de afiliado automaticamente. Cole aqui o SEU link de afiliado.");
    } else {
      warnings.push("Não achei o ID do produto nesse link. Cole o link da página do produto.");
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
    if (!out.title || !out.image_url) warnings.push("Não consegui ler tudo da página. Complete título/foto manualmente.");
  }

  return { ...out, warnings };
}
