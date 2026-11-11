#!/usr/bin/env bash
# Prepara o que os vídeos/imagens precisam (navegador, fonte de emoji, FFmpeg) sem o apt lento.
# Antes: "playwright install --with-deps" + apt-get chegava a levar 12 min. Agora: ~30 s.
set -e
cd "$GITHUB_WORKSPACE/automacao"

# 1) navegador do Playwright (só o download; as bibliotecas do sistema já vêm na máquina do GitHub)
npx playwright install chromium
if ! node -e 'require("playwright").chromium.launch().then(b=>b.close()).catch(()=>process.exit(1))'; then
  echo "Faltam bibliotecas do sistema; instalando (mais lento)..."
  timeout 300 npx playwright install-deps chromium || true
fi

# 2) fonte de emoji (👆 🎟️ ⭐), direto do repositório do Google
mkdir -p "$HOME/.local/share/fonts"
if [ ! -s "$HOME/.local/share/fonts/NotoColorEmoji.ttf" ]; then
  curl -fsSL --retry 3 -o "$HOME/.local/share/fonts/NotoColorEmoji.ttf" \
    https://raw.githubusercontent.com/google/fonts/main/ofl/notocoloremoji/NotoColorEmoji-Regular.ttf \
    || (timeout 300 sudo apt-get install -y -qq --no-install-recommends fonts-noto-color-emoji || true)
fi
fc-cache -f >/dev/null 2>&1 || true

# 3) FFmpeg: se a máquina não tiver, baixa a versão pronta do GitHub (sem depender do apt, que às vezes trava)
if ! command -v ffmpeg >/dev/null || ! command -v ffprobe >/dev/null; then
  echo "Baixando FFmpeg..."
  mkdir -p "$HOME/ffmpeg-bin"
  curl -fsSL --retry 3 https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz \
    | tar -xJ --strip-components=2 -C "$HOME/ffmpeg-bin" --wildcards '*/bin/ffmpeg' '*/bin/ffprobe' \
    || (timeout 300 sudo apt-get install -y -qq --no-install-recommends ffmpeg)
  echo "$HOME/ffmpeg-bin" >> "$GITHUB_PATH"
  export PATH="$HOME/ffmpeg-bin:$PATH"
fi
ffmpeg -version | head -1
echo "Pronto para renderizar."
