import { ImageResponse } from "next/og";
import { getOfferPublic, siteUrl, brl } from "@/lib/offer";
import { BRAND } from "@/lib/brand.mjs";

// Imagem vertical 1080x1920 para compartilhar no Stories / TikTok / WhatsApp
export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { id } = await params;
  const o = await getOfferPublic(id);
  if (!o) return new Response("not found", { status: 404 });
  const handle = BRAND.handle;
  const host = siteUrl().replace(/^https?:\/\//, "");
  const title = String(o.title || "").slice(0, 90);
  // fonte em negrito servida pelo próprio site
  let fonts;
  try {
    const f = await fetch(new URL("/fonts/Poppins-Bold.ttf", req.url));
    if (f.ok) fonts = [{ name: "Poppins", data: await f.arrayBuffer(), weight: 700, style: "normal" }];
  } catch {}
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center",
        background: "linear-gradient(160deg,#ff6a3d 0%,#ee4d2d 45%,#b8270f 100%)", color: "#fff", fontFamily: fonts ? "Poppins" : "sans-serif", padding: "140px 80px" }}>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 800, background: "#fff", color: "#ee4d2d", padding: "14px 34px", borderRadius: 999 }}>🛍️ ACHADINHO DA SHOPEE</div>
        <div style={{ display: "flex", marginTop: 70, width: 860, height: 860, background: "#fff", borderRadius: 60, overflow: "hidden",
          alignItems: "center", justifyContent: "center", boxShadow: "0 40px 90px rgba(0,0,0,.35)" }}>
          {o.image_url ? <img src={o.image_url} width={860} height={860} style={{ objectFit: "contain" }} /> : <div style={{ fontSize: 200 }}>🛍️</div>}
        </div>
        <div style={{ display: "flex", marginTop: 60, fontSize: 56, fontWeight: 800, textAlign: "center", lineHeight: 1.12, maxWidth: 920 }}>{title}</div>
        {o.price != null && (
          <div style={{ display: "flex", marginTop: 34, fontSize: 92, fontWeight: 900, background: "#FFD54A", color: "#7A1F0A", padding: "8px 40px", borderRadius: 28 }}>{brl(o.price)}</div>
        )}
        <div style={{ display: "flex", marginTop: "auto", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 46, fontWeight: 800 }}>🔎 Procura o #{o.id} no link da bio</div>
          <div style={{ display: "flex", fontSize: 34, marginTop: 14, opacity: 0.92 }}>{host}/p/{o.id}</div>
          <div style={{ display: "flex", fontSize: 34, marginTop: 6, opacity: 0.92 }}>{handle}</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, ...(fonts ? { fonts } : {}), headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
