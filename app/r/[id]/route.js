import { db, hasDb } from "@/lib/supabase";
import { DEMO_OFFERS } from "@/lib/demo";
import { clickDecision, isBot } from "@/lib/clicks";

export const dynamic = "force-dynamic";

// /r/23 -> conta o clique e manda para o link de afiliado
export async function GET(req, { params }) {
  const { id } = await params;
  const home = new URL("/", req.url);
  if (!/^\d+$/.test(id)) return Response.redirect(home, 302);

  if (!hasDb()) {
    const o = DEMO_OFFERS.find((x) => String(x.id) === id);
    return Response.redirect(o?.link || home, 302);
  }

  const { data } = await db().from("offers").select("link,title,image_url").eq("id", id).maybeSingle();
  if (!data?.link) return Response.redirect(home, 302);

  // robôs de prévia (Threads/Mastodon, WhatsApp, Facebook…): recebem só a prévia (título + foto) e NÃO seguem para a Shopee.
  // Assim eles não viram "cliques" falsos no painel de afiliado da Shopee.
  if (isBot(req)) {
    const esc = (t) => String(t || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const t = esc(String(data.title || "Achadinho").slice(0, 90));
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${t}</title><meta property="og:title" content="${t}"><meta property="og:type" content="product">${data.image_url ? `<meta property="og:image" content="${esc(data.image_url)}">` : ""}<meta property="og:url" content="${esc(new URL(req.url).toString())}"><meta name="robots" content="noindex"></head><body><a href="${esc(new URL(req.url).toString())}">${t}</a></body></html>`;
    return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
  }

  // conta o clique só se for gente de verdade, 1 vez por pessoa a cada 24 h (e não conta o admin)
  const d = await clickDecision(req, `o${id}`);
  if (d.count) {
    await Promise.all([
      db().rpc("increment_clicks", { offer_id: Number(id) }).then(() => {}, () => {}),
      db().from("click_events").insert({ offer_id: Number(id), ua: (req.headers.get("user-agent") || "").slice(0, 300), ref: (req.headers.get("referer") || "").slice(0, 200) }).then(() => {}, () => {}),
    ]);
  }
  // Android dentro do Instagram/Facebook/Threads/TikTok: o navegador interno abre a Shopee na versão web, sem login,
  // e a pessoa desiste. Aqui tenta abrir direto o APP da Shopee (link "intent"); se não tiver o app, segue no navegador.
  const ua = req.headers.get("user-agent") || "";
  const appInterno = /android/i.test(ua) && /instagram|fban|fbav|fb_iab|threads|barcelona|tiktok|musical_ly|bytedance|line\//i.test(ua);
  let alvo = null;
  try { alvo = new URL(data.link); } catch {}
  if (appInterno && alvo && /(^|\.)shopee\.com\.br$|(^|\.)shp\.ee$|(^|\.)shope\.ee$/i.test(alvo.hostname)) {
    const intent = `intent://${alvo.host}${alvo.pathname}${alvo.search}#Intent;scheme=https;package=com.shopee.br;S.browser_fallback_url=${encodeURIComponent(data.link)};end`;
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Abrindo a Shopee…</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#fff5f2;color:#1c1917;text-align:center;padding:24px}
.c{max-width:340px}.b{display:block;margin:22px 0 12px;background:#EE4D2D;color:#fff;text-decoration:none;font-weight:800;font-size:18px;padding:16px;border-radius:999px}
a.n{color:#8a817a;font-size:14px}</style></head><body><div class="c"><div style="font-size:42px">🛍️</div><h2 style="margin:8px 0">Abrindo no app da Shopee…</h2>
<p style="color:#57534e">Se não abrir sozinho, toque no botão:</p><a class="b" href="${esc(intent)}">Abrir no app da Shopee</a>
<a class="n" href="${esc(data.link)}">Continuar no navegador</a></div>
<script>location.href=${JSON.stringify(intent)};setTimeout(function(){if(!document.hidden)location.href=${JSON.stringify(data.link)}},2500);</script></body></html>`;
    const h = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" };
    if (d.setCookie) h["Set-Cookie"] = d.setCookie;
    return new Response(html, { status: 200, headers: h });
  }
  const headers = { Location: data.link, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer-when-downgrade" };
  if (d.setCookie) headers["Set-Cookie"] = d.setCookie;
  return new Response(null, { status: 302, headers });
}
