import { isAdmin, unauthorized } from "@/lib/auth";
import { db, hasDb } from "@/lib/supabase";
import { hasShopeeApi, shopeeProduct, shopeeSearch, shopeeShortLinkSub } from "@/lib/shopee";
import { allowedChat, brl, CATEGORIAS, esc, hasBot, normalize, pct, score, tg, webhookSecret } from "@/lib/telegramBot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POR_BUSCA = 5;
const MIN_NOTA = 4.5;
const MIN_VENDAS = 20;
const SUB_ID = "bot"; // vira "botsite"
const VITRINE = () => (process.env.VITRINE_URL || "https://ofertas.achadinhosincriveis.site").replace(/\/$/, "");

const AJUDA = `🤖 <b>Bot de ofertas</b>

<b>/buscar</b> fone bluetooth → produtos de maior comissão (com vendas e nota boas)
<b>/comissao</b> fone bluetooth → só pela maior comissão, mesmo com poucas vendas
<b>/categoria</b> moda → os melhores da categoria
Categorias: ${Object.keys(CATEGORIAS).join(", ")}

Também dá para só escrever o produto (ex.: <i>air fryer</i>).
Em cada produto, toque em <b>➕ Colocar na vitrine</b> para ele entrar no site com o seu link (subId botsite).`;

