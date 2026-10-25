import { getSession, unauthorized } from "@/lib/auth";
import { importFromUrl } from "@/lib/importer";
import { ownShopeeCreds } from "@/lib/stores";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const s = await getSession();
  if (!s?.store) return unauthorized();
  const { url } = await req.json().catch(() => ({}));
  if (!url || !/^https?:\/\//i.test(url.trim())) return Response.json({ error: "Cole um link válido (https://...)" }, { status: 400 });
  try {
    return Response.json(await importFromUrl(url, { ownCreds: ownShopeeCreds(s.store) }));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
