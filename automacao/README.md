# Achado do dia (automação)

Todo dia, sozinho:

1. Busca na **API de afiliados da Shopee** os produtos com **maior comissão** (uma palavra-chave por dia, em rodízio).
2. Filtra por nota, vendas e preço, descarta o que já foi escolhido antes e pontua (comissão × vendas × nota).
3. Gera o **link de afiliado** (subId `insta`, para ver no relatório o que veio dos carrosséis).
4. Coloca o produto na **vitrine da bio** como "Achado do dia", fixado no topo (e tira o destaque do anterior).
5. Gera o **carrossel de 5 imagens** (1080×1350) + **legenda** com "digite #ID na busca".
6. Manda a **prévia no Telegram** (opcional) com as imagens, a legenda e mais 3 opções de produto.

A postagem no Instagram fica para a próxima etapa.

## Instalar na VPS

```bash
cd achadinhos/automacao
npm install
npx playwright install --with-deps chromium
cp .env.example .env      # preencha
```

No Supabase, rode **uma vez** o arquivo `supabase/auto-picks.sql` (SQL Editor → Run).

## Rodar

```bash
npm run achado                     # fluxo completo
npm run achado -- --sem-vitrine    # escolhe e gera o carrossel, sem gravar na vitrine
npm run teste -- --foto foto.jpg   # só testa o visual do carrossel com um produto de exemplo
```

Saída em `saida/AAAA-MM-DD-ITEMID/` (`1.jpg` … `5.jpg` e `legenda.txt`).

## Agendar (todo dia às 7h40, horário de Brasília)

```bash
crontab -e
# CRON_TZ funciona no cron do Ubuntu/Debian
CRON_TZ=America/Sao_Paulo
40 7 * * * cd /CAMINHO/achadinhos/automacao && /usr/bin/npm run achado >> saida/log.txt 2>&1
```

## Slides

1. Capa: gancho + foto + selo de desconto
2. Prova social: vendas, nota, desconto (números da API)
3. O que é: nome + destaques (IA) ou o título completo
4. Preço: de/por + data do preço
5. Chamada: "Na vitrine da bio, digite #ID"

Os números vêm sempre da API. A IA (opcional) só escreve gancho e destaques a partir do título do anúncio, com regra de não inventar medidas, resultados ou promessas de saúde.

## Rodar pelo GitHub Actions (sem VPS)

O arquivo `.github/workflows/achado-do-dia.yml` roda tudo todo dia às 7h40 (Brasília) nos servidores do GitHub.

1. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**, cadastre:
   `SHOPEE_APP_ID`, `SHOPEE_APP_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   e, se quiser, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ANTHROPIC_API_KEY`.
2. Ajustes (opcionais) na aba **Variables**: `INSTAGRAM_HANDLE`, `PALAVRAS_CHAVE`, `MIN_COMISSAO` etc. (mesmos nomes do `.env.example`).
3. Teste manual: **Actions → Achado do dia → Run workflow** (vem marcado "só gerar o carrossel").
4. O carrossel fica para baixar no fim da execução (**Artifacts**) por 14 dias, e chega no Telegram se configurado.

Obs.: o GitHub pausa agendamentos de repositórios sem nenhum commit há 60 dias; se acontecer, é só reativar na aba Actions.

## Postar sozinho no Instagram e no Facebook

O carrossel sobe no Storage do Supabase (bucket público `carrosseis`, criado sozinho) e é publicado pela API oficial da Meta:
**Instagram** como carrossel e **Página do Facebook** como post com as 5 fotos (no Facebook vai também o link de afiliado clicável).

Requisitos: Instagram **profissional** (comercial ou criador) **ligado a uma Página do Facebook**.

### Pegar as chaves (tudo pelo navegador, uma vez)

1. Em **developers.facebook.com → Meus apps → Criar app** → tipo **Empresa** (ou "Outro" → "Empresa").
   Adicione o produto **Instagram** (API com login do Facebook).
2. Abra o **Graph API Explorer** (developers.facebook.com/tools/explorer), escolha o seu app, clique em
   **Get Token → Get User Access Token** e marque:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`.
   Autorize escolhendo a Página e o Instagram.
3. Copie o token, cole no **Access Token Debugger** (developers.facebook.com/tools/debug/accesstoken) e clique em
   **Extend Access Token** → copie o token longo.
4. De volta ao Explorer, com o token longo, rode `me/accounts`. Na Página certa copie
   `id` → **META_PAGE_ID** e `access_token` → **META_PAGE_TOKEN** (esse não expira).
5. Rode `SEU_PAGE_ID?fields=instagram_business_account{id,username}` → `id` → **META_IG_USER_ID**.
6. Cadastre os três como **secrets** no GitHub e crie a **variável** `POSTAR` = `instagram,facebook`.

Execuções manuais só postam se marcar "Postar no Instagram/Facebook". O agendamento diário posta sempre que `POSTAR` estiver preenchida.
Se algo falhar, a execução fica vermelha e o motivo vai no Telegram.
