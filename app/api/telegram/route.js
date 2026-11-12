import { isAdmin, unauthorized } from "@/lib/auth";
import { importFromUrl } from "@/lib/importer";
import { AMAZON_RE, amazonProduct } from "@/lib/amazon";
import { db, hasDb } from "@/lib/supabase";
import { hasShopeeApi, parseShopeeIds, shopeeProduct, shopeeSearch, shopeeShops, shopeeShortLinkSub } from "@/lib/shopee";
import { allowedChat, brl, CAT_ALIAS, CATEGORIAS, commissionLine, esc, hasBot, normalize, pct, score, tg, webhookSecret } from "@/lib/telegramBot";
import GANCHOS from "@/automacao/capas/ganchos.json";

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
<b>/categoria</b> motos → os melhores da categoria
<b>/reels</b> 105 SKU-da-CJ texto: sua narração → gera o Reels do produto #105 com o vídeo real da CJ (chega aqui em ~3 min). Sem SKU usa só a foto. Acrescente <i>postar</i> para já postar no Instagram.
<b>/shopee</b> 131 SKU-da-CJ narração → mesmo vídeo, mas para o <b>Shopee Vídeo</b>: o final chama para tocar no produto vinculado (sem "seguir" nem "link na bio"). Também vale como legenda de um vídeo seu.
🎥 <b>Link do Shopee Vídeo</b>: cole o link (Compartilhar → Copiar link) e o bot baixa o vídeo, identifica o produto e gera o seu vídeo.
📲 <b>Vídeos de grupos</b>: encaminhe o vídeo com o texto (que tem o link da Shopee). Num grupo do Telegram onde o bot está, mande /grupoid lá dentro para liberar a leitura automática. O bot põe o produto na vitrine com o SEU link, cria a narração e gera o vídeo.
<b>/modo</b> shopee | reels | ambos → formato dos vídeos encaminhados
<b>/top</b> sozinho → a IA escolhe tema e produtos. Ou: título na 1ª linha e, em cada linha de baixo, "136 narração" → Reels com vários produtos (ex.: 5 coisas que facilitam a vida)
🛒 <b>Amazon</b>: cole o seu link de associado (amzn.to/… ou amazon.com.br/dp/…) e o produto entra na vitrine com etiqueta Amazon. Mande um <b>vídeo</b> com o link na legenda e ele gera o vídeo com final "clica no link aqui embaixo", sem citar a loja.
<b>/link</b> 227 → vídeo com final genérico de um produto que já está na vitrine (com a foto; mande um vídeo com essa legenda para usar o vídeo)
<b>/loja</b> nome da loja → lojas oficiais e parceiras, com a comissão e os produtos de cada uma
Categorias: ${Object.keys(CATEGORIAS).join(", ")}

Também dá para só escrever o produto (ex.: <i>air fryer</i>).
Em cada produto, toque em <b>➕ Colocar na vitrine</b> para ele entrar no site com o seu link (subId botsite).

