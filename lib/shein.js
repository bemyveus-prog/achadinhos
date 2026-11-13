// Produto da Shein a partir do link de afiliado (onelink.shein.com/...), sem API.
// A página do produto da Shein bloqueia robôs (captcha), mas o onelink entrega nome e foto para leitores de prévia.
export const SHEIN_RE = /https?:\/\/(?:onelink\.shein\.com|(?:[a-z]{1,3}\.)?shein\.com(?:\.br)?|shein\.top|api-shein\.shein\.com)\/[^\s)>\]]+/i;
export const isShein = (u) => SHEIN_RE.test(u || "");
const dec = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

export async function sheinProduct(rawUrl) {
  const url = rawUrl.trim();
  for (const ua of ["TelegramBot (like TwitterBot)", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"]) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": ua, "Accept-Language": "pt-BR" }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(8000) });
      const h = await r.text();
      const meta = (p) => dec((h.match(new RegExp(`<meta[^>]+property="${p}"[^>]+content="([^"]+)"`)) || [])[1]);
      const title = meta("og:title") || meta("twitter:title");
      if (!title || /^shein\b/i.test(title)) continue;
      // link de promoção (não de produto): a Shein devolve um título genérico
      const generico = /oferta grande|economize|não perca|nao perca|promo(ção|cao)/i.test(title);
      let image_url = meta("og:image") || meta("twitter:image") || null;
      // a prévia vem em miniatura (405x552); sem o sufixo vem a foto grande
      if (image_url) image_url = image_url.replace(/_thumbnail_\d+x\d+(?=\.\w+$)/, "");
      const goods = (h.match(/"goods_id":"?(\d+)/) || h.match(/-p-(\d+)/) || [])[1] || null;
      return { title: generico ? null : title.slice(0, 200), image_url, goods_id: goods, link: url, price: null, generico };
    } catch { /* tenta o próximo */ }
  }
  return { title: null, image_url: null, goods_id: null, link: url, price: null, blocked: true };
}
