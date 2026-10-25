import { clearCookie } from "@/lib/auth";

export async function POST() {
  const res = Response.json({ ok: true });
  res.headers.append("Set-Cookie", clearCookie());
  return res;
}
