#!/usr/bin/env node
// "Comenta EU QUERO que eu te mando o link no direct", em 2 passos (o Instagram não entrega link na 1ª mensagem
// para quem ainda não conversou com você):
//   1) quem comenta recebe uma resposta privada curta, sem link, com o botão "Quero o link 🔗" (+ resposta no comentário);
//   2) quando a pessoa toca no botão (ou responde qualquer coisa), a conversa abre e o bot manda o link do produto.
// O número do produto vem da legenda do post ("#310"). Token com instagram_manage_comments e instagram_manage_messages,
// e "Permitir acesso às mensagens" ligado no app do Instagram.
//   node eu-quero.mjs            responde
//   node eu-quero.mjs --teste    só mostra o que faria
import { createClient } from "@supabase/supabase-js";
import { BRAND } from "../lib/brand.mjs";

const env = (k, d = "") => (process.env[k] ?? "").trim() || d;
const G = `https://graph.facebook.com/${env("META_GRAPH_VERSION", "v24.0")}`;
const T = env("META_PAGE_TOKEN"), IG = env("META_IG_USER_ID"), PAGE = env("META_PAGE_ID");
const teste = process.argv.includes("--teste");
const log = (...a) => console.log(...a);
const PALAVRA = new RegExp(env("EU_QUERO_PALAVRA", "quero|link|manda"), "i");

