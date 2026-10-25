import { createHash } from "crypto";
import { cookies } from "next/headers";

export const COOKIE = "vb_admin";

export function token() {
  const pass = process.env.ADMIN_PASSWORD || "";
  return createHash("sha256").update("vitrine-bio:" + pass).digest("hex");
}

export async function isAdmin() {
  if (!process.env.ADMIN_PASSWORD) return false;
  const jar = await cookies();
  return jar.get(COOKIE)?.value === token();
}

export function unauthorized() {
  return Response.json({ error: "Não autorizado" }, { status: 401 });
}
