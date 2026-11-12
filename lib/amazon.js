// Produto da Amazon a partir do link de associado, sem API.
// A Amazon mostra verificação (captcha) para navegador comum vindo de servidor, mas entrega a página
// para os leitores de prévia de link (Facebook/Telegram), então lemos como eles.
const UAS = ["facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "TelegramBot (like TwitterBot)"];
export const AMAZON_RE = /https?:\/\/(?:www\.)?(?:amazon\.com\.br|amzn\.to|a\.co)\/[^\s)>\]]+/i;
export const isAmazon = (u) => /(?:^|\/\/)(?:www\.)?(?:amazon\.com\.br|amzn\.to|a\.co)\//i.test(u || "");

const dec = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const asinOf = (u) => (String(u).match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i) || [])[1]?.toUpperCase() || null;
const brl = (s) => { const n = Number(String(s || "").replace(/[^\d,]/g, "").replace(",", ".")); return isFinite(n) && n > 0 ? n : null; };

export async function amazonProduct(rawUrl) {
  const url = rawUrl.trim();
  let html = "", finalUrl = url, captcha = false;
  for (const ua of UAS) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": ua, "Accept-Language": "pt-BR,pt;q=0.9", Accept: "text/html" }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(8000) });
      finalUrl = r.url || url;
      const h = await r.text();
      captcha = /validateCaptcha|captcha/i.test(h) && !/id="productTitle"/.test(h);
      if (!captcha && /id="productTitle"/.test(h)) { html = h; break; }
    } catch { /* tenta o próximo */ }
  }
  const asin = asinOf(finalUrl) || asinOf(url) || (html.match(/name="ASIN"[^>]*value="([A-Z0-9]{10})"/) || [])[1] || null;

  // link: mantém o link de associado colado; se não tiver a etiqueta, coloca a sua
  const tag = (String(url).match(/[?&]tag=([^&\s]+)/) || [])[1] || process.env.AMAZON_TAG || "ofertasama02b-20";
  const link = /amzn\.to|a\.co\/|[?&]tag=/.test(url) ? url : asin ? `https://www.amazon.com.br/dp/${asin}?tag=${tag}` : url;

  if (!html) return { asin, link, title: null, image_url: null, price: null, original_price: null, blocked: true };
  const g = (re) => (html.match(re) || [])[1];
  const title = dec(g(/id="productTitle"[^>]*>([\s\S]*?)<\/span>/)).slice(0, 200) || null;
  const image_url = (g(/"hiRes":"(https:[^"]+)"/) || g(/data-old-hires="(https:[^"]+)"/) || g(/"large":"(https:[^"]+)"/) || g(/property="og:image" content="([^"]+)"/) || null);
  // preço do bloco principal (o primeiro a-offscreen da página às vezes é de outro item)
  const core = html.slice(Math.max(0, html.search(/id="corePrice(?:Display_desktop|_feature|_desktop)_div"|id="apex_desktop"/)), undefined).slice(0, 20000) || html;
  const pm = core.match(/class="a-price-whole">([\d.]+)[\s\S]{0,120}?class="a-price-fraction">(\d+)/) || html.match(/class="a-price-whole">([\d.]+)[\s\S]{0,120}?class="a-price-fraction">(\d+)/) || [];
  const [, whole, frac] = pm;
  const price = (whole ? brl(`${whole},${frac || "00"}`) : null) || Number(g(/"priceAmount":([\d.]+)/)) || null;
  const orig = brl((core.match(/class="a-price a-text-price"[^>]*>\s*<span class="a-offscreen">([^<]+)/) || [])[1]);
  return { asin, link, title, image_url, price, original_price: orig && price && orig > price ? orig : null, blocked: false };
}
