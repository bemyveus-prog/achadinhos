import { postFacebookReel, paginasFacebook } from "./lib/social.mjs";
const url = "https://jsydqcxgcryblxrelavy.supabase.co/storage/v1/object/public/carrosseis/reels2-460-1795125391296/reels.mp4";
const extras = paginasFacebook().filter((p) => p.nome !== "principal");
console.log("PAGINAS EXTRAS:", extras.map((p) => p.nome).join(", ") || "nenhuma");
for (const pg of extras) {
  try { console.log(`FBREEL OK (${pg.nome}):`, await postFacebookReel(url, "🔥 Achadinho do dia! (teste do Reels automático)", pg)); }
  catch (e) { console.log(`FBREEL ERRO (${pg.nome}):`, e.message); }
}
