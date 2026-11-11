// Teste: o que a página de um vídeo do Shopee Vídeo devolve (procura o produto vinculado)
import { writeFile, mkdir } from "fs/promises";
const LINK = process.env.SV_LINK;
const UA = ["Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "WhatsApp/2.24.1 A"];
await mkdir("saida/sv", { recursive: true });
const u = new URL(LINK);
const inner = u.searchParams.get("redir") || LINK;
console.log("link interno:", inner);
const shareId = (inner.match(/share-video\/([^?]+)/) || [])[1];
console.log("share id:", shareId && decodeURIComponent(shareId));
const tries = [inner, LINK];
if (shareId) {
  const sid = encodeURIComponent(decodeURIComponent(shareId));
  tries.push(`https://sv.shopee.com.br/api/v1/share/video?share_id=${sid}`, `https://sv.shopee.com.br/api/v4/share/video?share_id=${sid}`,
    `https://sv.shopee.com.br/api/v1/video/share_detail?share_id=${sid}`, `https://sv.shopee.com.br/api/v1/share_video/detail?share_id=${sid}`);
}
let k = 0;
for (const url of tries) for (const ua of UA) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": ua, "Accept-Language": "pt-BR" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    k++;
    await writeFile(`saida/sv/${k}.txt`, `${url}\nUA: ${ua}\nstatus ${r.status} final ${r.url}\n\n${t}`);
    const ids = [...t.matchAll(/(?:shop_?id|shopid)["'=:\s\\]+(\d{3,})[\s\S]{0,200}?(?:item_?id|itemid)["'=:\s\\]+(\d{3,})/gi)].slice(0, 3).map((m) => m[1] + ":" + m[2]);
    const ids2 = [...t.matchAll(/-i\.(\d{3,})\.(\d{3,})/g)].slice(0, 3).map((m) => m[1] + ":" + m[2]);
    const apis = [...new Set([...t.matchAll(/["'](\/api\/[^"'\s]{3,80})["']/g)].map((m) => m[1]))].slice(0, 15);
    const og = (t.match(/<meta[^>]+property=["']og:(?:title|description)["'][^>]*>/gi) || []).slice(0, 3);
    console.log(`\n[${k}] ${r.status} ${url.slice(0, 90)} (${ua.slice(0, 20)}) len=${t.length} final=${r.url.slice(0, 80)}`);
    console.log("  ids:", ids.join(" | ") || "-", "| -i.:", ids2.join(" | ") || "-");
    if (apis.length) console.log("  apis:", apis.join(" "));
    if (og.length) console.log("  og:", og.join(" ").slice(0, 300));
    if (/json/.test(r.headers.get("content-type") || "")) console.log("  json:", t.slice(0, 400));
  } catch (e) { console.log(`\n[x] ${url.slice(0, 90)}: ${e.message}`); }
}