// ---------- configuração do webhook (abrir logado no /admin) ----------
export async function GET(req) {
  if (!(await isAdmin())) return unauthorized();
  if (!hasBot()) return Response.json({ error: "Falta TELEGRAM_BOT_TOKEN nas variáveis da Vercel" }, { status: 400 });
  const url = `${new URL(req.url).origin}/api/telegram`;
  await tg("setWebhook", { url, secret_token: webhookSecret(), allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  await tg("setMyCommands", { commands: [
    { command: "buscar", description: "Buscar produto (comissão + vendas)" },
    { command: "comissao", description: "Buscar só pela maior comissão" },
    { command: "categoria", description: "Melhores de uma categoria" },
    { command: "ajuda", description: "Como usar" },
  ] });
  const info = await tg("getWebhookInfo", {});
  return Response.json({ ok: true, webhook: info.url, chat_permitido: allowedChat() || "(falta TELEGRAM_CHAT_ID na Vercel)" });
}

// ---------- mensagens do Telegram ----------
export async function POST(req) {
  if (!hasBot() || req.headers.get("x-telegram-bot-api-secret-token") !== webhookSecret()) {
    return new Response("forbidden", { status: 403 });
  }
  const update = await req.json().catch(() => ({}));
  try {
    if (update.callback_query) await onButton(update.callback_query);
    else if (update.message?.text) await onText(update.message);
  } catch (e) {
    const chat = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
    if (chat) await tg("sendMessage", { chat_id: chat, text: `⚠️ ${e.message}`.slice(0, 500) }).catch(() => {});
  }
  return Response.json({ ok: true }); // sempre 200, senão o Telegram fica reenviando
}

const isAllowed = (chatId) => allowedChat() && String(chatId) === allowedChat();
const say = (chat_id, text, extra = {}) => tg("sendMessage", { chat_id, text, parse_mode: "HTML", disable_web_page_preview: true, ...extra });

async function onText(msg) {
  const chat = msg.chat.id;
  if (!isAllowed(chat)) {
    // só você usa o bot; mostra o número para configurar
    await say(chat, `Este bot é privado. Seu chat: <code>${chat}</code>`);
    return;
  }
  const text = msg.text.trim();
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.startsWith("/") ? cmdRaw.slice(1).split("@")[0].toLowerCase() : null;
  const arg = (cmd ? rest.join(" ") : text).trim();

  if (!cmd && !arg) return;
  if (cmd === "start" || cmd === "ajuda" || cmd === "help") return say(chat, AJUDA);
  if (!hasShopeeApi()) return say(chat, "Falta SHOPEE_APP_ID/SHOPEE_APP_SECRET na Vercel.");

  if (cmd === "categoria") {
    const key = arg.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(" ")[0];
    const cat = CATEGORIAS[key];
    if (!cat) return say(chat, `Categorias: ${Object.keys(CATEGORIAS).join(", ")}\nEx.: /categoria moda`);
    return search(chat, { catId: cat[0], label: cat[1], modo: "b" });
  }
  if (cmd === "comissao" || cmd === "comissão") {
    if (!arg) return say(chat, "Ex.: /comissao organizador de geladeira");
    return search(chat, { keyword: arg, label: arg, modo: "c" });
  }
  if (cmd && cmd !== "buscar") return say(chat, AJUDA);
  if (!arg) return say(chat, "Ex.: /buscar fone bluetooth");
  return search(chat, { keyword: arg, label: arg, modo: "b" });
}

// modo "b" = comissão + vendas/nota; "c" = só comissão
async function search(chat, { keyword = "", catId = null, label, modo, skip = 0 }) {
  await tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
  const seen = new Map();
  const sorts = modo === "c" ? [5] : [5, 2];
  const pages = modo === "c" ? [1] : [1, 2];
  for (const sortType of sorts) for (const page of pages) {
    try {
      const { nodes = [] } = await shopeeSearch({ keyword, catId, sortType, page, limit: 50 });
      for (const n of nodes) { const p = normalize(n); if (!seen.has(p.itemId)) seen.set(p.itemId, p); }
    } catch { /* a API às vezes falha numa página; segue com o resto */ }
  }
  let list = [...seen.values()].filter((p) => p.imageUrl && p.price);
  if (modo === "c") list = list.filter((p) => !p.rating || p.rating >= 4).sort((a, b) => b.commission - a.commission);
  else list = list.filter((p) => p.rating >= MIN_NOTA && p.sales >= MIN_VENDAS).sort((a, b) => score(b) - score(a));

  // o que já está na vitrine
  const inShop = new Set();
  if (hasDb() && list.length) {
    const { data } = await db().from("offers").select("description").like("description", "bot:%");
    for (const o of data || []) inShop.add(o.description.slice(4));
  }

  const page = list.slice(skip, skip + POR_BUSCA);
  if (!page.length) return say(chat, skip ? "Acabaram os resultados dessa busca." : `Nada bom encontrado para "${esc(label)}". Tente outra palavra ou /comissao ${esc(label)}.`);
  await say(chat, `🔎 <b>${esc(label)}</b>: ${list.length} produtos bons · mostrando ${skip + 1}–${skip + page.length}`);

  for (const p of page) {
    const caption = [
      `<b>${esc(p.name).slice(0, 200)}</b>`,
      `💰 ${brl(p.price)}${p.originalPrice ? ` <s>${brl(p.originalPrice)}</s>` : ""}`,
      `💸 Comissão ${pct(p.commission)} ≈ ${brl(p.price * p.commission)} por venda`,
      `⭐ ${p.rating || "-"} · ${p.sales} vendas`,
      `📷 ${p.productLink}`,
    ].join("\n");
    const btn = inShop.has(p.itemId)
      ? [{ text: "✅ Já está na vitrine", callback_data: "noop" }]
      : [{ text: "➕ Colocar na vitrine", callback_data: `add:${p.shopId}:${p.itemId}` }];
    const extra = { reply_markup: { inline_keyboard: [btn] } };
    try { await tg("sendPhoto", { chat_id: chat, photo: p.imageUrl, caption, parse_mode: "HTML", ...extra }); }
    catch { await say(chat, caption, extra); }
  }
  if (list.length > skip + POR_BUSCA) {
    const ref = catId ? `c${catId}` : keyword.slice(0, 40);
    await say(chat, "Quer mais?", { reply_markup: { inline_keyboard: [[{ text: "➡️ Ver mais 5", callback_data: `more:${modo}:${skip + POR_BUSCA}:${ref}`.slice(0, 64) }]] } });
  }
}

async function onButton(q) {
  const chat = q.message?.chat?.id;
  if (!isAllowed(chat)) return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Bot privado" });
  const data = q.data || "";

  if (data === "noop") return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Esse já está na vitrine" });

  if (data.startsWith("more:")) {
    await tg("answerCallbackQuery", { callback_query_id: q.id });
    const [, modo, skip, ...r] = data.split(":");
    const ref = r.join(":");
    const catEntry = ref.startsWith("c") && /^c\d+$/.test(ref) ? Object.values(CATEGORIAS).find(([id]) => `c${id}` === ref) : null;
    return search(chat, catEntry
      ? { catId: catEntry[0], label: catEntry[1], modo, skip: Number(skip) }
      : { keyword: ref, label: ref, modo, skip: Number(skip) });
  }

  if (data.startsWith("add:")) {
    const [, shopId, itemId] = data.split(":");
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Colocando na vitrine..." });
    if (!hasDb()) return say(chat, "Supabase não configurado na Vercel.");
    const { data: dup } = await db().from("offers").select("id").eq("description", `bot:${itemId}`).limit(1);
    if (dup?.length) return say(chat, `Já está na vitrine como <b>#${dup[0].id}</b>.`);

    const raw = await shopeeProduct({ shopId, itemId });
    if (!raw) return say(chat, "Não achei mais esse produto na API.");
    const p = normalize(raw);
    let link = p.offerLink;
    try { link = (await shopeeShortLinkSub(p.productLink || p.offerLink, SUB_ID)) || link; } catch { /* usa o link da API */ }
    const dias = Number(process.env.DIAS_NA_VITRINE || 15);
    const { data: row, error } = await db().from("offers").insert({
      kind: "produto",
      title: p.name.slice(0, 120),
      description: `bot:${p.itemId}`,
      image_url: p.imageUrl,
      price: p.price || null,
      original_price: p.originalPrice,
      link,
      platform: "shopee",
      active: true,
      expires_at: dias > 0 ? new Date(Date.now() + dias * 86400000).toISOString() : null,
    }).select("id").single();
    if (error) return say(chat, `Erro ao gravar: ${esc(error.message)}`);

    // troca o botão da mensagem para "já está"
    if (q.message?.message_id) {
      await tg("editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id,
        reply_markup: { inline_keyboard: [[{ text: `✅ Na vitrine #${row.id}`, callback_data: "noop" }]] } }).catch(() => {});
    }
    return say(chat, [
      `✅ Na vitrine como <b>#${row.id}</b> (sai em ${dias} dias)`,
      `🎬 No vídeo: <b>"procura o #${row.id} no link da bio"</b>`,
      `🔎 ${VITRINE()}/?p=${row.id}`,
      `🔗 ${link}`,
    ].join("\n"));
  }
  return tg("answerCallbackQuery", { callback_query_id: q.id });
}
