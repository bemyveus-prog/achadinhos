import { cookies } from "next/headers";
import { COOKIE, token } from "@/lib/auth";

// Robôs que abrem o link só para montar a prévia (WhatsApp, Facebook, Telegram, Pinterest, Google...)
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|facebot|whatsapp|telegram|twitterbot|linkedin|pinterest|discord|skype|preview|embedly|quora|vkshare|headless|curl|wget|python|node-fetch|axios|go-http|java\//i;

// Decide se o clique conta: não conta robô, não conta quem está logado no /admin
// e cada pessoa conta 1 vez por item a cada 24 h (cookie). Devolve { count, setCookie }.
export async function clickDecision(req, key) {
  const ua = req.headers.get("user-agent") || "";
  if (!ua || BOT.test(ua)) return { count: false };
  const jar = await cookies();
  if (process.env.ADMIN_PASSWORD && jar.get(COOKIE)?.value === token()) return { count: false };
  const name = `vc_${key}`;
  if (jar.get(name)) return { count: false };
  return { count: true, setCookie: `${name}=1; Max-Age=86400; Path=/; SameSite=Lax; Secure; HttpOnly` };
}
