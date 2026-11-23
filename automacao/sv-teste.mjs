import { paginasFacebook } from "./lib/social.mjs";
const pg = paginasFacebook().find((p) => p.nome === "principal");
const G = "https://graph.facebook.com/v24.0";
const get = async (path) => (await fetch(`${G}/${path}${path.includes("?") ? "&" : "?"}access_token=${pg.token}`)).json();
console.log("STATUS:", JSON.stringify(await get("1951557172680158?fields=status,published,permalink_url,created_time")));
console.log("RASCUNHOS:", JSON.stringify(await get(`${pg.page}/video_reels?fields=id,status,published,created_time&limit=5`)).slice(0, 700));
