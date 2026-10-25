import { isAdmin, unauthorized } from "@/lib/auth";
import { importFromUrl } from "@/lib/importer";

export const dynamic = "force-dynamic";

export async function POST(req) {
  if (!(await isAdmin())) return unauthorized();
  const { url } = await req.json().catch(() => ({}));
  if (!url || !/^https?:\/\//i.test(url.trim())) return Response.json({ error: "Cole um link válido (https://...)" }, { status: 400 });
  try {
    return Response.json(await importFromUrl(url));
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
