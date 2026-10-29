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