🖼️ <b>Capas do carrossel</b>
Mande uma FOTO com a legenda <b>/capa maquiagem</b> (ou outra categoria) para ela entrar no rodízio de capas.
Foto do perfil para o final dos Reels: mande a imagem com a legenda <b>/avatar</b>.
<b>/capas</b> → quantas imagens cada categoria tem`;

const CAPA_SLUGS = Object.keys(GANCHOS).filter((k) => !k.startsWith("_"));
const slugify = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const ALIAS = { moda: "moda-feminina", feminina: "moda-feminina", "moda-feminino": "moda-feminina", masculina: "moda-masculina", "moda-masculino": "moda-masculina",
  make: "maquiagem", beleza: "maquiagem", skin: "skincare", "skin-care": "skincare", cabelos: "cabelo", calcado: "calcados", sapatos: "calcados",
  acessorio: "acessorios", tecnologia: "celular", eletronicos: "celular", organizacao: "organizador", decoracao: "decoracao", decor: "decoracao", pets: "pet", ferramenta: "ferramentas", crianca: "infantil", bebe: "infantil" };
const toSlug = (t) => { const s = slugify(t); return ALIAS[s] || s; };

// ---------- configuração do webhook (abrir logado no /admin) ----------
export async function GET(req) {
  if (!(await isAdmin())) return unauthorized();
  if (!hasBot()) return Response.json({ error: "Falta TELEGRAM_BOT_TOKEN nas variáveis da Vercel" }, { status: 400 });
  const url = `${new URL(req.url).origin}/api/telegram`;
  await tg("setWebhook", { url, secret_token: webhookSecret(), allowed_updates: ["message", "channel_post", "callback_query"], drop_pending_updates: true });
  await tg("setMyCommands", { commands: [
    { command: "buscar", description: "Buscar produto (comissão + vendas)" },
    { command: "comissao", description: "Buscar só pela maior comissão" },
    { command: "categoria", description: "Melhores de uma categoria" },
    { command: "loja", description: "Buscar loja oficial pelo nome" },
    { command: "reels", description: "Gerar Reels: /reels 105 SKU-CJ" },
    { command: "top", description: "Reels com vários produtos (Top N)" },
    { command: "modo", description: "Formato dos vídeos encaminhados: shopee, reels ou ambos" },
    { command: "shopee", description: "Vídeo para o Shopee Vídeo: /shopee 131 SKU texto" },
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
    else if ((update.message || update.channel_post) && (update.message || update.channel_post).chat?.type !== "private") await onGroup(update.message || update.channel_post);
    else if (update.message?.video || /^video\//.test(update.message?.document?.mime_type || "")) await onVideo(update.message);
    else if (update.message?.photo || update.message?.document) await onPhoto(update.message);
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
  // texto do grupo com link da Shopee logo depois de um vídeo sem legenda
  if (!text.startsWith("/") && hasDb()) {
    const url = (text.match(/https?:\/\/(?:s\.shopee\.com\.br|shope\.ee|shp\.ee|(?:www\.)?shopee\.com\.br)\/[^\s)>\]]+/i) || [])[0] || (text.match(AMAZON_RE) || [])[0];
    if (url) {
      const { data: pend } = await db().from("bot_config").select("value").eq("key", "video_pendente").maybeSingle();
      let pv = null; try { pv = JSON.parse(pend?.value || "null"); } catch {}
      if (pv && Date.now() - pv.at < 10 * 60000) {
        await db().from("bot_config").delete().eq("key", "video_pendente");
        const fake = { chat: msg.chat, video: { file_id: pv.file_id, file_size: pv.file_size } };
        if (AMAZON_RE.test(url)) return amazonVideo(fake, text, url);
        return isVideoLink(url) ? identifyGroupVideo(fake, text) : importGroupVideo(fake, text, url);
      }
    }
  }
  // link de vídeo do Shopee Vídeo sozinho: baixa o vídeo e segue como vídeo encaminhado
  const svLink = (text.match(SHOPEE_RE) || [])[0];
  if (svLink && (!text.startsWith("/") || /^\/baixar\b/i.test(text))) return linkShopee(msg, text, svLink);
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.startsWith("/") ? cmdRaw.slice(1).split("@")[0].toLowerCase() : null;
  const arg = (cmd ? rest.join(" ") : text).trim();

  if (!cmd && !arg) return;
  if (cmd === "start" || cmd === "ajuda" || cmd === "help") return say(chat, AJUDA);
  const amz = !cmd || cmd === "amazon" ? (text.match(AMAZON_RE) || [])[0] : null;
  if (amz) return importAmazon(chat, amz, text.replace(AMAZON_RE, "").replace(/^\/amazon\S*/i, "").trim());
  if (!hasShopeeApi()) return say(chat, "Falta SHOPEE_APP_ID/SHOPEE_APP_SECRET na Vercel.");

  if (cmd === "top") return startTop(chat, text);
  if (cmd === "modo") return setModo(chat, arg);
  if (cmd === "reels" || cmd === "shopee" || cmd === "link") {
    const { head, fala } = parseReels(text);
    return startReels(chat, head, fala, "", cmd === "shopee" ? "shopee" : cmd === "link" ? "link" : "instagram", cmd === "link" && !fala ? { gerarFala: true } : {});
  }
  if (cmd === "loja" || cmd === "lojas") {
    if (!arg) return say(chat, "Ex.: /loja samsung  ou  /loja vult");
    return searchShops(chat, arg);
  }
  if (cmd === "capa") return say(chat, `Mande a <b>foto</b> com a legenda <b>/capa categoria</b>.\nCategorias: ${CAPA_SLUGS.join(", ")}`);
  if (cmd === "capas") return listCovers(chat);

  if (cmd === "categoria") {
    if (!arg) return say(chat, `Categorias: ${Object.keys(CATEGORIAS).join(", ")}\nEx.: /categoria moda`);
    const key = arg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, "-");
    const cat = CATEGORIAS[key] || CATEGORIAS[CAT_ALIAS[key]]; // "decoração festa" não é categoria: vira busca
    // não é uma categoria da Shopee (ex.: "decoração festa"): busca pelo texto
    if (!cat) return search(chat, { keyword: arg, label: arg, modo: "b" });
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
async function search(chat, { keyword = "", catId = null, shopId = null, label, modo, skip = 0 }) {
  await tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
  const seen = new Map();
  let failed = 0;
  const sorts = modo === "c" ? [5] : [5, 2];
  const pages = modo === "c" ? [1] : [1, 2];
  for (const sortType of sorts) for (const page of pages) {
    try {
      const { nodes = [] } = await shopeeSearch({ keyword, catId, shopId, sortType, page, limit: 50 });
      for (const n of nodes) { const p = normalize(n); if (!seen.has(p.itemId)) seen.set(p.itemId, p); }
    } catch { failed++; /* a API às vezes falha numa página; segue com o resto */ }
  }
  let list = [...seen.values()].filter((p) => p.imageUrl && p.price);
  if (modo === "c") list = list.filter((p) => !p.rating || p.rating >= 4).sort((a, b) => b.commission - a.commission);
  else {
    const all = list;
    list = all.filter((p) => p.rating >= MIN_NOTA && p.sales >= MIN_VENDAS);
    // nicho pequeno (ex.: motos, festa): se ninguém passar, aceita nota 4+ e qualquer número de vendas
    if (!list.length) {
      list = all.filter((p) => !p.rating || p.rating >= 4);
      if (list.length && !skip) await say(chat, "ℹ️ Poucos produtos com muitas vendas aqui, então mostrei com filtros mais leves (nota 4+).");
    }
    list.sort((a, b) => score(b) - score(a));
  }

  // o que já está na vitrine
  const inShop = new Set();
  if (hasDb() && list.length) {
    const { data } = await db().from("offers").select("description").like("description", "bot:%");
    for (const o of data || []) inShop.add(o.description.slice(4));
  }

  const page = list.slice(skip, skip + POR_BUSCA);
  if (!page.length) {
    if (!skip && failed && !seen.size) return say(chat, "⚠️ A Shopee não respondeu agora (erro do lado dela). Tenta de novo em 1 minuto.");
    return say(chat, skip ? "Acabaram os resultados dessa busca." : `Nada encontrado para "${esc(label)}". Tente outra palavra ou /comissao ${esc(label)}.`);
  }
  await say(chat, `🔎 <b>${esc(label)}</b>: ${list.length} produtos bons · mostrando ${skip + 1}–${skip + page.length}`);

  for (const p of page) {
    const caption = [
      `<b>${esc(p.name).slice(0, 200)}</b>`,
      `💰 ${brl(p.price)}`,
      commissionLine(p),
      `⭐ ${p.rating || "-"} · ${p.sales} vendas recentes`,
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
    const ref = shopId ? `s${shopId}` : catId ? `c${catId}` : keyword.slice(0, 40);
    await say(chat, "Quer mais?", { reply_markup: { inline_keyboard: [[{ text: "➡️ Ver mais 5", callback_data: `more:${modo}:${skip + POR_BUSCA}:${ref}`.slice(0, 64) }]] } });
  }
}

async function onButton(q) {
  const chat = q.message?.chat?.id;
  if (!isAllowed(chat)) return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Bot privado" });
  const data = q.data || "";

  if (data === "noop") return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Esse já está na vitrine" });

  if (data.startsWith("lp:")) { // produtos da loja
    await tg("answerCallbackQuery", { callback_query_id: q.id });
    return search(chat, { shopId: data.split(":")[1], label: "Produtos da loja", modo: "b" });
  }
  if (data.startsWith("ls:")) return addShop(chat, q, data.split(":")[1]);
  if (data.startsWith("pub:") || data.startsWith("nopub:")) return approveReels(chat, q, data);
  if (data.startsWith("gp:") || data.startsWith("gpx:")) return chooseGroupProduct(chat, q, data);

  if (data.startsWith("more:")) {
    await tg("answerCallbackQuery", { callback_query_id: q.id });
    const [, modo, skip, ...r] = data.split(":");
    const ref = r.join(":");
    if (/^s\d+$/.test(ref)) return search(chat, { shopId: ref.slice(1), label: "Produtos da loja", modo, skip: Number(skip) });
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

// ---------- capas do carrossel ----------
async function onPhoto(msg) {
  const chat = msg.chat.id;
  if (!isAllowed(chat)) return say(chat, `Este bot é privado. Seu chat: <code>${chat}</code>`);
  const cap = (msg.caption || "").trim();
  if (/^\/?avatar\b/i.test(cap)) return saveAvatar(chat, msg);
  const fm = cap.match(/^\/?foto\s+#?(\d+)/i);
  if (fm) return saveOfferPhoto(chat, msg, Number(fm[1]));
  const m = cap.match(/^\/?capas?\s+(.+)$/i);
  if (!m) return say(chat, `Para usar como capa, mande a foto com a legenda <b>/capa categoria</b>.\nCategorias: ${CAPA_SLUGS.join(", ")}`);
  const slug = toSlug(m[1]);
  if (!CAPA_SLUGS.includes(slug)) return say(chat, `Não conheço a categoria "${esc(m[1])}".\nUse uma destas: ${CAPA_SLUGS.join(", ")}`);
  if (!hasDb()) return say(chat, "Supabase não configurado na Vercel.");

  // foto comprimida: pega a maior; arquivo (documento): usa como veio
  const doc = msg.document && /^image\//.test(msg.document.mime_type || "") ? msg.document : null;
  const fileId = doc ? doc.file_id : msg.photo?.[msg.photo.length - 1]?.file_id;
  if (!fileId) return say(chat, "Esse arquivo não é imagem.");
  const f = await tg("getFile", { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/${f.file_path}`, { cache: "no-store" });
  if (!res.ok) return say(chat, "Não consegui baixar a imagem do Telegram.");
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = (f.file_path.split(".").pop() || "jpg").toLowerCase().replace("jpeg", "jpg");
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const name = `${slug}/${Date.now()}.${["png", "webp"].includes(ext) ? ext : "jpg"}`;
  const { error } = await db().storage.from("capas").upload(name, buf, { contentType: type, upsert: false });
  if (error) return say(chat, `Erro ao guardar: ${esc(error.message)}`);
  const { data } = await db().storage.from("capas").list(slug, { limit: 100 });
  const total = (data || []).filter((x) => /\.(jpe?g|png|webp)$/i.test(x.name)).length;
  const warn = !doc && Math.max(msg.photo?.at(-1)?.width || 0, msg.photo?.at(-1)?.height || 0) < 1200
    ? "\n⚠️ Dica: para qualidade máxima, mande como <b>arquivo</b> (📎 → Arquivo) em vez de foto." : "";
  return say(chat, `✅ Capa guardada em <b>${GANCHOS[slug].etiqueta}</b> (${total} no Telegram${slug === "maquiagem" || slug === "moda-feminina" ? " + 1 que você mandou no chat" : ""}).\nGanchos dessa categoria:\n${GANCHOS[slug].ganchos.map((g) => "• " + esc(g.replace(/\*/g, ""))).join("\n")}${warn}`);
}

