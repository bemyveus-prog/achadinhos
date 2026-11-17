#!/usr/bin/env node
// Cupons e ofertas das lojas da Lomadee → aba "Cupons" do site (com o seu link de afiliado).
// Roda 1x por dia: entra o que é novo, cada um some sozinho quando a campanha acaba (expires_at = fim da campanha).
import { createClient } from "@supabase/supabase-js";
import { hasLomadee, campanhas, marcas } from "../lib/lomadee.mjs";
import { hasTelegram, sendText } from "./lib/telegram.mjs";

const env = (k, d = "") => (process.env[k] ?? "").trim() || d;
const log = (...a) => console.log(...a);

async function main() {
  if (!hasLomadee()) { log("Sem LOMADEE_TOKEN; nada a fazer."); return; }
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const [lista, m] = await Promise.all([campanhas({ paginas: Number(env("LOMADEE_PAGINAS", "25")) }), marcas()]);
  const minCom = Number(env("LOMADEE_MIN_COMISSAO", "2"));
  const boas = lista
    .map((c) => ({ ...c, loja: m.get(c.orgId)?.nome || "Loja", comissao: m.get(c.orgId)?.comissao || 0 }))
    .filter((c) => c.comissao >= minCom && (!c.fim || new Date(c.fim) > new Date()))
    // cupom com código primeiro, depois destaque, depois comissão
    .sort((a, b) => (b.codigo ? 1 : 0) - (a.codigo ? 1 : 0) || Number(b.destaque) - Number(a.destaque) || b.comissao - a.comissao);
  log(`Campanhas ativas com link: ${lista.length} · boas (comissão ≥ ${minCom}%): ${boas.length}`);

  const { data: ja } = await sb.from("offers").select("description,loja").like("description", "lmdc:%").eq("active", true);
  const existentes = new Set((ja || []).map((r) => r.description));
  const max = Number(env("LOMADEE_MAX_NOVOS", "15"));
  const novos = [];
  const porLoja = {};
  for (const r of ja || []) { const l = (r.loja || "").trim(); if (l) porLoja[l] = (porLoja[l] || 0) + 1; }
  for (const c of boas) {
    if (novos.length >= max) break;
    const chave = `lmdc:${c.id}`;
    if (existentes.has(chave)) continue;
    // no máximo 2 por loja, para a aba de cupons não virar vitrine de uma loja só
    porLoja[c.loja] = (porLoja[c.loja] || 0) + 1;
    if (porLoja[c.loja] > 2) continue;
    const titulo = c.nome.replace(/\s+/g, " ").slice(0, 90);
    const { error } = await sb.from("offers").insert({
      kind: "cupom", title: `${c.loja}: ${titulo}`.slice(0, 120), description: chave, link: c.link, platform: "lomadee", loja: c.loja,
      coupon_code: c.codigo || null, active: true, expires_at: c.fim || new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    if (error) { log(`  ${c.loja}: ${error.message}`); continue; }
    novos.push(`${c.codigo ? `🎟️ ${c.codigo}` : "🔥"} ${c.loja} (${String(c.comissao).replace(".", ",")}%): ${titulo.slice(0, 70)}`);
  }
  log(`Novos no site: ${novos.length}`);
  for (const n of novos) log("  " + n);
  if (novos.length && hasTelegram()) await sendText(`🏬 Lomadee: ${novos.length} cupom(ns)/oferta(s) novo(s) na aba Cupons do site\n\n${novos.join("\n")}`.slice(0, 4000)).catch(() => {});
}

main().catch((e) => { console.error("Erro:", e.message); process.exit(1); });
