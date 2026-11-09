import { db, hasDb, isLive } from "@/lib/supabase";

// Feed RSS dos produtos da vitrine, para o Pinterest publicar sozinho ("Publicar automaticamente" via RSS).
// Cada produto novo vira um item com foto, título e link que leva direto ao produto na Shopee (via /r/ID).
export const dynamic = "force-dynamic";
export const revalidate = 0;

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const brl = (v) => "R$ " + Number(v).toFixed(2).replace(".", ",");

// tira o "SEO" dos títulos da Shopee e deixa no tamanho que o Pinterest mostra bem (até 100)
function cleanTitle(t) {
  const s = String(t || "").replace(/\s+/g, " ").replace(/[|•–—].*$/, "").trim();
  return s.length > 95 ? s.slice(0, 95).replace(/\s+\S*$/, "") + "…" : s;
}

export async function GET(req) {
  const origin = (process.env.VITRINE_URL || new URL(req.url).origin).replace(/\/$/, "");
  const name = process.env.NEXT_PUBLIC_SITE_NAME || "Achadinhos";
  let items = [];
  if (hasDb()) {
    const { data } = await db()
      .from("offers")
      .select("id,kind,title,image_url,pin_image,price,category,active,expires_at,created_at")
      .eq("active", true)
      .eq("kind", "produto")
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);
    items = (data || []).filter((o) => isLive(o) && /^https?:\/\//.test(o.image_url));
  }

  const body = items.map((o) => {
    const title = cleanTitle(o.title);
    const img = o.pin_image || o.image_url; // capa vertical do carrossel quando existe
    // direto para a Shopee (passando pelo /r, que conta o clique): o cookie de afiliado já fica no 1º clique
    const link = `${origin}/r/${o.id}`;
    const desc = [
      `${title}${o.price ? ` por ${brl(o.price)}` : ""}.`,
      "Achadinho da Shopee: toque para ver o preço de hoje.",
      o.category ? `Categoria: ${o.category}.` : "",
      "#achadinhos #shopee #achadosdashopee",
    ].filter(Boolean).join(" ");
    return `    <item>
      <title>${esc(title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">oferta-${o.id}</guid>
      <pubDate>${new Date(o.created_at).toUTCString()}</pubDate>
      ${o.category ? `<category>${esc(o.category)}</category>` : ""}
      <description>${esc(desc)}</description>
      <enclosure url="${esc(img)}" type="image/jpeg" length="0"/>
      <media:content url="${esc(img)}" medium="image" type="image/jpeg"/>
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(name)}: achadinhos da Shopee</title>
    <link>${esc(origin)}</link>
    <atom:link href="${esc(origin)}/rss" rel="self" type="application/rss+xml"/>
    <description>Os achadinhos mais recentes da vitrine, com preço e link.</description>
    <language>pt-BR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${body}
  </channel>
</rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=600" } });
}
