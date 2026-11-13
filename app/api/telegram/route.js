import { isAdmin, unauthorized } from "@/lib/auth";
import { importFromUrl } from "@/lib/importer";
import { AMAZON_RE as AMZ_RE, amazonProduct } from "@/lib/amazon";
import { SHEIN_RE, isShein, sheinProduct } from "@/lib/shein";
import { ALI_RE, isAli, aliProduct } from "@/lib/aliexpress";
// links de lojas sem API (Amazon e Shein): mesmo caminho, final genérico nos vídeos
const AMAZON_RE = new RegExp(`${AMZ_RE.source}|${SHEIN_RE.source}|${ALI_RE.source}`, "i");
const lojaNome = (u) => (isShein(u) ? "Shein" : isAli(u) ? "AliExpress" : "Amazon");
import { db, hasDb } from "@/lib/supabase";
import { relatorioImagem } from "@/lib/relatorioImg";
import { hasShopeeApi, parseShopeeIds, shopeeConversions, shopeeProduct, shopeeSearch, shopeeShops, shopeeShortLinkSub } from "@/lib/shopee";
import { allowedChat, brl, CAT_ALIAS, CATEGORIAS, commissionLine, esc, hasBot, normalize, pct, score, tg, webhookSecret } from "@/lib/telegramBot";
import GANCHOS from "@/automacao/capas/ganchos.json";
import { BRAND } from "@/lib/brand.mjs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const POR_BUSCA = 5;
const MIN_NOTA = 4.5;
const MIN_VENDAS = 20;
const SUB_ID = "bot"; // vira "botsite"
const VITRINE = () => BRAND.site;

