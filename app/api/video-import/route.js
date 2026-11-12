import { timingSafeEqual } from "node:crypto";
import { importFromUrl } from "@/lib/importer";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const expected = process.env.VIDEO_STUDIO_TOKEN || "";
  const authorization = req.headers.get("authorization") || "";
  const supplied = authorization.replace(/^Bearer\s+/i, "");

  if (!expected) {
    console.error("[video-import] VIDEO_STUDIO_TOKEN ausente");
    return Response.json(
      { error: "Token do servidor não configurado", code: "SERVER_TOKEN_MISSING" },
      { status: 503 }
    );
  }

  if (!supplied) {
    return Response.json(
      { error: "Token não enviado", code: "CLIENT_TOKEN_MISSING" },
      { status: 401 }
    );
  }

  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);

  if (a.length !== b.length) {
    console.error("[video-import] Tamanho divergente:", {
      serverLength: a.length,
      receivedLength: b.length
    });

    return Response.json(
      {
        error: "As chaves possuem tamanhos diferentes",
        code: "TOKEN_LENGTH_MISMATCH",
        serverLength: a.length,
        receivedLength: b.length
      },
      { status: 401 }
    );
  }

  if (!timingSafeEqual(a, b)) {
    console.error("[video-import] Chaves de mesmo tamanho, mas diferentes");

    return Response.json(
      { error: "As chaves possuem o mesmo tamanho, mas são diferentes", code: "TOKEN_MISMATCH" },
      { status: 401 }
    );
  }

  const { url } = await req.json().catch(() => ({}));

  if (typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
    return Response.json({ error: "Link inválido" }, { status: 400 });
  }

  try {
    const product = await importFromUrl(url.trim());
    return Response.json(product, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Falha ao importar produto" },
      { status: 500 }
    );
  }
}
