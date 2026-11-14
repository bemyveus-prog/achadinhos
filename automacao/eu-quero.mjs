#!/usr/bin/env node
// "Comenta EU QUERO que eu te mando o link no direct": a cada execução lê os comentários dos últimos posts do Instagram
// e manda o link do produto por mensagem privada (resposta privada ao comentário, API oficial) + responde o comentário.
// O número do produto vem da legenda do post ("#310"). Precisa de um token com instagram_manage_comments e
// instagram_manage_messages, e "Permitir acesso às mensagens" ligado no app do Instagram.
//   node eu-quero.mjs            responde os comentários novos
//   node eu-quero.mjs --teste    só mostra o que faria
import { createClient } from "@supabase/supabase-js";
import { BRAND } from "../lib/brand.mjs";

const env = (k, d = "") => (process.env[k] ?? "").trim() || d;
const G = `https://graph.facebook.com/${env("META_GRAPH_VERSION", "v24.0")}`;
const T = env("META_PAGE_TOKEN"), IG = env("META_IG_USER_ID"), PAGE = env("META_PAGE_ID");
const teste = process.argv.includes("--teste");
const log = (...a) => console.log(...a);
const PALAVRA = new RegExp(env("EU_QUERO_PALAVRA", "quero|link|eu quero|manda|me manda"), "i");

async function graph(method, p, params = {}) {
  const body = new URLSearchParams({ ...params, access_token: T });
  const r = await fetch(`${G}/${p}${method === "GET" ? `?${body}` : ""}`, { method, body: method === "GET" ? undefined : body, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(j.error.message);
  return j;
}

async function main() {
  if (!T || !IG) { log("Sem META_PAGE_TOKEN/META_IG_USER_ID; nada a fazer."); return; }
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: cfg } = await sb.from("bot_config").select("key,value").in("key", ["eu_quero_respondidos", "eu_quero"]);
  const c = Object.fromEntries((cfg || []).map((r) => [r.key, r.value]));
  let feitos = []; try { feitos = JSON.parse(c.eu_quero_respondidos || "[]"); } catch {}
  const ja = new Set(feitos);
  const { username: eu } = await graph("GET", IG, { fields: "username" });

  const { data: posts = [] } = await graph("GET", `${IG}/media`, { fields: "id,caption,timestamp,comments_count", limit: "25" });
  let enviados = 0, erros = 0;
  for (const post of posts) {
    if (!post.comments_count) continue;
    if (Date.now() - new Date(post.timestamp).getTime() > 30 * 86400000) continue;
    const n = ((post.caption || "").match(/#(\d{1,6})\b/) || [])[1];
    let coms = [];
    try { coms = (await graph("GET", `${post.id}/comments`, { fields: "id,text,username,timestamp", limit: "50" })).data || []; }
    catch (e) { log(`  comentários de ${post.id}: ${e.message}`); erros++; continue; }
    for (const cm of coms) {
      if (ja.has(cm.id) || cm.username === eu || !PALAVRA.test(cm.text || "")) continue;
      if (Date.now() - new Date(cm.timestamp).getTime() > 6.5 * 86400000) { ja.add(cm.id); continue; } // resposta privada só vale até 7 dias
      let link = BRAND.site, nome = "";
      if (n) {
        const { data: off } = await sb.from("offers").select("id,title").eq("id", Number(n)).maybeSingle();
        if (off) { link = `${BRAND.site}/r/${off.id}`; nome = String(off.title || "").split(/\s+/).slice(0, 6).join(" "); }
      }
      const texto = [
        `Oi, ${cm.username}! 💛 Aqui está o link${nome ? ` do ${nome}` : ""}${n ? ` (achadinho #${n})` : ""}:`,
        link,
        "",
        BRAND.canalTelegram ? `🔥 E as ofertas exclusivas saem primeiro no meu grupo VIP do Telegram: ${BRAND.canalTelegram}` : "",
        "Me segue pra ver um achado novo todo dia! ✨",
      ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
      log(`@${cm.username}: "${String(cm.text).slice(0, 60)}" → #${n || "?"} ${link}`);
      if (teste) { ja.add(cm.id); continue; }
      try {
        // resposta privada: a API aceita pela conta do Instagram ou pela Página (depende de como o app foi configurado)
        let ultimoErro = null, ok = false;
        for (const dono of [IG, PAGE].filter(Boolean)) {
          try { await graph("POST", `${dono}/messages`, { recipient: JSON.stringify({ comment_id: cm.id }), message: JSON.stringify({ text: texto }) }); ok = true; break; }
          catch (e) { ultimoErro = e; log(`  via ${dono === IG ? "Instagram" : "Página"}: ${e.message}`); }
        }
        if (!ok) throw ultimoErro;
        enviados++;
        await graph("POST", `${cm.id}/replies`, { message: ["Te mandei no direct! 💛", "Já te enviei o link no direct 📩", "Mandei no seu direct, confere lá! ✨"][enviados % 3] }).catch((e) => log(`  resposta pública: ${e.message}`));
        ja.add(cm.id);
      } catch (e) {
        erros++;
        log(`  não consegui mandar a mensagem: ${e.message}`);
        if (/permission|permiss|access|(#10)|(#200)|(#3)/i.test(e.message)) throw new Error(`Sem permissão para mandar mensagem: ${e.message}`);
      }
    }
  }
  if (!teste) await sb.from("bot_config").upsert({ key: "eu_quero_respondidos", value: JSON.stringify([...ja].slice(-3000)), updated_at: new Date().toISOString() });
  log(`Pronto: ${enviados} mensagem(ns) enviada(s)${erros ? `, ${erros} erro(s)` : ""}.`);
}

main().catch((e) => { console.error("Erro:", e.message); process.exit(1); });