const AJUDA = `🤖 <b>Bot de ofertas</b>

<b>/buscar</b> fone bluetooth → produtos de maior comissão (com vendas e nota boas)
<b>/comissao</b> fone bluetooth → só pela maior comissão, mesmo com poucas vendas
<b>/categoria</b> motos → os melhores da categoria
<b>/reels</b> 105 SKU-da-CJ texto: sua narração → gera o Reels do produto #105 com o vídeo real da CJ (chega aqui em ~3 min). Sem SKU usa só a foto. Acrescente <i>postar</i> para já postar no Instagram.
<b>/shopee</b> 131 SKU-da-CJ narração → mesmo vídeo, mas para o <b>Shopee Vídeo</b>: o final chama para tocar no produto vinculado (sem "seguir" nem "link na bio"). Também vale como legenda de um vídeo seu.
🖼️ <b>Fotos → vídeo</b>: mande várias fotos de uma vez (álbum) com o link do produto na legenda (Shopee, Amazon ou Shein) ou com <b>/link 227</b>. Vira vídeo com zoom nas fotos, narração e o final.
📌 <b>Link do Pinterest</b>: cole o link de um pin de vídeo (pin.it/…) e o bot devolve o vídeo baixado.
🎥 <b>Link do Shopee Vídeo</b>: cole o link (Compartilhar → Copiar link) e o bot baixa o vídeo, identifica o produto e gera o seu vídeo.
📲 <b>Vídeos de grupos</b>: encaminhe o vídeo com o texto (que tem o link da Shopee). Num grupo do Telegram onde o bot está, mande /grupoid lá dentro para liberar a leitura automática. O bot põe o produto na vitrine com o SEU link, cria a narração e gera o vídeo.
<b>/modo</b> shopee | reels | ambos → formato dos vídeos encaminhados
🎞️ <b>/formato</b> mascara | cheio | alternar → formato padrão dos vídeos (máscara = headline em cima, vídeo no meio, chamada embaixo). Para um vídeo só, escreva <i>mascara</i>, <i>cheio</i> ou <i>limpo</i> (só o vídeo com a narração) no comando ou na legenda do vídeo/fotos: <b>/reels 227 mascara</b>
<b>/top</b> sozinho → a IA escolhe tema e produtos. Ou: título na 1ª linha e, em cada linha de baixo, "136 narração" → Reels com vários produtos (ex.: 5 coisas que facilitam a vida)
🛒 <b>Amazon / Shein / AliExpress</b>: cole o seu link de afiliado (amzn.to/…, onelink.shein.com/…, s.click.aliexpress.com/…) e o produto entra na vitrine com a etiqueta da loja. Na AliExpress, mande as fotos ou o vídeo com o link na legenda (a IA identifica o produto). Mande um <b>vídeo</b> com o link na legenda e ele gera o vídeo com final "clica no link aqui embaixo", sem citar a loja.
<b>/link</b> 227 → vídeo com final genérico de um produto que já está na vitrine (com a foto; mande um vídeo com essa legenda para usar o vídeo)
📊 <b>/relatorio</b> → vendas, comissão e cliques de hoje (ou /relatorio ontem, /relatorio 7, /relatorio 30)
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
    { command: "relatorio", description: "Vendas, comissão e cliques (hoje, 7 ou 30 dias)" },
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
    const url = (text.match(/https?:\/\/(?:s\.shopee\.com\.br|(?:[a-z]{2,3}\.)?shope\.ee|(?:[a-z]{2,3}\.)?shp\.ee|(?:www\.)?shopee\.com\.br)\/[^\s)>\]]+/i) || [])[0] || (text.match(AMAZON_RE) || [])[0];
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
  // link do Pinterest: baixa o vídeo do pin e devolve aqui
  const pin = (text.match(PIN_RE) || [])[0];
  if (pin && !text.startsWith("/")) return baixarPinterest(chat, pin);
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
  if (cmd === "formato") return setFormato(chat, arg);
  if (cmd === "relatorio" || cmd === "relatório" || cmd === "vendas") return relatorio(chat, arg);
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
  if (data.startsWith("yt:")) return postYouTube(chat, q, data);
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
  // várias fotos (álbum) ou foto com link/comando: vira vídeo do produto
  if (!/^\/?capas?\b/i.test(cap) && (msg.media_group_id || SHOPEE_RE.test(cap) || AMAZON_RE.test(cap) || /^\/?(reels|shopee|link)\b/i.test(cap))) return fotosProduto(msg, cap);
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

// ---------- fotos do produto -> vídeo ----------
// Mande várias fotos de uma vez (álbum) com o link do produto (Shopee, Amazon ou Shein) na legenda,
// ou "/link 227", "/shopee 227", "/reels 227". As fotos sem legenda do mesmo álbum só são guardadas.
async function fotosProduto(msg, cap) {
  const chat = msg.chat.id;
  if (!hasDb()) return say(chat, "Supabase não configurado na Vercel.");
  const grupo = msg.media_group_id || `m${msg.message_id}`;
  const pasta = `fotos/${grupo}`;
  const doc = msg.document && /^image\//.test(msg.document.mime_type || "") ? msg.document : null;
  const fileId = doc ? doc.file_id : msg.photo?.[msg.photo.length - 1]?.file_id;
  if (fileId) {
    try {
      const f = await tg("getFile", { file_id: fileId });
      const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/${f.file_path}`, { cache: "no-store" });
      const ext = (f.file_path.split(".").pop() || "jpg").toLowerCase().replace("jpeg", "jpg");
      await db().storage.from("reels-videos").upload(`${pasta}/${String(msg.message_id).padStart(12, "0")}.${["png", "webp"].includes(ext) ? ext : "jpg"}`, Buffer.from(await res.arrayBuffer()), { contentType: ext === "png" ? "image/png" : "image/jpeg", upsert: true });
    } catch (e) { if (cap) return say(chat, `Erro ao guardar a foto: ${esc(e.message)}`); }
  }
  if (!cap) return; // demais fotos do álbum: só guarda

  await tg("sendChatAction", { chat_id: chat, action: "upload_video" }).catch(() => {});
  // 1) comando com o número da vitrine
  const cm = cap.match(/^\/?(reels|shopee|link)\b/i);
  if (cm) {
    const { head, fala } = parseReels(cap);
    const modo = cm[1].toLowerCase() === "reels" ? "instagram" : cm[1].toLowerCase();
    return startReels(chat, head, fala, "", modo, { fotos: pasta, ...(fala ? {} : { gerarFala: true }) });
  }
  // 2) link de loja sem API (Amazon / Shein): final genérico
  const loja = (cap.match(AMAZON_RE) || [])[0];
  if (loja) {
    const resto = cap.replace(loja, "").trim();
    const r = await addAmazon(loja, /\|/.test(resto) ? resto : "", { provisorio: true });
    if (r.erro) return say(chat, r.erro);
    await say(chat, `📥 <b>${lojaNome(loja)} #${r.id}</b> ${esc(String(r.a.title).slice(0, 80))}${r.dup ? " (já estava na vitrine)" : ""}\n🔗 ${esc(r.a.link)}`);
    return startReels(chat, [String(r.id)], "", "", "link", { fotos: pasta, gerarFala: true, contexto: /\|/.test(resto) ? "" : resto });
  }
  // 3) link da Shopee: produto com o SEU link e o modo escolhido em /modo
  const url = (cap.match(SHOPEE_RE) || [])[0];
  if (url) {
    let info;
    try { info = await importFromUrl(url, { forceOwnLink: true, subId: "fotos" }); } catch (e) { return say(chat, `Não consegui ler o produto: ${esc(e.message)}`); }
    if (!info?.title || !info?.item_id) return say(chat, "Não reconheci o produto desse link. Use o link do PRODUTO (no app: produto → Compartilhar → Copiar link).");
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
    const modo = await getModo();
    const modos = modo === "ambos" ? ["shopee", "instagram"] : [modo === "reels" ? "instagram" : "shopee"];
    await say(chat, `📥 <b>#${offerId}</b> ${esc(String(info.title).slice(0, 80))}\n🔗 seu link: ${esc(info.link)}`);
    for (const m of modos) await startReels(chat, [String(offerId)], "", "", m, { fotos: pasta, gerarFala: true, contexto: cap.replace(url, "").trim() });
    return;
  }
  return say(chat, "Para virar vídeo, mande as fotos com o link do produto na legenda (Shopee, Amazon ou Shein) ou com <b>/link 227</b>.");
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
  await say(chat, `🔎 Lendo o produto na ${lojaNome(url)}...`);
  const r = await addAmazon(url, resto);
  if (r.erro) return say(chat, r.erro);
  const { a, id, dias, dup } = r;
  if (dup) return say(chat, `Já está na vitrine como <b>#${id}</b>.`);
  const preco = a.price ? `R$ ${a.price.toFixed(2).replace(".", ",")}` : "sem preço (o cliente vê no link)";
  const faltou = [!a.image_url && "foto"].filter(Boolean);
  const msg = [
    `✅ <b>${lojaNome(url)}</b> na vitrine como <b>#${id}</b> (sai em ${dias} dias)`,
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
async function addAmazon(url, resto = "", { provisorio = false } = {}) {
  const shein = isShein(url), ali = isAli(url);
  const a = shein ? await sheinProduct(url) : ali ? await aliProduct(url) : await amazonProduct(url);
  const [precoTxt, ...nomeTxt] = String(resto).split("|").map((x) => x.trim());
  const precoManual = Number(String(precoTxt || "").replace(/[^\d,]/g, "").replace(",", "."));
  if (nomeTxt.join(" ").trim() && isFinite(precoManual) && precoManual > 0) a.price = precoManual;
  if (nomeTxt.join(" ").trim()) a.title = nomeTxt.join(" ").trim();
  // vídeo/fotos junto: entra com nome provisório e a IA troca pelo nome certo olhando as imagens
  if (!a.title && provisorio) a.title = `Achado da ${shein ? "Shein" : ali ? "AliExpress" : "Amazon"}`;
  if (!a.title && ali) return { erro: "⚠️ A AliExpress não deixa ler o produto pelo link. Mande as <b>fotos ou o vídeo</b> do produto com o link na legenda (a IA identifica pelas imagens), ou o texto assim: <b>link | nome do produto</b>." };
  if (!a.title) return { erro: shein ? "⚠️ Esse link da Shein não trouxe o nome do produto (às vezes é link de promoção). Mande de novo assim: <b>link | nome do produto</b>, ou mande as <b>fotos</b> do produto com o link na legenda que a IA identifica pelas fotos." : AMAZON_BLOQUEOU };
  const dias = Number(process.env.DIAS_NA_VITRINE || 15);
  const desc = shein ? (a.goods_id && !a.generico ? `shein:${a.goods_id}` : null) : ali ? (a.ali_id ? `ali:${a.ali_id}` : null) : a.asin ? `amazon:${a.asin}` : null;
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
    platform: shein ? "shein" : ali ? "aliexpress" : "amazon",
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
  const r = await addAmazon(url, manual, { provisorio: true });
  if (r.erro) return say(chat, `${r.erro}\n(junto com o vídeo, na legenda)`);
  const f = await tg("getFile", { file_id: v.file_id });
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/${f.file_path}`, { cache: "no-store" });
  if (!res.ok) return say(chat, "Não consegui baixar o vídeo do Telegram.");
  const name = `${Date.now()}.mp4`;
  const { error: upErr } = await db().storage.from("reels-videos").upload(name, Buffer.from(await res.arrayBuffer()), { contentType: "video/mp4" });
  if (upErr) return say(chat, `Erro ao guardar o vídeo: ${esc(upErr.message)}`);
  await say(chat, `📥 <b>${lojaNome(url)} #${r.id}</b> ${esc(String(r.a.title).slice(0, 80))}${r.dup ? " (já estava na vitrine)" : ""}\n${r.a.price ? `💰 ${brl(r.a.price)}\n` : ""}🔗 ${esc(r.a.link)}`);
  return startReels(chat, [String(r.id)], "", name, "link", { gerarFala: true, contexto: manual ? "" : resto });
}

// ---------- Reels sob encomenda: dispara o workflow "Reels v2" no GitHub ----------
const REPO = BRAND.repo;
async function startReels(chat, parts, fala = "", video = "", modo = "instagram", extra = {}) {
  const args = parts.filter(Boolean);
  const num = (args.find((a) => /^#?\d+$/.test(a)) || "").replace("#", "");
  const postar = args.some((a) => /^postar$/i.test(a));
  // formato do vídeo: "mascara" (headline em cima, vídeo no meio, chamada embaixo) ou "cheio"; sem nada, sorteia
  // ordem: palavra no comando > palavra na legenda do vídeo/fotos (vem no contexto) > /formato
  const ctxLayout = (String(extra.contexto || "").match(LAYOUT_RE) || [])[1] || "";
  if (ctxLayout) extra = { ...extra, contexto: String(extra.contexto).replace(LAYOUT_RE, " ").trim() };
  const layout = args.some((a) => /^m[aá]scara$/i.test(a)) ? "mascara" : args.some((a) => /^cheio$/i.test(a)) ? "cheio" : args.some((a) => /^limpo$/i.test(a)) ? "limpo"
    : ctxLayout ? (/^cheio$/i.test(ctxLayout) ? "cheio" : /^limpo$/i.test(ctxLayout) ? "limpo" : "mascara") : await getFormato();
  // depois do número: SKU da CJ (tem letras e números, ex.: CJYD2300009) e, sem "texto:", o resto vira narração
  const rest = args.filter((a) => a.replace("#", "") !== num && !/^postar$/i.test(a) && !/^(m[aá]scara|cheio|limpo)$/i.test(a));
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
    body: JSON.stringify({ ref: "main", inputs: { oferta: num, cj_sku: sku, fala, video, modo: layout ? `${modo}+${layout}` : modo, ...(extra.fotos ? { fotos: extra.fotos } : {}), ...(extra.gerarFala ? { gerar_fala: "1", contexto: String(extra.contexto || "").slice(0, 900) } : {}), ...(postar ? { postar: "true" } : {}) } }),
    cache: "no-store",
  });
  if (r.status !== 204) {
    const t = await r.text().catch(() => "");
    let msg = t; try { msg = JSON.parse(t).message || t; } catch {}
    return say(chat, `⚠️ O GitHub recusou (${r.status}): <i>${esc(String(msg).slice(0, 200))}</i>\n${r.status === 403 || r.status === 401 || r.status === 404 ? `Confira o GITHUB_TOKEN da Vercel: precisa ter acesso ao repositório ${REPO} com a permissão Actions: Read and write.` : ""}`);
  }
  if (extra.fotos) return say(chat, `🖼️ Gerando o vídeo do <b>#${num}</b> com as suas fotos${modo === "link" ? " e final genérico (clique no link abaixo)" : modo === "shopee" ? " para o Shopee Vídeo" : " para o Reels"}. Chega aqui em uns 3 minutos.`);
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
  const shopeeUrl = (cap.match(/https?:\/\/(?:s\.shopee\.com\.br|(?:[a-z]{2,3}\.)?shope\.ee|(?:[a-z]{2,3}\.)?shp\.ee|(?:www\.)?shopee\.com\.br)\/[^\s)>\]]+/i) || [])[0];
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

