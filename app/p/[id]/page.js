import { notFound } from "next/navigation";
import { getOfferPublic, siteUrl, brl } from "@/lib/offer";
import { BRAND } from "@/lib/brand.mjs";

// Página de um produto: é o link que vai nos compartilhamentos (WhatsApp, Facebook, Stories...)
// e mostra a prévia com foto, nome e preço.
export const dynamic = "force-dynamic";

const name = BRAND.name;

export async function generateMetadata({ params }) {
  const { id } = await params;
  const o = await getOfferPublic(id);
  if (!o) return { title: name };
  const title = `${o.title}${o.price ? ` por ${brl(o.price)}` : ""}`;
  const description = `Achadinho #${o.id} na vitrine ${name}. Toque para ver na Shopee.`;
  const image = o.image_url || o.pin_image;
  return {
    title: `${title} | ${name}`,
    description,
    openGraph: { title, description, url: `${siteUrl()}/p/${o.id}`, type: "website", images: image ? [{ url: image }] : [] },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : [] },
  };
}

export default async function Produto({ params }) {
  const { id } = await params;
  const o = await getOfferPublic(id);
  if (!o) notFound();
  const off = o.original_price && o.price && o.original_price > o.price ? Math.round((1 - o.price / o.original_price) * 100) : 0;
  return (
    <main className="wrap pp">
      <a className="pp-back" href={`/?p=${o.id}`}>← Ver mais achados</a>
      <div className="pp-card">
        <div className="pp-img">
          {o.image_url ? <img src={o.image_url} alt={o.title} /> : <div className="thumb-fallback">🛍️</div>}
          <span className="num">#{o.id}</span>
          {off >= 5 && <span className="off">-{off}%</span>}
        </div>
        <h1 className="pp-title">{o.title}</h1>
        <div className="prices pp-prices">
          {off >= 5 && <s>{brl(o.original_price)}</s>}
          {o.price != null && <strong>{brl(o.price)}</strong>}
        </div>
        {o.live ? (
          <a className="cta p-shopee pp-cta" href={`/r/${o.id}`} rel="nofollow sponsored noopener">Ver na Shopee →</a>
        ) : (
          <a className="cta p-outro pp-cta" href="/">Essa oferta acabou · ver outros achados</a>
        )}
        <p className="pp-note">Preço e estoque podem mudar na Shopee.</p>
      </div>
    </main>
  );
}
