@AGENTS.md

# Achadinhos — guia rápido para o Claude

Dono: Jonas, afiliado brasileiro (Shopee, Amazon, Shein, AliExpress, Lomadee). **Responda sempre em português**, de forma direta e prática (ele lê pelo celular).

## Dois sites, mesmo código
- **achadinhos** (este repo, bemyveus-prog/achadinhos) → ofertas.achadinhosincriveis.site · Supabase `jsydqcxgcryblxrelavy` · Instagram @minh.asofertas · Telegram @minhasofertarelampago.
- **mixdapri** (bemyveus-prog/mixdapri) → Mix da Pri · Supabase `mmjmvbuhjiibcbhvrgce`. Mesmo código; a marca vem de `MARCA=mixdapri` e dos presets em `lib/brand.mjs`.
- **Toda mudança de código vai para os DOIS repos**: commit + push aqui, depois `git pull` no mixdapri, copie os mesmos arquivos e faça commit + push lá. Migrações SQL também nos dois bancos.

## Partes
- **Site** (Next.js 16, Vercel): `app/page.js` + `components/Vitrine.js` (vitrine, busca por #número, popup do grupo VIP), `components/AdminPanel.js`, `app/r/[id]/route.js` (redirecionador de clique: robôs recebem só a prévia OG; Android in-app abre o app da Shopee via intent), `lib/clicks.js` (regex BOT de robôs/scanners).
- **Bot do Telegram**: `app/api/telegram/route.js` (webhook na Vercel, maxDuration 60). Comandos pesados disparam workflows do GitHub via `dispatchWorkflow(...)`. Configurações ficam na tabela `bot_config` (chave/valor).
- **Automação** (`automacao/`, roda no GitHub Actions): `reels2.mjs` (vídeo com narração; formatos `mascara`, `cheio`, `limpo`, `puro`, opção `semfrase`; modos instagram/shopee/link), `lib/reels2.mjs` (render Playwright), `lib/narracao.mjs` (roteiro com o "prompt mestre" de gatilhos), `lib/voz.mjs` (ElevenLabs → Fish Audio → voz Microsoft), `lib/fotosvideo.mjs` (emenda vídeos em cortes de 5 s), `top-carrossel.mjs` + `lib/toptema.mjs` (carrossel diário Top 5 com produtos buscados na API da Shopee), `eu-quero.mjs` (comentário "EU QUERO" → direct em 2 passos), `traduzir.py` (OCR + tradução do texto na tela), `lomadee-cupons.mjs` + `lib/lomadee.mjs` (API Lomadee).
- **Tabelas principais**: `offers` (vitrine; colunas incluem platform, loja, description com prefixos `grupo:`, `top:`, `lmd:`, `lmdc:`), `click_events` (ua, ref), `bot_config`, `reels_pendentes`.

## Como testar
- O container do Claude **não alcança** Telegram, Shopee, Meta, Fish etc. (proxy). Para testar chamadas externas, use o ramo **`sv-teste`**: edite `automacao/sv-teste.mjs` e `.github/workflows/sv-teste.yml` (roda no push) e leia o log com `gh run view`.
- Disparar workflow: `gh api -X POST repos/bemyveus-prog/achadinhos/actions/workflows/<arquivo>.yml/dispatches -f ref=main -f 'inputs[x]=y'` (o `gh workflow run` falha: GraphQL bloqueado).
- Banco: use as ferramentas do Supabase (MCP) com os IDs acima.
- Antes de subir o bot: `node --input-type=module --check < app/api/telegram/route.js`.

## Decisões do Jonas (respeitar)
- Segredos (tokens/chaves) **nunca** no chat: ele mesmo coloca no GitHub Secrets / Vercel.
- Não remover marca d'água/créditos de outros criadores; não falsificar metadados de vídeo repostado; não usar vídeos de avaliações de compradores nos posts; nada de depoimento falso.
- Recusou mascarar/encurtar links diretos da Shopee por rede.
- **Não implementar ainda** (só quando ele pedir): combinador de ganchos/benefícios/CTA e roteiros para TikTok Shop.
- Vendas hoje vêm quase todas do Shopee Vídeo; cliques "Mídias Sociais" são inflados por scanners (Google Safe Browsing, Facebook) — filtrados em `lib/clicks.js`.
- ElevenLabs está no plano grátis: só vozes padrão (premade) via API; `/vozes` mostra amostras em português.

## Pendentes conhecidos
- `LOMADEE_TOKEN` precisa estar na Vercel para o comando `/lomadee`.
- Ideias em aberto: formato de vídeo `amazon` + link da vitrine Amazon no site (falta a URL); comando `/ia` com clipe de IA (Hugging Face LTX).
- Mix da Pri: agenda, Meta, Threads, avatar e chave da Lomadee ainda por configurar.
