// AliExpress sem API: a página do produto bloqueia robôs (captcha), então do link só sai o código do produto.
// Nome e detalhes vêm das fotos/vídeo que você manda junto (a IA identifica), ou do texto "link | nome".
export const ALI_RE = /https?:\/\/(?:s\.click\.aliexpress\.com|a\.aliexpress\.com|(?:[a-z]{2,3}\.|www\.|m\.)?aliexpress\.(?:com|us)(?:\.br)?)\/[^\s)>\]]+/i;
export const isAli = (u) => ALI_RE.test(u || "");

export async function aliProduct(rawUrl) {
  const url = rawUrl.trim();
  let id = (url.match(/\/item\/(\d{6,})/) || [])[1] || null;
  let cur = url;
  for (let i = 0; i < 5 && !id; i++) {
    try {
      const r = await fetch(cur, { redirect: "manual", headers: { "User-Agent": "TelegramBot (like TwitterBot)" }, cache: "no-store", signal: AbortSignal.timeout(5000) });
      const loc = r.headers.get("location");
      if (!loc) break;
      cur = new URL(loc, cur).toString();
      id = (cur.match(/\/item\/(\d{6,})/) || [])[1] || null;
    } catch { break; }
  }
  return { title: null, image_url: null, price: null, original_price: null, ali_id: id, link: url };
}
