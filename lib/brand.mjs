// Marca do site e das automações. O mesmo código atende vários perfis:
// escolha com a variável MARCA (Vercel e GitHub) e, se quiser, sobrescreva qualquer valor pela variável própria.
//   MARCA=minhasofertas (padrão) | mixdapri
const PRESETS = {
  minhasofertas: {
    name: "Minhas Ofertas",
    handle: "@minh.asofertas",
    tagline: "Os achados e cupons que eu indico nos vídeos",
    avatar: "/avatar.jpg",
    site: "https://ofertas.achadinhosincriveis.site",
    canalTelegram: "https://t.me/minhasofertarelampago",
    canalChat: "@minhasofertarelampago",
    amazonTag: "ofertasama02b-20",
    pinterestVerify: "dbbbb2ec2e332c2bdf696a71dbce2b95",
    accent: "#D0306F",
    repo: "bemyveus-prog/achadinhos",
  },
  mixdapri: {
    name: "MIX da Pri",
    handle: "@mixdapri",
    tagline: "Achadinhos, ofertas e cupons selecionados pela Pri 💛",
    avatar: "",
    site: "https://mixdapri.vercel.app",
    canalTelegram: "",
    canalChat: "",
    amazonTag: "",
    pinterestVerify: "",
    accent: "#D0306F",
    repo: "bemyveus-prog/mixdapri",
  },
};

const v = (k) => (typeof process !== "undefined" ? (process.env[k] ?? "").trim() : "");
export const MARCA = PRESETS[v("MARCA")] ? v("MARCA") : "minhasofertas";
const P = PRESETS[MARCA];
// "" na variável = usa o padrão da marca; "nao" = desliga (ex.: sem canal)
const pick = (vals, padrao) => { for (const x of vals) { if (x === "nao") return ""; if (x) return x; } return padrao; };

export const BRAND = {
  key: MARCA,
  name: pick([v("NEXT_PUBLIC_SITE_NAME")], P.name),
  handle: pick([v("NEXT_PUBLIC_SITE_HANDLE"), v("INSTAGRAM_HANDLE")], P.handle),
  tagline: pick([v("NEXT_PUBLIC_TAGLINE")], P.tagline),
  avatar: pick([v("NEXT_PUBLIC_AVATAR_URL")], P.avatar),
  site: pick([v("VITRINE_URL")], P.site).replace(/\/$/, ""),
  canalTelegram: pick([v("NEXT_PUBLIC_CANAL_TELEGRAM")], P.canalTelegram),
  canalWhatsapp: pick([v("NEXT_PUBLIC_CANAL_WHATSAPP")], ""),
  canalChat: pick([v("TELEGRAM_CANAL")], P.canalChat),
  amazonTag: pick([v("AMAZON_TAG")], P.amazonTag),
  pinterestVerify: pick([v("PINTEREST_VERIFY")], P.pinterestVerify),
  accent: pick([v("MARCA_COR")], P.accent),
  repo: pick([v("GITHUB_REPO"), v("GITHUB_REPOSITORY")], P.repo),
};