// foto de um produto da vitrine (ex.: Amazon que bloqueou a leitura): legenda /foto 152
async function saveOfferPhoto(chat, msg, id) {
  if (!hasDb()) return say(chat, "Supabase não configurado na Vercel.");
  const { data: off } = await db().from("offers").select("id,title").eq("id", id).maybeSingle();
  if (!off) return say(chat, `Não achei o #${id} na vitrine.`);
  const doc = msg.document && /^image\//.test(msg.document.mime_type || "") ? msg.document : null;
  const fileId = doc ? doc.file_id : msg.photo?.[msg.photo.length - 1]?.file_id;
  if (!fileId) return say(chat, "Esse arquivo não é imagem.");
  const f = await tg("getFile", { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/${f.file_path}`, { cache: "no-store" });
  if (!res.ok) return say(chat, "Não consegui baixar a imagem do Telegram.");
  const ext = (f.file_path.split(".").pop() || "jpg").toLowerCase().replace("jpeg", "jpg");
  const name = `produtos/${id}-${Date.now()}.${["png", "webp"].includes(ext) ? ext : "jpg"}`;
  const { error } = await db().storage.from("carrosseis").upload(name, Buffer.from(await res.arrayBuffer()), { contentType: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" });
  if (error) return say(chat, `Erro ao guardar: ${esc(error.message)}`);
  const url = db().storage.from("carrosseis").getPublicUrl(name).data.publicUrl;
  await db().from("offers").update({ image_url: url }).eq("id", id);
  return say(chat, `✅ Foto do <b>#${id}</b> atualizada (${esc(off.title)}).`);
}

async function listCovers(chat) {
  if (!hasDb()) return say(chat, "Supabase não configurado na Vercel.");
  const linhas = [];
  for (const slug of CAPA_SLUGS) {
    const { data } = await db().storage.from("capas").list(slug, { limit: 100 });
    const n = (data || []).filter((x) => /\.(jpe?g|png|webp)$/i.test(x.name)).length + (["maquiagem", "moda-feminina"].includes(slug) ? 1 : 0);
    linhas.push(`${n ? "✅" : "⬜"} ${slug}: ${n}`);
  }
  return say(chat, `🖼️ <b>Capas por categoria</b>\n${linhas.join("\n")}\n\nCategoria sem imagem usa a capa antiga.`);
}

// ---------- lojas ----------
const SHOP_TYPE = (t) => {
  const v = Array.isArray(t) ? t : t == null ? [] : [t];
  if (v.includes(1)) return "🏬 Loja oficial";
  if (v.includes(4)) return "⭐ Indicada Plus";
  if (v.includes(2)) return "⭐ Loja indicada";
  return "";
};

async function searchShops(chat, name) {
  await tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
  let nodes = [];
  try { ({ nodes = [] } = await shopeeShops({ keyword: name, limit: 10 })); }
  catch (e) { return say(chat, `⚠️ A Shopee não respondeu a busca de lojas: ${esc(e.message).slice(0, 200)}`); }
  if (!nodes.length) return say(chat, `Nenhuma loja com oferta de afiliado encontrada para "${esc(name)}".\nDica: tente só a marca (ex.: /loja samsung).`);
  // oficiais primeiro, depois maior comissão
  nodes.sort((a, b) => (SHOP_TYPE(b.shopType).includes("oficial") - SHOP_TYPE(a.shopType).includes("oficial")) || (Number(b.commissionRate) - Number(a.commissionRate)));
  await say(chat, `🏬 <b>Lojas para "${esc(name)}"</b>: ${nodes.length} encontradas`);
  for (const sh of nodes.slice(0, 6)) {
    const caption = [
      `<b>${esc(sh.shopName)}</b>`,
      SHOP_TYPE(sh.shopType),
      sh.commissionRate ? `💸 Comissão até ${pct(Number(sh.commissionRate))} na loja` : null,
      sh.ratingStar ? `⭐ ${Number(sh.ratingStar).toFixed(1)}` : null,
      sh.periodEndTime && Number(sh.periodEndTime) < 32503651199 ? `⏳ Oferta até ${new Date(Number(sh.periodEndTime) * 1000).toLocaleDateString("pt-BR")}` : null,
    ].filter(Boolean).join("\n");
    const extra = { reply_markup: { inline_keyboard: [[
      { text: "🛍️ Produtos da loja", callback_data: `lp:${sh.shopId}` },
      { text: "➕ Loja na vitrine", callback_data: `ls:${sh.shopId}` },
    ]] } };
    if (sh.imageUrl) {
      try { await tg("sendPhoto", { chat_id: chat, photo: sh.imageUrl, caption, parse_mode: "HTML", ...extra }); continue; } catch { /* sem foto */ }
    }
    await say(chat, caption, extra);
  }
}

// coloca o link da loja na faixa "Cupons do momento" da vitrine
async function addShop(chat, q, shopId) {
  await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Colocando a loja na vitrine..." });
  if (!hasDb()) return say(chat, "Supabase não configurado na Vercel.");
  const { data: dup } = await db().from("offers").select("id").eq("description", `loja:${shopId}`).eq("active", true).limit(1);
  if (dup?.length) return say(chat, `Essa loja já está na vitrine como <b>#${dup[0].id}</b>.`);
  const { nodes = [] } = await shopeeShops({ shopId, limit: 1 });
  const sh = nodes.find((n) => String(n.shopId) === String(shopId)) || nodes[0];
  if (!sh) return say(chat, "Não achei mais essa loja na API.");
  let link = sh.offerLink;
  try { link = (await shopeeShortLinkSub(sh.originalLink || sh.offerLink, "loja")) || link; } catch { /* usa o link da API */ }
  const dias = Number(process.env.DIAS_NA_VITRINE || 15);
  const tipo = SHOP_TYPE(sh.shopType).replace(/^\S+\s/, "");
  const { data: row, error } = await db().from("offers").insert({
    kind: "cupom",
    title: `${tipo === "Loja oficial" ? "Loja oficial " : ""}${sh.shopName}`.slice(0, 120),
    description: `loja:${shopId}`,
    image_url: sh.imageUrl || null,
    link,
    platform: "shopee",
    category: "Lojas",
    active: true,
    expires_at: dias > 0 ? new Date(Date.now() + dias * 86400000).toISOString() : null,
  }).select("id").single();
  if (error) return say(chat, `Erro ao gravar: ${esc(error.message)}`);
  if (q.message?.message_id) {
    await tg("editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: "🛍️ Produtos da loja", callback_data: `lp:${shopId}` }, { text: `✅ Na vitrine #${row.id}`, callback_data: "noop" }]] } }).catch(() => {});
  }
  return say(chat, `✅ <b>${esc(sh.shopName)}</b> está na vitrine em "Cupons do momento" (#${row.id}, subId lojasite).\n🔗 ${link}`);
}

// ---------- Amazon: link de associado -> vitrine (sem API) ----------
// Se a Amazon bloquear a leitura, mande o link + "preço | nome do produto" (ex.: 39,89 | Kit Elseve Cachos)
// e depois a foto com a legenda /foto NUMERO.
async function importAmazon(chat, url, resto = "") {
  if (!hasDb()) return say(chat, "Supabase não configurado na Vercel.");
  await say(chat, "🔎 Lendo o produto na Amazon...");
  const r = await addAmazon(url, resto);
  if (r.erro) return say(chat, r.erro);
  const { a, id, dias, dup } = r;
  if (dup) return say(chat, `Já está na vitrine como <b>#${id}</b>.`);
  const preco = a.price ? `R$ ${a.price.toFixed(2).replace(".", ",")}` : "sem preço";
  const faltou = [!a.price && "preço", !a.image_url && "foto"].filter(Boolean);
  const msg = [
    `✅ <b>Amazon</b> na vitrine como <b>#${id}</b> (sai em ${dias} dias)`,
    `📦 ${esc(a.title)}`,
    `💰 ${preco}`,
    `🔗 ${a.link}`,
    `🔎 ${VITRINE()}/?p=${id}`,
    faltou.length ? `\n⚠️ Faltou ${faltou.join(" e ")}. ${!a.image_url ? `Mande a foto com a legenda <b>/foto ${id}</b>.` : ""}` : "",
  ].filter(Boolean).join("\n");
  return a.image_url ? tg("sendPhoto", { chat_id: chat, photo: a.image_url, caption: msg, parse_mode: "HTML" }).catch(() => say(chat, msg)) : say(chat, msg);
}

const AMAZON_BLOQUEOU = [
  "⚠️ A Amazon bloqueou a leitura automática desta vez.",
  "Mande de novo assim: <b>link  preço | nome do produto</b>",
  "Ex.: <i>https://amzn.to/xxxx 39,89 | Kit Elseve Cachos dos Sonhos</i>",
].join("\n");

// lê o produto e grava na vitrine (ou devolve o que já existe)
async function addAmazon(url, resto = "") {
  const a = await amazonProduct(url);
  const [precoTxt, ...nomeTxt] = String(resto).split("|").map((x) => x.trim());
  const precoManual = Number(String(precoTxt || "").replace(/[^\d,]/g, "").replace(",", "."));
  if (nomeTxt.join(" ").trim() && isFinite(precoManual) && precoManual > 0) a.price = precoManual;
  if (nomeTxt.join(" ").trim()) a.title = nomeTxt.join(" ").trim();
  if (!a.title) return { erro: AMAZON_BLOQUEOU };
  const dias = Number(process.env.DIAS_NA_VITRINE || 15);
  const desc = a.asin ? `amazon:${a.asin}` : null;
  if (desc) {
    const { data: dup } = await db().from("offers").select("id").eq("description", desc).eq("active", true).limit(1);
    if (dup?.length) return { a, id: dup[0].id, dias, dup: true };
  }
  const { data: row, error } = await db().from("offers").insert({
    kind: "produto",
    title: a.title.slice(0, 120),
    description: desc,
    image_url: a.image_url,
    price: a.price || null,
    original_price: a.original_price,
    link: a.link,
    platform: "amazon",
    active: true,
    expires_at: dias > 0 ? new Date(Date.now() + dias * 86400000).toISOString() : null,
  }).select("id").single();
  if (error) return { erro: `Erro ao gravar: ${esc(error.message)}` };
  return { a, id: row.id, dias, dup: false };
}

// vídeo + link da Amazon: produto na vitrine e vídeo com final genérico ("clica no link abaixo")
async function amazonVideo(msg, cap, url) {
  const chat = msg.chat.id;
  const v = msg.video || msg.document;
  if ((v.file_size || 0) > 20 * 1024 * 1024) return say(chat, "Esse vídeo passa de 20 MB (limite do Telegram para o bot baixar).");
  if (!hasDb()) return say(chat, "Supabase não configurado na Vercel.");
  await tg("sendChatAction", { chat_id: chat, action: "upload_video" }).catch(() => {});
  const resto = cap.replace(url, "").trim();
  // "preço | nome" só quando vier no formato manual; o resto do texto vira contexto da narração
  const manual = /\|/.test(resto) ? resto : "";
  const r = await addAmazon(url, manual);
  if (r.erro) return say(chat, `${r.erro}\n(junto com o vídeo, na legenda)`);
  const f = await tg("getFile", { file_id: v.file_id });
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/${f.file_path}`, { cache: "no-store" });
  if (!res.ok) return say(chat, "Não consegui baixar o vídeo do Telegram.");
  const name = `${Date.now()}.mp4`;
  const { error: upErr } = await db().storage.from("reels-videos").upload(name, Buffer.from(await res.arrayBuffer()), { contentType: "video/mp4" });
  if (upErr) return say(chat, `Erro ao guardar o vídeo: ${esc(upErr.message)}`);
  await say(chat, `📥 <b>Amazon #${r.id}</b> ${esc(String(r.a.title).slice(0, 80))}${r.dup ? " (já estava na vitrine)" : ""}\n${r.a.price ? `💰 ${brl(r.a.price)}\n` : ""}🔗 ${esc(r.a.link)}`);
  return startReels(chat, [String(r.id)], "", name, "link", { gerarFala: true, contexto: manual ? "" : resto });
}

// ---------- Reels sob encomenda: dispara o workflow "Reels v2" no GitHub ----------
const REPO = process.env.GITHUB_REPO || "bemyveus-prog/achadinhos";
async function startReels(chat, parts, fala = "", video = "", modo = "instagram", extra = {}) {
  const args = parts.filter(Boolean);
  const num = (args.find((a) => /^#?\d+$/.test(a)) || "").replace("#", "");
  const postar = args.some((a) => /^postar$/i.test(a));
  // depois do número: SKU da CJ (tem letras e números, ex.: CJYD2300009) e, sem "texto:", o resto vira narração
  const rest = args.filter((a) => a.replace("#", "") !== num && !/^postar$/i.test(a));
  const looksSku = (a) => /^[A-Za-z0-9_-]{5,60}$/.test(a) && /\d/.test(a) && /[A-Za-z]/.test(a);
  const sku = rest[0] && looksSku(rest[0]) ? rest[0] : "";
  if (!fala) fala = rest.slice(sku ? 1 : 0).join(" ").trim();
  if (!num) return say(chat, "Use assim: <b>/reels 105 CJYD2300009</b>\n(número da vitrine e, se quiser, o SKU da CJ; acrescente <i>postar</i> para postar direto)\nPara narrar o seu texto: <b>/reels 105 CJYD2300009 texto: seu texto aqui</b>");
  if (fala.length > 400) return say(chat, `O texto ficou com ${fala.length} letras. Use até 400 (uns 25 segundos de fala).`);
  const token = (process.env.GITHUB_TOKEN || "").trim();
  if (!token) return say(chat, "Falta a variável GITHUB_TOKEN na Vercel.");
  if (hasDb()) {
    const { data } = await db().from("offers").select("id,title").eq("id", Number(num)).maybeSingle();
    if (!data) return say(chat, `Não achei o produto #${num} na vitrine.`);
  }
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/reels-v2.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "vitrine-bot" },
    body: JSON.stringify({ ref: "main", inputs: { oferta: num, cj_sku: sku, fala, video, modo, ...(extra.gerarFala ? { gerar_fala: "1", contexto: String(extra.contexto || "").slice(0, 900) } : {}), ...(postar ? { postar: "true" } : {}) } }),
    cache: "no-store",
  });
  if (r.status !== 204) {
    const t = await r.text().catch(() => "");
    let msg = t; try { msg = JSON.parse(t).message || t; } catch {}
    return say(chat, `⚠️ O GitHub recusou (${r.status}): <i>${esc(String(msg).slice(0, 200))}</i>\n${r.status === 403 || r.status === 401 || r.status === 404 ? "Confira no token: dono = bemyveus-prog, repositório achadinhos e permissão Actions: Read and write." : ""}`);
  }
  if (modo === "link") return say(chat, `🔗 Gerando o vídeo do <b>#${num}</b> com final genérico (clique no link abaixo, sem citar a loja). Chega aqui em uns 2 minutos.`);
  if (modo === "shopee") return say(chat, `🛍️ Gerando o vídeo do <b>#${num}</b> para o <b>Shopee Vídeo</b>${video ? " com o seu vídeo" : sku ? ` com o vídeo da CJ (<code>${esc(sku)}</code>)` : ""}${fala ? " e a sua narração" : ""}.\nChega aqui em uns 2 minutos.`);
  return say(chat, `🎬 Gerando o Reels do <b>#${num}</b>${video && sku ? ` com o seu vídeo + o vídeo da CJ (<code>${esc(sku)}</code>)` : video ? " com o seu vídeo" : sku ? ` com o vídeo da CJ (<code>${esc(sku)}</code>)` : ""}${fala ? " com a sua narração" : ""}${postar ? " e postando no Instagram" : ""}.\nChega aqui em uns 3 minutos.`);
}

// "/reels 123 SKU texto: narração" (o texto também pode vir nas linhas de baixo)
function parseReels(text) {
  const full = String(text || "").replace(/^\/?(reels|shopee|link)(@\S+)?/i, "").trim();
  const m = full.match(/^(.*?)(?:\btexto:|\n)([\s\S]*)$/i);
  const head = (m ? m[1] : full).trim().split(/\s+/).filter(Boolean);
  const fala = m ? m[2].replace(/\s+/g, " ").trim() : "";
  return { head, fala };
}

// vídeo do próprio usuário: guarda no Storage e gera o Reels com ele no lugar do vídeo da CJ
async function onVideo(msg) {
  const chat = msg.chat.id;
  if (!isAllowed(chat)) return say(chat, `Este bot é privado. Seu chat: <code>${chat}</code>`);
  const cap = (msg.caption || "").trim();
  const shopeeUrl = (cap.match(/https?:\/\/(?:s\.shopee\.com\.br|shope\.ee|shp\.ee|(?:www\.)?shopee\.com\.br)\/[^\s)>\]]+/i) || [])[0];
  const isCmd = /^\/?(reels|shopee|link)\b/i.test(cap);
  const amzUrl = (cap.match(AMAZON_RE) || [])[0];
  if (!isCmd && amzUrl) return amazonVideo(msg, cap, amzUrl);
  // link do Shopee Vídeo (não traz o produto) ou texto sem link: a IA identifica o produto pelo vídeo
  if (!isCmd && (isVideoLink(shopeeUrl) || (cap && !shopeeUrl))) return identifyGroupVideo(msg, cap);
  if (!isCmd && shopeeUrl) return importGroupVideo(msg, cap, shopeeUrl);
  if (!cap) {
    // encaminhado do WhatsApp às vezes chega com o texto separado: guarda e espera a mensagem com o link
    const v = msg.video || msg.document;
    await db().from("bot_config").upsert({ key: "video_pendente", value: JSON.stringify({ file_id: v.file_id, file_size: v.file_size || 0, at: Date.now() }), updated_at: new Date().toISOString() });
    return say(chat, "🎥 Recebi o vídeo. Agora manda (ou encaminha) o texto com o link da Shopee ou da Amazon.");
  }
  if (!/^\/?(reels|shopee|link)\b/i.test(cap)) return say(chat, "Para virar Reels, mande o vídeo com a legenda: <b>/reels 123 SKU-da-CJ texto: sua narração</b> (o SKU e o texto são opcionais)");
  const v = msg.video || msg.document;
  if ((v.file_size || 0) > 20 * 1024 * 1024) return say(chat, "O Telegram só deixa o bot baixar vídeos de até 20 MB. Mande uma versão menor (ex.: cortada ou em 720p).");
  if (!hasDb()) return say(chat, "Supabase não configurado na Vercel.");
  await tg("sendChatAction", { chat_id: chat, action: "upload_video" }).catch(() => {});
  const f = await tg("getFile", { file_id: v.file_id });
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/${f.file_path}`, { cache: "no-store" });
  if (!res.ok) return say(chat, "Não consegui baixar o vídeo do Telegram.");
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = (f.file_path.split(".").pop() || "mp4").toLowerCase();
  const type = ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : "video/mp4";
  const name = `${Date.now()}.${["mov", "webm"].includes(ext) ? ext : "mp4"}`;
  const { error } = await db().storage.from("reels-videos").upload(name, buf, { contentType: type });
  if (error) return say(chat, `Erro ao guardar o vídeo: ${esc(error.message)}`);
  const { head, fala } = parseReels(cap);
  const modoV = /^\/?shopee\b/i.test(cap) ? "shopee" : /^\/?link\b/i.test(cap) ? "link" : "instagram";
  return startReels(chat, head, fala, name, modoV, modoV === "link" && !fala ? { gerarFala: true } : {});
}

// ---------- aprovação de Reels ----------
async function dispatchWorkflow(file, inputs) {
  const token = (process.env.GITHUB_TOKEN || "").trim();
  if (!token) throw new Error("Falta GITHUB_TOKEN na Vercel");
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${file}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "vitrine-bot" },
    body: JSON.stringify({ ref: "main", inputs }),
    cache: "no-store",
  });
  if (r.status !== 204) {
    let m = await r.text().catch(() => ""); try { m = JSON.parse(m).message || m; } catch {}
    throw new Error(`GitHub ${r.status}: ${String(m).slice(0, 150)}`);
  }
}

async function approveReels(chat, q, data) {
  const [action, id] = data.split(":");
  const { data: r } = await db().from("reels_pendentes").select("id,status,offer_id,ig_url").eq("id", Number(id)).maybeSingle();
  if (!r) return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Não achei esse Reels" });
  const setButton = (text) => q.message?.message_id && tg("editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id,
    reply_markup: { inline_keyboard: [[{ text, callback_data: "noop" }]] } }).catch(() => {});
  if (r.status === "postado") { await setButton("✅ Já postado"); return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Esse já foi postado" }); }
  if (r.status === "postando") return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Já está postando…" });
  if (action === "nopub") {
    await db().from("reels_pendentes").update({ status: "descartado" }).eq("id", r.id);
    await setButton("🗑️ Descartado");
    return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Descartado" });
  }
  try {
    await dispatchWorkflow("publicar-reels.yml", { id: String(r.id) });
  } catch (e) {
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Erro ao postar" });
    return say(chat, `⚠️ ${esc(e.message)}`);
  }
  await db().from("reels_pendentes").update({ status: "postando" }).eq("id", r.id);
  await setButton("⏳ Postando no Instagram…");
  await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Postando! Te aviso aqui quando sair." });
}

// foto do perfil usada na animação "Seguir" do final dos Reels
async function saveAvatar(chat, msg) {
  if (!hasDb()) return say(chat, "Supabase não configurado na Vercel.");
  const doc = msg.document && /^image\//.test(msg.document.mime_type || "") ? msg.document : null;
  const fileId = doc ? doc.file_id : msg.photo?.[msg.photo.length - 1]?.file_id;
  if (!fileId) return say(chat, "Mande uma imagem com a legenda /avatar");
  const f = await tg("getFile", { file_id: fileId });
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/${f.file_path}`, { cache: "no-store" });
  if (!res.ok) return say(chat, "Não consegui baixar a imagem do Telegram.");
  const ext = (f.file_path.split(".").pop() || "jpg").toLowerCase().replace("jpeg", "jpg");
  const { error } = await db().storage.from("capas").upload(`avatar/${Date.now()}.${["png", "webp"].includes(ext) ? ext : "jpg"}`, Buffer.from(await res.arrayBuffer()),
    { contentType: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg" });
  if (error) return say(chat, `Erro ao guardar: ${esc(error.message)}`);
  return say(chat, "✅ Foto do perfil guardada. Ela aparece no final dos próximos Reels, no botão \"Seguir\".");
}

// ---------- Reels "Top N" ----------
// /top 5 coisas que parecem bobas mas facilitam a vida
// 136 Esse organizador acaba com a bagunça
// 137 CJYD2300009 Esse prendedor segura o saco aberto
async function startTop(chat, text) {
  const lines = String(text).split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let title = (lines.shift() || "").replace(/^\/top(@\S+)?/i, "").trim();
  const postar = /\bpostar\b/i.test(title);
  title = title.replace(/\bpostar\b/i, "").trim();
  const looksSku = (a) => /^[A-Za-z0-9_-]{5,60}$/.test(a) && /\d/.test(a) && /[A-Za-z]/.test(a);
  const items = [];
  for (const l of lines) {
    const m = l.match(/^#?(\d+)[\s:.)-]+(.*)$/);
    if (!m) continue;
    const words = m[2].trim().split(/\s+/);
    const sku = words[0] && looksSku(words[0]) ? words.shift().replace(/[^A-Za-z0-9_-]/g, "") : "";
    items.push({ id: Number(m[1]), sku, fala: words.join(" ").slice(0, 300) });
  }
  // só "/top": a IA escolhe o tema e os produtos da vitrine
  if (!title && !items.length) {
    try { await dispatchWorkflow("reels-top.yml", { roteiro: "" }); } catch (e) { return say(chat, `⚠️ ${esc(e.message)}`); }
    return say(chat, "🤖 A IA está escolhendo um tema e 5 produtos da vitrine para um Top. Chega aqui em uns 3 minutos para você aprovar.");
  }
  if (!title || items.length < 2) {
    return say(chat, "Use assim (cada produto numa linha):\n<b>/top 5 coisas que parecem bobas mas facilitam a vida\n136 Esse organizador acaba com a bagunça\n137 Esse prendedor segura o saco aberto\n138 ...</b>\n\nDe 2 a 8 produtos. Pode pôr o SKU da CJ depois do número. Escreva <i>postar</i> no título para postar direto.");
  }
  if (items.length > 8) return say(chat, "No máximo 8 produtos por vídeo.");
  if (hasDb()) {
    const { data } = await db().from("offers").select("id").in("id", items.map((i) => i.id));
    const have = new Set((data || []).map((o) => o.id));
    const miss = items.filter((i) => !have.has(i.id)).map((i) => "#" + i.id);
    if (miss.length) return say(chat, `Não achei na vitrine: ${miss.join(", ")}`);
  }
  const roteiro = JSON.stringify({ title: title.slice(0, 120), items, postar });
  try { await dispatchWorkflow("reels-top.yml", { roteiro }); }
  catch (e) { return say(chat, `⚠️ ${esc(e.message)}`); }
  return say(chat, `🎬 Gerando o Top ${items.length}: <b>${esc(title)}</b>\n${items.map((i, k) => `${k + 1}. #${i.id}${i.sku ? " (vídeo CJ)" : ""}`).join("\n")}\nChega aqui em uns 3 minutos.`);
}

// ---------- vídeos encaminhados do grupo do WhatsApp ----------
async function getModo() {
  const { data } = await db().from("bot_config").select("value").eq("key", "modo_grupo").maybeSingle();
  return ["shopee", "reels", "ambos"].includes(data?.value) ? data.value : "shopee";
}
async function setModo(chat, arg) {
  const v = String(arg || "").toLowerCase().trim();
  if (!["shopee", "reels", "ambos"].includes(v)) return say(chat, `Formato atual dos vídeos encaminhados: <b>${await getModo()}</b>\nUse: /modo shopee · /modo reels · /modo ambos`);
  await db().from("bot_config").upsert({ key: "modo_grupo", value: v, updated_at: new Date().toISOString() });
  return say(chat, `✅ Vídeos encaminhados agora viram: <b>${v === "ambos" ? "Shopee Vídeo + Reels" : v === "reels" ? "Reels do Instagram" : "Shopee Vídeo"}</b>`);
}

async function importGroupVideo(msg, cap, shopeeUrl) {
  const chat = msg.chat.id;
  const v = msg.video || msg.document;
  if ((v.file_size || 0) > 20 * 1024 * 1024) return say(chat, "Esse vídeo passa de 20 MB (limite do Telegram para o bot baixar).");
  if (!hasDb()) return say(chat, "Supabase não configurado na Vercel.");
  await tg("sendChatAction", { chat_id: chat, action: "upload_video" }).catch(() => {});

  // 1) produto com o SEU link de afiliado (o link do grupo é de outra pessoa)
  let info;
  try { info = await importFromUrl(shopeeUrl, { forceOwnLink: true, subId: "grupo" }); }
  catch { return identifyGroupVideo(msg, cap); }
  // link curto que leva a um vídeo (não a um produto): tenta identificar pela imagem
  if (!info?.title || !info?.item_id) return identifyGroupVideo(msg, cap);

  // não duplica: se o produto já está na vitrine, usa o mesmo número
  let offerId;
  const { data: dup } = await db().from("offers").select("id").eq("description", `grupo:${info.shop_id}:${info.item_id}`).eq("active", true).limit(1);
  if (dup?.length) offerId = dup[0].id;
  else {
    const dias = Number(process.env.DIAS_NA_VITRINE || 15);
    const { data: row, error } = await db().from("offers").insert({
      kind: "produto", title: String(info.title).slice(0, 120), description: `grupo:${info.shop_id}:${info.item_id}`,
      image_url: info.image_url, price: info.price, original_price: info.original_price, link: info.link,
      platform: "shopee", active: true, expires_at: dias > 0 ? new Date(Date.now() + dias * 86400000).toISOString() : null,
    }).select("id").single();
    if (error) return say(chat, `Erro ao gravar na vitrine: ${esc(error.message)}`);
    offerId = row.id;
  }

  // 2) guarda o vídeo
  const f = await tg("getFile", { file_id: v.file_id });
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/${f.file_path}`, { cache: "no-store" });
  if (!res.ok) return say(chat, "Não consegui baixar o vídeo do Telegram.");
  const name = `${Date.now()}.mp4`;
  const { error: upErr } = await db().storage.from("reels-videos").upload(name, Buffer.from(await res.arrayBuffer()), { contentType: "video/mp4" });
  if (upErr) return say(chat, `Erro ao guardar o vídeo: ${esc(upErr.message)}`);

  // 3) gera o(s) vídeo(s) com narração criada a partir do produto e do texto do grupo
  const modo = await getModo();
  const contexto = cap.replace(shopeeUrl, "").trim();
  const extra = { gerarFala: true, contexto };
  const modos = modo === "ambos" ? ["shopee", "instagram"] : [modo === "reels" ? "instagram" : "shopee"];
  for (const m of modos) await startReels(chat, [String(offerId)], "", name, m, extra);
  return say(chat, `📥 <b>#${offerId}</b> ${esc(String(info.title).slice(0, 80))}\n${info.price ? `💰 ${brl(info.price)} · ` : ""}${info.commission ? `💸 ${info.commission}%` : ""}\n🔗 seu link: ${esc(info.link)}`);
}

// ---------- vídeo do grupo sem link de produto: identificação pela IA ----------
const isVideoLink = (u) => Boolean(u) && /sv\.shopee|share-video|universal-link/i.test(decodeURIComponent(u));

async function saveTelegramVideo(v) {
  const f = await tg("getFile", { file_id: v.file_id });
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/${f.file_path}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Não consegui baixar o vídeo do Telegram.");
  const name = `${Date.now()}.mp4`;
  const { error } = await db().storage.from("reels-videos").upload(name, Buffer.from(await res.arrayBuffer()), { contentType: "video/mp4" });
  if (error) throw new Error(`Erro ao guardar o vídeo: ${error.message}`);
  return name;
}

// O link do Shopee Vídeo não abre o vídeo para navegador comum, mas entrega a página com o .mp4
// para leitores de prévia de link. O Telegram baixa o .mp4 direto pela URL.
async function shopeeVideoMp4(link) {
  for (const ua of ["facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "TelegramBot (like TwitterBot)"]) {
    try {
      const r = await fetch(link, { headers: { "User-Agent": ua, "Accept-Language": "pt-BR" }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(8000) });
      const h = await r.text();
      const mp4 = (h.match(/https?:[^"'\s\\]+?\.mp4[^"'\s\\<]*/) || [])[0];
      if (mp4) return mp4.replace(/&amp;/g, "&");
    } catch { /* tenta o próximo */ }
  }
  return null;
}

// segue os redirecionamentos do link curto (s.shopee.com.br/xxx) para saber se é vídeo ou produto
async function destinoShopee(link) {
  const chain = [link];
  let cur = link;
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(cur, { redirect: "manual", headers: { "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" }, cache: "no-store", signal: AbortSignal.timeout(5000) });
      const loc = r.headers.get("location");
      if (!(r.status >= 300 && r.status < 400 && loc)) break;
      cur = new URL(loc, cur).toString();
      chain.push(cur);
    } catch { break; }
  }
  return chain;
}

// link da Shopee colado sozinho: vídeo → baixa e identifica; produto → mostra com o botão de vitrine
async function linkShopee(msg, text, link) {
  const chat = msg.chat.id;
  const chain = isVideoLink(link) ? [link] : await destinoShopee(link);
  if (chain.some(isVideoLink)) return baixarShopeeVideo(msg, text, link);
  const ids = chain.map(parseShopeeIds).find(Boolean);
  if (ids && hasShopeeApi()) {
    const raw = await shopeeProduct(ids).catch(() => null);
    if (raw) {
      const p = normalize(raw);
      return tg("sendPhoto", { chat_id: chat, photo: p.imageUrl, parse_mode: "HTML",
        caption: `🛍️ <b>${esc(p.name.slice(0, 150))}</b>\n💰 ${brl(p.price)}${p.commission ? ` · 💸 ${pct(p.commission)}` : ""}${p.sales ? ` · 🛒 ${p.sales}` : ""}`,
        reply_markup: { inline_keyboard: [[{ text: "➕ Colocar na vitrine", callback_data: `add:${p.shopId}:${p.itemId}` }]] } });
    }
  }
  return say(chat, "Não reconheci esse link da Shopee. Se for vídeo, baixe pelo app e encaminhe aqui; se for produto, use o link do produto (Compartilhar → Copiar link).");
}

async function baixarShopeeVideo(msg, text, link) {
  const chat = msg.chat.id;
  await tg("sendChatAction", { chat_id: chat, action: "upload_video" }).catch(() => {});
  const mp4 = await shopeeVideoMp4(link);
  if (!mp4) return say(chat, "⚠️ Não consegui pegar o vídeo desse link. Baixe pelo app (Compartilhar → Baixar) e encaminhe o vídeo aqui.");
  let sent;
  try {
    sent = await tg("sendVideo", { chat_id: chat, video: mp4, caption: "🎥 Vídeo do Shopee Vídeo baixado. Agora vou identificar o produto…", supports_streaming: true });
  } catch {
    // o Telegram não conseguiu baixar sozinho: baixa aqui e envia o arquivo
    try {
      const r = await fetch(mp4, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      const form = new FormData();
      form.append("chat_id", String(chat));
      form.append("caption", "🎥 Vídeo do Shopee Vídeo baixado. Agora vou identificar o produto…");
      form.append("video", new Blob([await r.arrayBuffer()], { type: "video/mp4" }), "shopee-video.mp4");
      const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/sendVideo`, { method: "POST", body: form });
      const j = await res.json();
      if (!j.ok) throw new Error(j.description);
      sent = j.result;
    } catch (e) { return say(chat, `⚠️ Achei o vídeo mas não consegui baixar (${esc(e.message)}).\nLink direto: ${esc(mp4)}`); }
  }
  const v = sent.video || sent.document;
  if (!v) return say(chat, "Baixei, mas o Telegram não devolveu o vídeo.");
  // segue o mesmo caminho de um vídeo encaminhado de grupo: identifica o produto, você confirma e ele gera o vídeo
  return identifyGroupVideo({ chat: msg.chat, video: v }, text.replace(/^\/baixar\S*/i, ""));
}

async function identifyGroupVideo(msg, cap) {
  const chat = msg.chat.id;
  const v = msg.video || msg.document;
  if ((v.file_size || 0) > 20 * 1024 * 1024) return say(chat, "Esse vídeo passa de 20 MB (limite do Telegram para o bot baixar).");
  if (!hasDb()) return say(chat, "Supabase não configurado na Vercel.");
  let name;
  try { name = await saveTelegramVideo(v); } catch (e) { return say(chat, esc(e.message)); }
  const contexto = String(cap || "").replace(/https?:\/\/\S+/g, "").trim().slice(0, 900);
  const { data: row, error } = await db().from("grupo_pendentes").insert({ video: name, contexto }).select("id").single();
  if (error) return say(chat, `Erro: ${esc(error.message)}`);
  try { await dispatchWorkflow("identificar.yml", { id: String(row.id) }); }
  catch (e) { return say(chat, `⚠️ ${esc(e.message)}`); }
  return say(chat, "🔎 Esse link é de vídeo (não do produto). Vou identificar o produto pela imagem e te mando as opções em ~1 minuto.");
}

async function chooseGroupProduct(chat, q, data) {
  const [action, id, k] = data.split(":");
  const { data: row } = await db().from("grupo_pendentes").select("*").eq("id", Number(id)).maybeSingle();
  if (!row) return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Não achei esse vídeo" });
  if (row.status === "feito") return tg("answerCallbackQuery", { callback_query_id: q.id, text: `Já escolhido (#${row.offer_id})` });
  if (action === "gpx") {
    await db().from("grupo_pendentes").update({ status: "nenhum" }).eq("id", row.id);
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Descartado" });
    return say(chat, "Ok, descartei. Se souber o produto, mande o vídeo de novo com o link do PRODUTO (no app: toque no produto do vídeo → Compartilhar → Copiar link).");
  }
  const p = (row.candidatos || [])[Number(k)];
  if (!p) return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Opção inválida" });
  await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Boa! Gerando o vídeo…" });

  // produto na vitrine com o SEU link
  let offerId;
  const key = `grupo:${p.shopId}:${p.itemId}`;
  const { data: dup } = await db().from("offers").select("id").eq("description", key).eq("active", true).limit(1);
  if (dup?.length) offerId = dup[0].id;
  else {
    let link = p.offerLink;
    try { link = (await shopeeShortLinkSub(p.productLink || p.offerLink, "grupo")) || link; } catch {}
    const dias = Number(process.env.DIAS_NA_VITRINE || 15);
    const { data: ins, error } = await db().from("offers").insert({
      kind: "produto", title: String(p.name).slice(0, 120), description: key, image_url: p.imageUrl, price: p.price || null,
      original_price: p.originalPrice || null, link, platform: "shopee", active: true,
      expires_at: dias > 0 ? new Date(Date.now() + dias * 86400000).toISOString() : null,
    }).select("id").single();
    if (error) return say(chat, `Erro ao gravar na vitrine: ${esc(error.message)}`);
    offerId = ins.id;
  }
  await db().from("grupo_pendentes").update({ status: "feito", offer_id: offerId }).eq("id", row.id);
  if (q.message?.message_id) {
    await tg("editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: `✅ Escolhido · #${offerId}`, callback_data: "noop" }]] } }).catch(() => {});
  }
  const modo = await getModo();
  const modos = modo === "ambos" ? ["shopee", "instagram"] : [modo === "reels" ? "instagram" : "shopee"];
  for (const m of modos) await startReels(chat, [String(offerId)], "", row.video, m, { gerarFala: true, contexto: [row.descricao, row.contexto].filter(Boolean).join(". ") });
}

// ---------- grupos/canais do Telegram onde o bot está ----------
// O bot NUNCA responde dentro do grupo: tudo vai para o seu chat. Só lê os grupos listados em TELEGRAM_GRUPOS.
const grupos = () => (process.env.TELEGRAM_GRUPOS || "").split(/[\s,;]+/).filter(Boolean);
const SHOPEE_RE = /https?:\/\/(?:s\.shopee\.com\.br|shope\.ee|shp\.ee|sv\.shopee\.com\.br|(?:www\.)?shopee\.com\.br)\/[^\s)>\]]+/i;

async function onGroup(m) {
  const gid = String(m.chat.id);
  const owner = allowedChat();
  // "/grupoid" mandado por você dentro do grupo: o bot te conta (no privado) o número do grupo
  if (/^\/grupoid\b/i.test(m.text || "") && m.from && isAllowed(m.from.id)) {
    return say(owner, `Grupo "<b>${esc(m.chat.title || "")}</b>": <code>${gid}</code>\nPara o bot ler esse grupo, coloque esse número na variável <b>TELEGRAM_GRUPOS</b> da Vercel e faça o Redeploy.`);
  }
  if (!grupos().includes(gid) || !owner || !hasDb()) return; // grupo não liberado: ignora em silêncio
  const asOwner = { ...m, chat: { id: Number(owner), type: "private" } }; // respostas vão para você
  const isVid = m.video || /^video\//.test(m.document?.mime_type || "");
  const text = (m.caption || m.text || "").trim();
  const url = (text.match(SHOPEE_RE) || [])[0];
  const key = `video_pendente_${gid}`;
  if (isVid) {
    if (url) return isVideoLink(url) ? identifyGroupVideo(asOwner, text) : importGroupVideo(asOwner, text, url);
    const v = m.video || m.document;
    await db().from("bot_config").upsert({ key, value: JSON.stringify({ file_id: v.file_id, file_size: v.file_size || 0, at: Date.now() }), updated_at: new Date().toISOString() });
    return; // espera a mensagem com o link
  }
  if (url) {
    const { data: pend } = await db().from("bot_config").select("value").eq("key", key).maybeSingle();
    let pv = null; try { pv = JSON.parse(pend?.value || "null"); } catch {}
    if (pv && Date.now() - pv.at < 10 * 60000) {
      await db().from("bot_config").delete().eq("key", key);
      const fake = { chat: asOwner.chat, video: { file_id: pv.file_id, file_size: pv.file_size } };
      return isVideoLink(url) ? identifyGroupVideo(fake, text) : importGroupVideo(fake, text, url);
    }
  }
}
