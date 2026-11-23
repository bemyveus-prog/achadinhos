import { postFacebookReel, paginasFacebook } from "./lib/social.mjs";
const url = "https://jsydqcxgcryblxrelavy.supabase.co/storage/v1/object/public/carrosseis/reels2-460-1795125391296/reels.mp4";
const pg = paginasFacebook().find((p) => p.nome === "principal");
try { console.log("FBDRAFT OK:", await postFacebookReel(url, "Rascunho de teste (pode apagar)", { ...pg, rascunho: true })); }
catch (e) { console.log("FBDRAFT ERRO:", e.message); }
