#!/usr/bin/env node
// Limpeza do Supabase Storage (o plano grátis tem 1 GB):
//   • carrosseis: imagens e vídeos com mais de N dias (o Instagram já guarda a cópia dele)
//   • reels-videos: vídeos enviados pelo bot com mais de N dias
// Nunca apaga: capas de pin de produtos ainda na vitrine, vídeos esperando aprovação,
// banners, capas de categoria e o avatar.
//   node limpeza.mjs [--dias 7] [--simular]
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const DIAS = Number(opt("--dias", process.env.LIMPEZA_DIAS || 7));
const simular = args.includes("--simular");
const log = (...m) => console.log(new Date().toLocaleTimeString("pt-BR"), ...m);
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const mb = (b) => (b / 1e6).toFixed(1) + " MB";

// caminho dentro do bucket a partir da URL pública
const keyOf = (url, bucket) => { const m = String(url || "").match(new RegExp(`/object/public/${bucket}/(.+)$`)); return m ? decodeURIComponent(m[1]) : null; };

async function main() {
  // o que precisa ficar
  const agora = new Date().toISOString();
  const { data: live } = await sb.from("offers").select("pin_image,image_url").eq("active", true).or(`expires_at.is.null,expires_at.gt.${agora}`);
  const keep = new Set((live || []).flatMap((o) => [keyOf(o.pin_image, "carrosseis"), keyOf(o.image_url, "carrosseis")]).filter(Boolean));
  const { data: pend } = await sb.from("reels_pendentes").select("video_url").in("status", ["pendente", "postando", "erro"]);
  for (const r of pend || []) { const k = keyOf(r.video_url, "carrosseis"); if (k) keep.add(k); }
  log(`Protegidos: ${keep.size} arquivos (capas de pin na vitrine e vídeos esperando aprovação)`);

  let total = 0, bytes = 0;
  for (const bucket of ["carrosseis", "reels-videos"]) {
    const { data: old, error } = await sb.rpc("storage_old_objects", { p_bucket: bucket, p_days: DIAS });
    if (error) throw new Error(`${bucket}: ${error.message}`);
    const del = (old || []).filter((o) => !keep.has(o.name));
    const size = del.reduce((a, o) => a + Number(o.size || 0), 0);
    log(`${bucket}: ${del.length} arquivos com mais de ${DIAS} dias (${mb(size)})${simular ? " — simulação" : ""}`);
    if (!simular) {
      for (let i = 0; i < del.length; i += 100) {
        const { error: e } = await sb.storage.from(bucket).remove(del.slice(i, i + 100).map((o) => o.name));
        if (e) log(`  erro ao apagar: ${e.message}`);
      }
    }
    total += del.length; bytes += size;
  }
  // pendentes velhos que ninguém aprovou viram "descartado" (o vídeo some junto)
  if (!simular) {
    const limite = new Date(Date.now() - DIAS * 86400000).toISOString();
    await sb.from("reels_pendentes").update({ status: "descartado" }).eq("status", "pendente").lt("created_at", limite);
  }
  log(`${simular ? "Liberaria" : "Liberado"}: ${total} arquivos, ${mb(bytes)}`);
}
main().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