async function graph(method, p, params = {}, json = null) {
  const qs = new URLSearchParams({ ...(method === "GET" ? params : {}), access_token: T });
  const r = await fetch(`${G}/${p}?${qs}`, {
    method,
    headers: json ? { "Content-Type": "application/json" } : undefined,
    body: method === "GET" ? undefined : json ? JSON.stringify(json) : new URLSearchParams(params),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw new Error(`${j.error.message}${j.error.error_subcode ? ` [${j.error.error_subcode}]` : ""}`);
  return j;
}
const enviar = (recipient, message) => graph("POST", `${PAGE || IG}/messages`, {}, { recipient, message, messaging_type: "RESPONSE" });

async function main() {
  if (!T || !IG) { log("Sem META_PAGE_TOKEN/META_IG_USER_ID; nada a fazer."); return; }
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const { data: cfg } = await sb.from("bot_config").select("key,value").in("key", ["eu_quero_respondidos", "eu_quero_pendentes"]);
  const c = Object.fromEntries((cfg || []).map((r) => [r.key, r.value]));
  let feitos = []; try { feitos = JSON.parse(c.eu_quero_respondidos || "[]"); } catch {}
  let pend = {}; try { pend = JSON.parse(c.eu_quero_pendentes || "{}"); } catch {}
  const ja = new Set(feitos);
  const { username: eu } = await graph("GET", IG, { fields: "username" });
  let n1 = 0, n2 = 0;

  // ---------- passo 1: comentários novos → resposta privada com botão ----------
  const { data: posts = [] } = await graph("GET", `${IG}/media`, { fields: "id,caption,timestamp,comments_count", limit: "25" });
  for (const post of posts) {
    if (!post.comments_count || Date.now() - new Date(post.timestamp).getTime() > 30 * 86400000) continue;
    const n = ((post.caption || "").match(/#(\d{1,6})\b/) || [])[1] || "";
    let coms = [];
    try { coms = (await graph("GET", `${post.id}/comments`, { fields: "id,text,username,timestamp", limit: "50" })).data || []; }
    catch (e) { log(`  comentários de ${post.id}: ${e.message}`); continue; }
    for (const cm of coms) {
      if (ja.has(cm.id) || cm.username === eu || !PALAVRA.test(cm.text || "")) continue;
      if (Date.now() - new Date(cm.timestamp).getTime() > 6.5 * 86400000) { ja.add(cm.id); continue; }
      log(`@${cm.username}: "${String(cm.text).slice(0, 60)}" → #${n || "?"}`);
      if (teste) { ja.add(cm.id); continue; }
      const msg = {
        text: `Oi, ${cm.username}! 💛 Separei o link${n ? ` do achadinho #${n}` : ""} pra você. Toca no botão aqui embaixo que eu te mando agora 👇`,
        quick_replies: [{ content_type: "text", title: "Quero o link 🔗", payload: `LINK_${n || 0}` }],
      };
      try {
        await enviar({ comment_id: cm.id }, msg);
        log("  ✓ resposta privada enviada");
      } catch (e) {
        log(`  resposta privada: ${e.message}`);
        if (!/já tem uma resposta|already/i.test(e.message)) continue; // tenta de novo na próxima rodada
      }
      ja.add(cm.id);
      pend[cm.username] = { n, at: Date.now() };
      n1++;
      await graph("POST", `${cm.id}/replies`, { message: ["Te mandei no direct! 💛", "Já te chamei no direct 📩", "Olha o seu direct! ✨"][n1 % 3] })
        .catch((e) => log(`  resposta no comentário: ${e.message}`));
    }
  }

  // ---------- passo 2: quem respondeu (tocou no botão) recebe o link ----------
  const nomes = Object.keys(pend);
  if (nomes.length) {
    let convs = [];
    try {
      convs = (await graph("GET", `${PAGE || IG}/conversations`, { platform: "instagram", limit: "25", fields: "updated_time,participants,messages.limit(5){from,message,created_time}" })).data || [];
    } catch (e) { log(`  conversas: ${e.message}`); }
    for (const cv of convs) {
      const outro = (cv.participants?.data || []).find((p) => p.username !== eu);
      if (!outro || !pend[outro.username]) continue;
      const p = pend[outro.username];
      // a pessoa mandou alguma mensagem depois do nosso convite?
      const respondeu = (cv.messages?.data || []).some((m) => m.from?.username === outro.username && new Date(m.created_time).getTime() > p.at - 60000);
      if (!respondeu) continue;
      let link = BRAND.site, nome = "";
      if (p.n) {
        const { data: off } = await sb.from("offers").select("id,title").eq("id", Number(p.n)).maybeSingle();
        if (off) { link = `${BRAND.site}/r/${off.id}`; nome = String(off.title || "").split(/\s+/).slice(0, 6).join(" "); }
      }
      const texto = [
        `Aqui está${nome ? ` o ${nome}` : ""}${p.n ? ` (achadinho #${p.n})` : ""} 👇`,
        link,
        "",
        BRAND.canalTelegram ? `🔥 As ofertas exclusivas saem primeiro no meu grupo VIP do Telegram: ${BRAND.canalTelegram}` : "",
        "Me segue pra ver um achado novo todo dia! ✨",
      ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
      log(`@${outro.username} respondeu → link #${p.n || "?"} ${link}`);
      if (teste) continue;
      try {
        await enviar({ id: outro.id }, { text: texto });
        delete pend[outro.username];
        n2++;
        log("  ✓ link enviado");
      } catch (e) {
        log(`  link: ${e.message}`);
        // o Instagram bloqueou link no direct desta conta (restrição temporária): manda o caminho pela bio, sem link
        if (/2534122|compartilhar link|share link/i.test(e.message)) {
          const semLink = [
            `O link${p.n ? ` do achadinho #${p.n}` : ""} tá na minha bio 👆`,
            p.n ? `É só tocar no link do perfil e buscar ${p.n} na vitrine que ele aparece certinho.` : "É só tocar no link do perfil que tá tudo lá.",
            "",
            BRAND.canalTelegram ? "🔥 Lá também tem o botão do meu grupo VIP do Telegram, com as ofertas exclusivas." : "",
            "Me segue pra ver um achado novo todo dia! ✨",
          ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
          try { await enviar({ id: outro.id }, { text: semLink }); delete pend[outro.username]; n2++; log("  ✓ enviado o caminho pela bio (Instagram bloqueou link no direct)"); }
          catch (e2) { log(`  sem link: ${e2.message}`); }
        }
      }
    }
  }
  // convite sem resposta em 24 h: a conversa fecha (regra do Instagram)
  for (const [u, p] of Object.entries(pend)) if (Date.now() - p.at > 24 * 3600000) delete pend[u];

  if (!teste) {
    const agora = new Date().toISOString();
    await sb.from("bot_config").upsert([
      { key: "eu_quero_respondidos", value: JSON.stringify([...ja].slice(-3000)), updated_at: agora },
      { key: "eu_quero_pendentes", value: JSON.stringify(pend), updated_at: agora },
    ]);
  }
  log(`Pronto: ${n1} convite(s) no direct, ${n2} link(s) enviado(s), ${Object.keys(pend).length} esperando a pessoa tocar no botão.`);
}

main().catch((e) => { console.error("Erro:", e.message); process.exit(1); });
