import { cookies } from "next/headers";
import { COOKIE, token } from "@/lib/auth";

// Robôs que abrem o link só para montar a prévia (WhatsApp, Facebook, Telegram, Pinterest, Google...)
// + o Threads e o "fediverso": quando o post sai no Threads, dezenas de servidores (Mastodon etc.) abrem o link ao mesmo tempo para montar a prévia
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|facebot|meta-external|whatsapp|telegram|twitterbot|linkedin|pinterest|discord|skype|preview|embedly|quora|vkshare|headless|curl|wget|python|node-fetch|axios|go-http|java\/|mastodon|pleroma|akkoma|misskey|firefish|sharkey|gotosocial|friendica|hubzilla|lemmy|kbin|mbin|pixelfed|peertube|fediverse|activitypub|http\.rb|bluesky|cardyb|iframely|okhttp|undici|deno|bun\/|aiohttp|libwww|scrapy|feedfetcher|validator|monitor|uptime|lighthouse|prerender/i;

// Decide se o clique conta: não conta robô, não conta quem está logado no /admin
// e cada pessoa conta 1 vez por item a cada 24 h (cookie). Devolve { count, setCookie }.
export const isBot = (req) => { const ua = req.headers.get("user-agent") || ""; return !ua || BOT.test(ua); };

export async function clickDecision(req, key) {
  const ua = req.headers.get("user-agent") || "";
  if (!ua || BOT.test(ua)) return { count: false };
  const jar = await cookies();
  if (process.env.ADMIN_PASSWORD && jar.get(COOKIE)?.value === token()) return { count: false };
  const name = `vc_${key}`;
  if (jar.get(name)) return { count: false };
  return { count: true, setCookie: `${name}=1; Max-Age=86400; Path=/; SameSite=Lax; Secure; HttpOnly` };
}
