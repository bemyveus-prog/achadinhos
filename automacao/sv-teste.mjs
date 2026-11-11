// Teste 2: abre o link do Shopee Vídeo num navegador de verdade e captura as respostas da página
import { writeFile, mkdir } from "fs/promises";
import { chromium, devices } from "playwright";
const LINK = process.env.SV_LINK;
await mkdir("saida/sv", { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["Pixel 7"], locale: "pt-BR" });
const page = await ctx.newPage();
const found = [];
let n = 0;
page.on("response", async (r) => {
  const url = r.url();
  const ct = r.headers()["content-type"] || "";
  if (!/json|text\/plain/.test(ct)) return;
  try {
    const t = await r.text();
    n++;
    await writeFile(`saida/sv/resp-${n}.json`, url + "\n\n" + t);
    const hit = /item_?id|shop_?id|itemid|shopid|product/i.test(t);
    console.log(`${hit ? "★" : " "} ${r.status()} ${url.slice(0, 140)} (${t.length})`);
    if (hit) {
      const ids = [...t.matchAll(/"(?:shop_?id|shopid)"\s*:\s*"?(\d{3,})[\s\S]{0,300}?"(?:item_?id|itemid)"\s*:\s*"?(\d{3,})/gi)].slice(0, 5).map((m) => m[1] + ":" + m[2]);
      const ids2 = [...t.matchAll(/"(?:item_?id|itemid)"\s*:\s*"?(\d{3,})[\s\S]{0,300}?"(?:shop_?id|shopid)"\s*:\s*"?(\d{3,})/gi)].slice(0, 5).map((m) => m[2] + ":" + m[1]);
      found.push(...ids, ...ids2);
      console.log("    ids:", [...ids, ...ids2].join(" ") || "-", "|", t.slice(0, 300).replace(/\s+/g, " "));
    }
  } catch {}
});
try { await page.goto(LINK, { waitUntil: "networkidle", timeout: 45000 }); } catch (e) { console.log("goto:", e.message); }
await page.waitForTimeout(6000);
console.log("final url:", page.url());
const html = await page.content();
await writeFile("saida/sv/page.html", html);
const anchors = await page.$$eval("a", (as) => as.map((a) => a.href).filter((h) => /shopee/.test(h)).slice(0, 30)).catch(() => []);
console.log("links na página:", anchors.filter((h) => /product|-i\.|item/.test(h)).join("\n  ") || "-");
const txt = (await page.innerText("body").catch(() => "")).slice(0, 600).replace(/\s+/g, " ");
console.log("texto:", txt);
console.log("IDS ENCONTRADOS:", [...new Set(found)].join(" ") || "nenhum");
await b.close();
