import { isAdmin, unauthorized } from "@/lib/auth";
import { db, hasDb } from "@/lib/supabase";
import { hasShopeeApi, shopeeProduct, shopeeSearch, shopeeShops, shopeeShortLinkSub } from "@/lib/shopee";
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
<b>/reels</b> 105 SKU-da-CJ → gera o Reels do produto #105 com o vídeo real da CJ (chega aqui em ~3 min). Sem SKU usa só a foto. Acrescente <i>postar</i> para já postar no Instagram.
<b>/loja</b> nome da loja → lojas oficiais e parceiras, com a comissão e os produtos de cada uma
Categorias: ${Object.keys(CATEGORIAS).join(", ")}

Também dá para só escrever o produto (ex.: <i>air fryer</i>).
Em cada produto, toque em <b>➕ Colocar na vitrine</b> para ele entrar no site com o seu link (subId botsite).

🖼️ <b>Capas do carrossel</b>
Mande uma FOTO com a legenda <b>/capa maquiagem</b> (ou outra categoria) para ela entrar no rodízio de capas.
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
  await tg("setWebhook", { url, secret_token: webhookSecret(), allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  await tg("setMyCommands", { commands: [
    { command: "buscar", description: "Buscar produto (comissão + vendas)" },
    { command: "comissao", description: "Buscar só pela maior comissão" },
    { command: "categoria", description: "Melhores de uma categoria" },
    { command: "loja", description: "Buscar loja oficial pelo nome" },
    { command: "reels", description: "Gerar Reels: /reels 105 SKU-CJ" },
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
  const [cmdRaw, ...rest] = text.split(/\s+/);
  const cmd = cmdRaw.startsWith("/") ? cmdRaw.slice(1).split("@")[0].toLowerCase() : null;
  const arg = (cmd ? rest.join(" ") : text).trim();

  if (!cmd && !arg) return;
  if (cmd === "start" || cmd === "ajuda" || cmd === "help") return say(chat, AJUDA);
  if (!hasShopeeApi()) return say(chat, "Falta SHOPEE_APP_ID/SHOPEE_APP_SECRET na Vercel.");

  if (cmd === "reels") return startReels(chat, rest);
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

// ---------- Reels sob encomenda: dispara o workflow "Reels v2" no GitHub ----------
const REPO = process.env.GITHUB_REPO || "bemyveus-prog/achadinhos";
async function startReels(chat, parts) {
  const args = parts.filter(Boolean);
  const num = (args.find((a) => /^#?\d+$/.test(a)) || "").replace("#", "");
  const postar = args.some((a) => /^postar$/i.test(a));
  const sku = (args.find((a) => a !== num && a.replace("#", "") !== num && !/^postar$/i.test(a)) || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
  if (!num) return say(chat, "Use assim: <b>/reels 105 CJYD2300009</b>\n(número da vitrine e, se quiser, o SKU da CJ; acrescente <i>postar</i> para postar direto)");
  const token = (process.env.GITHUB_TOKEN || "").trim();
  if (!token) return say(chat, "Falta a variável GITHUB_TOKEN na Vercel.");
  if (hasDb()) {
    const { data } = await db().from("offers").select("id,title").eq("id", Number(num)).maybeSingle();
    if (!data) return say(chat, `Não achei o produto #${num} na vitrine.`);
  }
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/reels-v2.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "vitrine-bot" },
    body: JSON.stringify({ ref: "main", inputs: { oferta: num, cj_sku: sku, ...(postar ? { postar: "true" } : {}) } }),
    cache: "no-store",
  });
  if (r.status !== 204) {
    const t = await r.text().catch(() => "");
    return say(chat, `⚠️ O GitHub recusou (${r.status}). ${r.status === 403 || r.status === 401 ? "Confira se o token tem permissão Actions: Read and write no repositório achadinhos." : esc(t.slice(0, 200))}`);
  }
  return say(chat, `🎬 Gerando o Reels do <b>#${num}</b>${sku ? ` com o vídeo da CJ (<code>${esc(sku)}</code>)` : ""}${postar ? " e postando no Instagram" : ""}.\nChega aqui em uns 3 minutos.`);
}
