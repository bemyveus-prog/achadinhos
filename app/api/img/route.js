import { isAdmin, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

const MAX = 8 * 1024 * 1024;

// Repassa a foto do produto pelo próprio site, para o gerador de carrossel
// conseguir desenhar no <canvas> (fotos de outros sites são bloqueadas por CORS).
export async function GET(req) {
  if (!(await isAdmin())) return unauthorized();
  const url = new URL(req.url).searchParams.get("url") || "";
  let target;
  try { target = new URL(url); } catch { return new Response("URL inválida", { status: 400 }); }
  if (target.protocol !== "https:") return new Response("Só https", { status: 400 });

  try {
    const r = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VitrineBio/1.0)", Accept: "image/*" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.startsWith("image/")) return new Response("Não é uma imagem", { status: 502 });
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX) return new Response("Imagem grande demais", { status: 413 });
    return new Response(buf, {
      headers: { "Content-Type": type, "Cache-Control": "private, max-age=3600" },
    });
  } catch (e) {
    return new Response("Falha ao baixar a foto", { status: 502 });
  }
}