// botão "▶️ Postar no YouTube": manda só o Short (o Instagram continua com os botões dele)
async function postYouTube(chat, q, data) {
  const id = Number(data.split(":")[1]);
  const { data: r } = await db().from("reels_pendentes").select("id,status").eq("id", id).maybeSingle();
  if (!r) return tg("answerCallbackQuery", { callback_query_id: q.id, text: "Não achei esse vídeo" });
  try {
    await dispatchWorkflow("publicar-reels.yml", { id: String(r.id), so_youtube: "true" });
  } catch (e) {
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Erro ao postar no YouTube" });
    return say(chat, `⚠️ ${esc(e.message)}`);
  }
  const rows = (q.message?.reply_markup?.inline_keyboard || []).map((row) => row.map((b) => (b.callback_data || "").startsWith("yt:") ? { text: "⏳ Enviando ao YouTube…", callback_data: "noop" } : b));
  if (q.message?.message_id && rows.length) await tg("editMessageReplyMarkup", { chat_id: chat, message_id: q.message.message_id, reply_markup: { inline_keyboard: rows } }).catch(() => {});
  await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Enviando pro YouTube! Te aviso aqui com o link." });
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
// formato padrão dos vídeos: máscara, tela cheia ou alternar (sorteio)
const LAYOUT_RE = /(?:^|\s)(m[aá]scara|cheio|limpo)(?=\s|$)/i;
async function getFormato() {
  if (!hasDb()) return "";
  const { data } = await db().from("bot_config").select("value").eq("key", "formato").maybeSingle();
  return ["mascara", "cheio", "limpo"].includes(data?.value) ? data.value : "";
}
async function setFormato(chat, arg) {
  const v = String(arg || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (!["mascara", "cheio", "limpo", "alternar"].includes(v)) return say(chat, `Formato atual dos vídeos: <b>${(await getFormato()) || "alternar"}</b>\nUse: /formato mascara · /formato cheio · /formato limpo · /formato alternar`);
  await db().from("bot_config").upsert({ key: "formato", value: v, updated_at: new Date().toISOString() });
  return say(chat, `✅ Daqui pra frente os vídeos saem: <b>${v === "mascara" ? "sempre com máscara" : v === "cheio" ? "sempre em tela cheia" : v === "limpo" ? "sempre limpos (só o vídeo com narração)" : "alternando entre tela cheia e máscara"}</b>\n(Para um vídeo só, escreva <i>mascara</i> ou <i>cheio</i> no comando ou na legenda.)`);
}

// ---------- relatório: vendas da Shopee (API de afiliado) + cliques do site ----------
const ORIGENS = { site: "Site (link na bio)", achadosite: "Achado do dia", botsite: "Bot", reelssite: "Reels automático", canalsite: "Canal Telegram",
  gruposite: "Vídeos de grupo", fotossite: "Fotos → vídeo", lojasite: "Lojas", kitsite: "Kit", campanhasite: "Campanhas", catsite: "Categorias", bio: "Site (link na bio)" };
function origemDe(n) {
  const sub = String(n.utmContent || "").split("-")[0].trim();
  if (sub) return ORIGENS[sub] || sub;
  const ref = String(n.referrer || "");
  if (/shopeevideo/i.test(ref)) return "Shopee Vídeo";
  if (/live/i.test(ref)) return "Live";
  return ref ? `Outros (${ref})` : "Outros";
}
async function relatorio(chat, arg) {
  const ontem = /ontem/i.test(String(arg));
  const dias = ontem ? 1 : Math.max(1, Math.min(30, Number(String(arg).match(/\d+/)?.[0]) || 1));
  // início do dia em Brasília
  const agora = Math.floor(Date.now() / 1000);
  const hojeBR = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const inicioHoje = agora - (hojeBR.getHours() * 3600 + hojeBR.getMinutes() * 60 + hojeBR.getSeconds());
  const inicio = ontem ? inicioHoje - 86400 : inicioHoje - (dias - 1) * 86400;
  const fim = ontem ? inicioHoje - 1 : agora;
  await tg("sendChatAction", { chat_id: chat, action: "typing" }).catch(() => {});
  let conv = [], erro = "";
  try { conv = await shopeeConversions(inicio, fim); } catch (e) { erro = e.message; }
  let pedidos = 0, cancelados = 0, comissao = 0, concluida = 0;
  const porOrigem = new Map(), porProduto = new Map();
  for (const n of conv) {
    const st = (n.orders || []).map((o) => o.orderStatus);
    const cancel = st.length && st.every((x) => x === "CANCELLED");
    if (cancel) { cancelados++; continue; }
    pedidos++;
    const c = Number(n.totalCommission) || 0;
    comissao += c;
    if (st.includes("COMPLETED")) concluida += c;
    const o = origemDe(n);
    const po = porOrigem.get(o) || { n: 0, c: 0 }; po.n++; po.c += c; porOrigem.set(o, po);
    for (const ord of n.orders || []) for (const it of ord.items || []) {
      if (!it.qty) continue;
      const k = it.itemName || String(it.itemId);
      const pp = porProduto.get(k) || { n: 0, c: 0 }; pp.n += it.qty; pp.c += Number(it.itemTotalCommission) || 0; porProduto.set(k, pp);
    }
  }
  // cliques do site no mesmo período
  let cliques = 0, topCliques = [], maisClicados = [];
  if (hasDb()) {
    const desde = new Date(inicio * 1000).toISOString();
    const ate = new Date(fim * 1000).toISOString();
    const { count } = await db().from("click_events").select("id", { count: "exact", head: true }).gte("created_at", desde).lte("created_at", ate);
    cliques = count || 0;
    const { data: ev } = await db().from("click_events").select("offer_id").gte("created_at", desde).lte("created_at", ate).not("offer_id", "is", null).limit(5000);
    const m = new Map(); for (const e of ev || []) m.set(e.offer_id, (m.get(e.offer_id) || 0) + 1);
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length) {
      const { data: of } = await db().from("offers").select("id,title").in("id", top.map(([id]) => id));
      maisClicados = top.map(([id, n]) => ({ id, n, titulo: String(of?.find((o) => o.id === id)?.title || "") }));
      topCliques = maisClicados.map((m) => `#${m.id} ${esc(m.titulo.slice(0, 38))} · ${m.n}`);
    }
  }
  const periodo = ontem ? "ontem" : dias === 1 ? "hoje" : `últimos ${dias} dias (contando hoje)`;
  const linhas = [
    `📊 <b>Relatório (${periodo})</b>`,
    "",
    `🛒 Pedidos: <b>${pedidos}</b>${cancelados ? ` (+${cancelados} cancelados)` : ""}`,
    `💰 Comissão estimada: <b>${brl(comissao)}</b>${concluida ? ` · concluída: ${brl(concluida)}` : ""}`,
    `👆 Cliques no site: <b>${cliques}</b>`,
  ];
  if (porOrigem.size) {
    linhas.push("", "<b>De onde vieram as vendas</b>");
    for (const [o, v] of [...porOrigem.entries()].sort((a, b) => b[1].c - a[1].c)) linhas.push(`• ${esc(o)}: ${v.n} pedido${v.n > 1 ? "s" : ""} · ${brl(v.c)}`);
  }
  if (porProduto.size) {
    linhas.push("", "<b>Produtos que mais venderam</b>");
    for (const [k, v] of [...porProduto.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5)) linhas.push(`• ${esc(k.slice(0, 45))} · ${v.n}x · ${brl(v.c)}`);
  }
  if (topCliques.length) linhas.push("", "<b>Mais clicados no site</b>", ...topCliques.map((t) => `• ${t}`));
  if (erro) linhas.push("", `⚠️ Shopee: ${esc(erro.slice(0, 150))}`);
  linhas.push("", "<i>A Shopee leva um tempo para mostrar as vendas e a comissão só é confirmada quando o pedido é concluído.</i>", "Outros períodos: /relatorio ontem · /relatorio 7 · /relatorio 30");
  // versão em imagem (mais fácil de ler); se falhar, vai o texto
  try {
    const fmt = (t) => new Date(t * 1000).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
    const img = await relatorioImagem({
      periodo: ontem ? "ontem" : dias === 1 ? "hoje" : `${dias} dias`,
      intervalo: fmt(inicio) === fmt(fim) ? fmt(inicio) : `${fmt(inicio)} a ${fmt(fim)}`,
      pedidos, cancelados, comissao, concluida, cliques,
      origens: [...porOrigem.entries()].sort((a, b) => b[1].c - a[1].c).map(([nome, v]) => ({ nome, ...v })),
      produtos: [...porProduto.entries()].sort((a, b) => b[1].n - a[1].n).map(([nome, v]) => ({ nome, ...v })),
      maisClicados,
    });
    const form = new FormData();
    form.append("chat_id", String(chat));
    form.append("photo", new Blob([await img.arrayBuffer()], { type: "image/png" }), "relatorio.png");
    form.append("caption", `📊 Relatório de ${periodo}: ${pedidos} pedido${pedidos === 1 ? "" : "s"} · ${brl(comissao)} de comissão estimada · ${cliques} cliques no site${erro ? `\n⚠️ Shopee: ${erro.slice(0, 120)}` : ""}\nOutros períodos: /relatorio ontem · /relatorio 7 · /relatorio 30`);
    const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/sendPhoto`, { method: "POST", body: form });
    const j = await r.json();
    if (!j.ok) throw new Error(j.description);
    return;
  } catch (e) {
    console.error("relatorio imagem:", e.message);
  }
  return say(chat, linhas.join("\n"));
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
  // link curto (br.shp.ee / s.shopee): primeiro descobre o endereço do vídeo, depois lê a página dele
  const chain = isVideoLink(link) && /sv\.shopee/.test(link) ? [link] : await destinoShopee(link);
  link = chain[chain.length - 1];
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

// ---------- Pinterest: baixar o vídeo de um pin ----------
const PIN_RE = /https?:\/\/(?:pin\.it|(?:[a-z]{2,3}\.|www\.)?pinterest\.[a-z.]+\/pin)\/[^\s)>\]]+/i;
async function pinterestVideo(link) {
  for (const ua of ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "TelegramBot (like TwitterBot)", "facebookexternalhit/1.1"]) {
    try {
      const r = await fetch(link, { headers: { "User-Agent": ua, "Accept-Language": "pt-BR" }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(9000) });
      const h = (await r.text()).replace(/\\u002F/g, "/").replace(/\\\//g, "/");
      const mp4s = [...h.matchAll(/https:\/\/v\d*\.pinimg\.com\/videos\/[^"'\s\\]+?\.mp4/g)].map((m) => m[0]);
      if (mp4s.length) {
        // melhor qualidade disponível
        const ordem = (u) => (/\/720p\//.test(u) ? 0 : /\/expMp4\//.test(u) ? 1 : /\/480p\//.test(u) ? 2 : 3);
        return { mp4: [...new Set(mp4s)].sort((a, b) => ordem(a) - ordem(b))[0], titulo: (h.match(/<title>([^<]{0,120})/) || [])[1] || "" };
      }
      const m3u8 = (h.match(/https:\/\/v\d*\.pinimg\.com\/videos\/[^"'\s\\]+?\.m3u8/) || [])[0];
      if (m3u8) {
        // o mesmo vídeo costuma existir em .mp4 com o mesmo código, numa pasta de qualidade
        const caminho = m3u8.replace(/^https:\/\/v\d*\.pinimg\.com\/videos\//, "").replace(/^(?:iht\/)?hls\//, "").replace(/\.m3u8$/, "");
        for (const q of ["mc/720p", "720p", "expMp4", "mc/480p"]) {
          const u = `https://v1.pinimg.com/videos/${q}/${caminho.replace(/_\w+$/, "")}.mp4`;
          try { const t = await fetch(u, { method: "HEAD", signal: AbortSignal.timeout(5000) }); if (t.ok) return { mp4: u }; } catch {}
        }
        return { m3u8 };
      }
    } catch { /* tenta o próximo */ }
  }
  return null;
}
async function baixarPinterest(chat, link) {
  await tg("sendChatAction", { chat_id: chat, action: "upload_video" }).catch(() => {});
  const v = await pinterestVideo(link);
  if (!v) return say(chat, "⚠️ Não achei vídeo nesse link do Pinterest. Confira se o pin é um <b>vídeo</b> (não foto) e se é público.");
  if (v.erro) return say(chat, `⚠️ ${esc(v.erro)}`);
  if (v.m3u8) {
    // só em formato de transmissão: o GitHub converte para .mp4 (com FFmpeg) e manda aqui
    try { await dispatchWorkflow("baixar-video.yml", { url: v.m3u8, legenda: "📌 Vídeo do Pinterest baixado." }); }
    catch (e) { return say(chat, `⚠️ ${esc(e.message)}`); }
    return say(chat, "📌 Esse pin está em formato de transmissão: estou convertendo para vídeo. Chega aqui em ~1 minuto.");
  }
  const cap = "📌 Vídeo do Pinterest baixado.\nPara virar vídeo com narração, encaminhe ele de volta aqui com o link do produto (ou /reels NÚMERO) na legenda.";
  try { return await tg("sendVideo", { chat_id: chat, video: v.mp4, caption: cap, supports_streaming: true }); }
  catch {
    try {
      const r = await fetch(v.mp4, { cache: "no-store", signal: AbortSignal.timeout(25000) });
      const form = new FormData();
      form.append("chat_id", String(chat)); form.append("caption", cap);
      form.append("video", new Blob([await r.arrayBuffer()], { type: "video/mp4" }), "pinterest.mp4");
      const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN.trim()}/sendVideo`, { method: "POST", body: form });
      const j = await res.json(); if (!j.ok) throw new Error(j.description);
      return j.result;
    } catch (e) { return say(chat, `⚠️ Achei o vídeo mas não consegui enviar (${esc(e.message)}).\nLink direto: ${esc(v.mp4)}`); }
  }
}

// segue os redirecionamentos do link curto (s.shopee.com.br/xxx) para saber se é vídeo ou produto
async function destinoShopee(link) {
  const chain = [link];
  let cur = link;
  for (let i = 0; i < 6; i++) {
    try {
      const r = await fetch(cur, { redirect: "manual", headers: { "User-Agent": "TelegramBot (like TwitterBot)" }, cache: "no-store", signal: AbortSignal.timeout(5000) });
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
const SHOPEE_RE = /https?:\/\/(?:s\.shopee\.com\.br|(?:[a-z]{2,3}\.)?shope\.ee|(?:[a-z]{2,3}\.)?shp\.ee|sv\.shopee\.com\.br|(?:www\.)?shopee\.com\.br)\/[^\s)>\]]+/i;

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
