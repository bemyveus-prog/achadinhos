const G = "https://graph.facebook.com/v24.0";
const T = process.env.META_PAGE_TOKEN, PAGE = process.env.META_PAGE_ID;
const get = async (p) => (await fetch(`${G}/${p}${p.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(T)}`)).json();
const c = await get(`${PAGE}/conversations?platform=instagram&limit=5&fields=updated_time,participants,messages.limit(3){message,from,created_time}`);
console.log("CONV:", JSON.stringify(c).replace(/https?:\/\/\S+?"/g, 'URL"').slice(0, 2500));
