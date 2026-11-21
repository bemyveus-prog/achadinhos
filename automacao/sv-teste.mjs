const T = process.env.META_PAGE_TOKEN.trim(), P = process.env.META_PAGE_ID.trim();
const G = "https://graph.facebook.com/v24.0";
const a = await (await fetch(`${G}/${P}?fields=name,link,fan_count&access_token=${T}`)).json();
console.log("PAGINA:", JSON.stringify(a));
const b = await (await fetch(`${G}/me/accounts?fields=name,id&access_token=${T}`)).json();
console.log("ACCOUNTS:", JSON.stringify(b).slice(0, 500));
