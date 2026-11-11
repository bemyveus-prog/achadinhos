import { db, hasDb, isLive } from "@/lib/supabase";

// Atividade REAL da vitrine (cliques únicos registrados), para o aviso do rodapé.
// Só devolve frases com números verdadeiros e a partir de 2 pessoas.
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDb()) return Response.json({ msgs: [] });
  const { data: rows } = await db().rpc("vitrine_atividade");
  const ids = (rows || []).map((r) => r.offer_id);
  if (!ids.length) return Response.json({ msgs: [] }, { headers: { "Cache-Control": "public, max-age=60" } });
  const { data: offers } = await db().from("offers").select("id,kind,title,active,expires_at").in("id", ids);
  const byId = new Map((offers || []).filter((o) => isLive(o)).map((o) => [o.id, o]));
  const curto = (t) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > 38 ? s.slice(0, 38).replace(/\s+\S*$/, "") + "…" : s; };
  const msgs = [];
  for (const r of rows) {
    const o = byId.get(r.offer_id);
    if (!o) continue;
    const h = Number(r.ultima_hora), d = Number(r.hoje);
    if (o.kind === "cupom") {
      if (h >= 2) msgs.push({ id: o.id, text: `🎟️ ${h} pessoas abriram "${curto(o.title)}" na última hora` });
      else if (d >= 2) msgs.push({ id: o.id, text: `🎟️ ${d} pessoas abriram "${curto(o.title)}" hoje` });
    } else {
      if (h >= 2) msgs.push({ id: o.id, text: `🔥 ${h} pessoas clicaram no #${o.id} na última hora` });
      else if (d >= 2) msgs.push({ id: o.id, text: `🔥 ${d} pessoas clicaram no #${o.id} hoje` });
    }
    if (msgs.length >= 6) break;
  }
  return Response.json({ msgs }, { headers: { "Cache-Control": "public, max-age=60" } });
}
