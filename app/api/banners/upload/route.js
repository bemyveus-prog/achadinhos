import { randomBytes } from "crypto";
import { isAdmin, unauthorized } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { BUCKET } from "@/lib/banners";

export const dynamic = "force-dynamic";

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX = 4 * 1024 * 1024; // o painel já reduz a imagem antes de enviar

// Recebe a imagem do banner e guarda na pasta pública "banners" do Supabase
export async function POST(req) {
  if (!(await isAdmin())) return unauthorized();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") return Response.json({ error: "Nenhuma imagem enviada" }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return Response.json({ error: "Use uma imagem JPG, PNG ou WebP" }, { status: 400 });
  if (file.size > MAX) return Response.json({ error: "Imagem grande demais (máximo 4 MB)" }, { status: 413 });

  const path = `${new Date().toISOString().slice(0, 10)}/${randomBytes(6).toString("hex")}.${ext}`;
  const { error } = await db()
    .storage.from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, cacheControl: "31536000", upsert: false });
  if (error) {
    const msg = /bucket/i.test(error.message) ? "A pasta de imagens não existe. Rode o supabase/banners.sql no Supabase." : error.message;
    return Response.json({ error: msg }, { status: 500 });
  }
  const { data } = db().storage.from(BUCKET).getPublicUrl(path);
  return Response.json({ url: data.publicUrl });
}
