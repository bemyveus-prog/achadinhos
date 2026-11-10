#!/usr/bin/env bash
# Prepara o que os vídeos/imagens precisam (navegador, fonte de emoji, FFmpeg) sem o apt lento.
# Antes: "playwright install --with-deps" + apt-get chegava a levar 12 min. Agora: ~30 s.
set -e
cd "$GITHUB_WORKSPACE/automacao"

# 1) navegador do Playwright (só o download; as bibliotecas do sistema já vêm na máquina do GitHub)
npx playwright install chromium
if ! node -e 'require("playwright").chromium.launch().then(b=>b.close()).catch(()=>process.exit(1))'; then
  echo "Faltam bibliotecas do sistema; instalando (mais lento)..."
  timeout 600 npx playwright install-deps chromium
fi

# 2) fonte de emoji (👆 🎟️ ⭐), direto do repositório do Google
mkdir -p "$HOME/.local/share/fonts"
if [ ! -s "$HOME/.local/share/fonts/NotoColorEmoji.ttf" ]; then
  curl -fsSL --retry 3 -o "$HOME/.local/share/fonts/NotoColorEmoji.ttf" \
    https://github.com/googlefonts/noto-emoji/raw/main/fonts/NotoColorEmoji.ttf \
    || (timeout 300 sudo apt-get install -y -qq --no-install-recommends fonts-noto-color-emoji || true)
fi
fc-cache -f >/dev/null 2>&1 || true

# 3) FFmpeg (normalmente já vem instalado)
if ! command -v ffmpeg >/dev/null; then
  timeout 300 sudo apt-get install -y -qq --no-install-recommends ffmpeg \
    || (sudo apt-get update -qq && timeout 300 sudo apt-get install -y -qq --no-install-recommends ffmpeg)
fi
echo "Pronto para renderizar."
