import { paginasFacebook } from "./lib/social.mjs";
const G = "https://graph.facebook.com/v24.0";
for (const pg of paginasFacebook()) {
  const r = await (await fetch(`${G}/me?fields=id,name&access_token=${pg.token}`)).json();
  const d = await (await fetch(`${G}/debug_token?input_token=${pg.token}&access_token=${pg.token}`)).json();
  const x = d.data || {};
  console.log(`PAG ${pg.nome}: id_config=${pg.page} | token_de=${r.name || JSON.stringify(r.error?.message)} (${r.id || "-"}) | tipo=${x.type} | expira=${x.expires_at === 0 ? "NUNCA" : x.expires_at} | valido=${x.is_valid}`);
}
