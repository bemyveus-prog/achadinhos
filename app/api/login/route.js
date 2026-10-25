import { COOKIE, token } from "@/lib/auth";

export async function POST(req) {
  const { password } = await req.json().catch(() => ({}));
  if (!process.env.ADMIN_PASSWORD) return Response.json({ error: "Defina ADMIN_PASSWORD nas variáveis de ambiente." }, { status: 500 });
  if (password !== process.env.ADMIN_PASSWORD) {
    await new Promise((r) => setTimeout(r, 600)); // freia tentativas
    return Response.json({ error: "Senha incorreta" }, { status: 401 });
  }
  const res = Response.json({ ok: true });
  res.headers.append(
    "Set-Cookie",
    `${COOKIE}=${token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
  return res;
}
