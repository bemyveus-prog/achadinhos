# Vitrine Bio — link da bio com todas as suas ofertas

Página mobile, leve e rápida para colocar na bio do Instagram / YouTube / TikTok, com:

- **Produtos numerados** (#23): no vídeo você fala *"produto 23 na bio"*, e a pessoa digita 23 na busca e cai direto nele.
- **Cupons**: um toque copia o código e já abre a loja.
- **Busca + categorias**, selos ("Mais vendido", "Frete grátis"), % de desconto automático e destaques no topo.
- **Painel `/admin`**: cole o link da Shopee e ele puxa foto, nome, preço e gera seu link de afiliado (API oficial). TikTok Shop puxa foto/título da página quando possível, o resto você completa.
- **Contador de cliques** por oferta (todo clique passa por `/r/ID`).
- Cupons e ofertas com **data de validade** somem sozinhos quando expiram.
- Link direto para um produto: `seusite.com/?p=23`

---

## 1. Banco (Supabase) — 3 min

1. Crie um projeto em supabase.com (ou use o seu existente).
2. **SQL Editor** → cole o conteúdo de `supabase/schema.sql` → **Run**.
3. Em **Project Settings → API**, copie a `Project URL` e a `service_role` key.

## 2. API de afiliados da Shopee (opcional, mas recomendado)

No painel de afiliado (affiliate.shopee.com.br) → **Open API** → copie **App ID** e **Secret**.
Sem isso o site funciona igual, mas você cola o link de afiliado e preenche foto/preço à mão.

## 3. Rodar local

```bash
npm install
cp .env.example .env.local   # preencha as variáveis
npm run dev                  # http://localhost:3000  e  /admin
```

Sem Supabase configurado, a vitrine abre em **modo demonstração** com produtos de exemplo.

## 4. Publicar na Vercel

```bash
npx vercel          # primeira vez (cria o projeto)
npx vercel --prod
```

Em **Vercel → Settings → Environment Variables**, cadastre as mesmas variáveis do `.env.example`.
Depois aponte um domínio/subdomínio (ex: `bio.achadinhosincriveis.site`) em **Settings → Domains**
e crie o registro CNAME `bio → cname.vercel-dns.com` na HostGator.

## Variáveis

| Variável | Para quê |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | banco (só usado no servidor) |
| `ADMIN_PASSWORD` | senha do `/admin` |
| `SHOPEE_APP_ID`, `SHOPEE_APP_SECRET` | puxar produto e gerar link de afiliado |
| `SHOPEE_SUB_ID` | subId dos links (ex: `bio`) para ver as vendas da bio no relatório |
| `NEXT_PUBLIC_SITE_NAME`, `..._HANDLE`, `..._TAGLINE`, `..._AVATAR_URL` | topo da página |
| `NEXT_PUBLIC_TIKTOK_URL`, `..._INSTAGRAM_URL`, `..._YOUTUBE_URL`, `..._WHATSAPP_URL` | ícones das redes |

> Mudou nome/foto/redes? Faça um novo deploy (variáveis `NEXT_PUBLIC_*` entram no build).
> Ofertas novas aparecem na hora (o painel atualiza a página ao salvar).

## Estrutura

```
app/page.js              vitrine pública (cache de 60s)
app/r/[id]/route.js      conta clique e redireciona
app/admin/page.js        painel (login por senha)
app/api/*                CRUD de ofertas, importação por link, login
components/Vitrine.js    UI da vitrine
components/AdminPanel.js UI do painel
lib/shopee.js            Shopee Affiliate Open API (productOfferV2 + generateShortLink)
lib/importer.js          detecta plataforma e puxa dados do link
supabase/schema.sql      tabela + função de cliques
```
