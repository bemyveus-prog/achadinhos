import "./globals.css";

const name = process.env.NEXT_PUBLIC_SITE_NAME || "Minhas Ofertas";
const tagline = process.env.NEXT_PUBLIC_TAGLINE || "Os achados que eu indico nos vídeos";

// código do Pinterest do ofertas.achadinhosincriveis.site (outro site: troque pela variável PINTEREST_VERIFY)
const PINTEREST_VERIFY = (process.env.PINTEREST_VERIFY || "dbbbb2ec2e332c2bdf696a71dbce2b95").trim();

export const metadata = {
  title: `${name} — ofertas e cupons`,
  description: tagline,
  openGraph: { title: name, description: tagline, type: "website" },
  alternates: { types: { "application/rss+xml": "/rss" } },
  // verificação do site no Pinterest (código de "Reivindicar site", etiqueta HTML)
  ...(PINTEREST_VERIFY ? { other: { "p:domain_verify": PINTEREST_VERIFY } } : {}),
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FBF7F2",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
