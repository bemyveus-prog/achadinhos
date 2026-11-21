import { postFacebookReel } from "./lib/social.mjs";
const url = "https://jsydqcxgcryblxrelavy.supabase.co/storage/v1/object/public/carrosseis/reels2-460-1795125391296/reels.mp4";
try {
  const r = await postFacebookReel(url, "🔥 Achadinho do dia! (teste do Reels automático)\n\n🛒 Compre aqui: https://s.shopee.com.br/9fMdd9pJQH");
  console.log("FBREEL OK:", r);
} catch (e) { console.log("FBREEL ERRO:", e.message); }
