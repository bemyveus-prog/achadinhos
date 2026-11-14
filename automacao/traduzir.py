#!/usr/bin/env python3
"""Traduz o texto escrito na tela de um vídeo (ex.: vídeo chinês/inglês) e coloca a legenda em português por cima,
no mesmo lugar e no mesmo tempo. Marca d'água / @ do criador não é coberta.

  python traduzir.py entrada.mp4 saida.mp4          (ANTHROPIC_API_KEY para traduzir)
  TRADUZIR_FAKE=1 python traduzir.py ...            (teste sem IA: só marca o texto)
"""
import json, os, re, subprocess, sys, tempfile, urllib.request
from difflib import SequenceMatcher
from statistics import median

from PIL import Image, ImageDraw, ImageFont
from rapidocr_onnxruntime import RapidOCR

FPS_OCR = 3
AQUI = os.path.dirname(os.path.abspath(__file__))
FONTE = next((f for f in [os.path.join(AQUI, "..", "public", "fonts", "Poppins-Bold.ttf"),
                          "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"] if os.path.exists(f)), None)
MARCA = re.compile(r"@|tiktok|douyin|instagram|kuaishou|kwai|抖音|快手|小红书|shopee|reels?\b|www\.|\.com", re.I)


def log(*a):
    print(*a, flush=True)


def sh(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def info(video):
    j = json.loads(sh("ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                      "stream=width,height:format=duration", "-of", "json", video))
    s = j["streams"][0]
    return int(s["width"]), int(s["height"]), float(j["format"]["duration"])


def cjk(t):
    return bool(re.search(r"[぀-ヿ㐀-鿿가-힯]", t))


def blocos(linhas):
    """junta linhas próximas (uma frase em 2 linhas) num bloco só"""
    linhas = sorted(linhas, key=lambda l: (l["y0"], l["x0"]))
    out = []
    for l in linhas:
        h = l["y1"] - l["y0"]
        alvo = None
        for b in out:
            ultimo = b["linhas"][-1]
            hx = min(b["x1"], l["x1"]) - max(b["x0"], l["x0"])
            if -0.5 * h <= l["y0"] - ultimo["y1"] < 0.9 * h and hx > -0.2 * (l["x1"] - l["x0"]) and abs(h - (ultimo["y1"] - ultimo["y0"])) < 0.7 * h:
                alvo = b
                break
        if alvo:
            alvo["linhas"].append(l)
            for k, f in (("x0", min), ("y0", min), ("x1", max), ("y1", max)):
                alvo[k] = f(alvo[k], l[k])
        else:
            out.append({"x0": l["x0"], "y0": l["y0"], "x1": l["x1"], "y1": l["y1"], "linhas": [l]})
    for b in out:
        sep = "" if all(cjk(x["t"]) for x in b["linhas"]) else " "
        b["t"] = sep.join(x["t"] for x in b["linhas"]).strip()
        b["lh"] = median([x["y1"] - x["y0"] for x in b["linhas"]])
        b["n"] = len(b["linhas"])
    return out


def iou(a, b):
    ix = max(0, min(a["x1"], b["x1"]) - max(a["x0"], b["x0"]))
    iy = max(0, min(a["y1"], b["y1"]) - max(a["y0"], b["y0"]))
    inter = ix * iy
    ua = (a["x1"] - a["x0"]) * (a["y1"] - a["y0"]) + (b["x1"] - b["x0"]) * (b["y1"] - b["y0"]) - inter
    return inter / ua if ua else 0


def ler_texto(video, tmp, W, H):
    sh("ffmpeg", "-v", "error", "-y", "-i", video, "-vf", f"fps={FPS_OCR},scale=720:-2", os.path.join(tmp, "q%05d.jpg"))
    quadros = sorted(f for f in os.listdir(tmp) if f.startswith("q"))
    esc = W / 720.0
    ocr = RapidOCR()
    segs = []
    for i, f in enumerate(quadros):
        t = i / FPS_OCR
        r, _ = ocr(os.path.join(tmp, f))
        linhas = []
        for box, txt, conf in (r or []):
            txt = str(txt).strip()
            if float(conf) < 0.6 or len(txt) < 2 or MARCA.search(txt):
                continue
            xs, ys = [p[0] * esc for p in box], [p[1] * esc for p in box]
            linhas.append({"x0": min(xs), "y0": min(ys), "x1": max(xs), "y1": max(ys), "t": txt})
        for b in blocos(linhas):
            melhor = None
            for s in segs:
                if s["fim"] >= t - 2.0 / FPS_OCR and iou(s["box"], b) > 0.3 and SequenceMatcher(None, s["textos"][-1].lower(), b["t"].lower()).ratio() > 0.75:
                    melhor = s
                    break
            if melhor:
                melhor["fim"] = t
                melhor["textos"].append(b["t"])
                bx = melhor["box"]
                for k, fn in (("x0", min), ("y0", min), ("x1", max), ("y1", max)):
                    bx[k] = fn(bx[k], b[k])
            else:
                segs.append({"ini": t, "fim": t, "textos": [b["t"]], "box": {k: b[k] for k in ("x0", "y0", "x1", "y1")}, "lh": b["lh"]})
    for s in segs:
        # texto mais comum (o OCR erra uma letra aqui e ali)
        s["texto"] = max(set(s["textos"]), key=lambda x: (s["textos"].count(x), len(x)))
    segs = [s for s in segs if len(s["textos"]) >= 2 or (s["fim"] - s["ini"]) > 0]
    # mesmo texto que "piscou" (o OCR perdeu 1 ou 2 quadros): vira um trecho só
    segs.sort(key=lambda s: s["ini"])
    juntos = []
    for s in segs:
        a = next((j for j in juntos if s["ini"] - j["fim"] <= 0.8 and iou(j["box"], s["box"]) > 0.2
                  and SequenceMatcher(None, j["texto"].lower(), s["texto"].lower()).ratio() > 0.8), None)
        if a:
            a["fim"] = max(a["fim"], s["fim"])
            for k, fn in (("x0", min), ("y0", min), ("x1", max), ("y1", max)):
                a["box"][k] = fn(a["box"][k], s["box"][k])
        else:
            juntos.append(s)
    log(f"  {len(quadros)} quadros lidos, {len(juntos)} textos na tela")
    return juntos


def quadros_cinza(video, W, H, fps=15, larg=360):
    """todos os quadros em tons de cinza, pequenos (para acertar o tempo de entrada/saída de cada texto)"""
    h = int(round(H * larg / W / 2) * 2)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", f"fps={fps},scale={larg}:{h},format=gray", "-f", "rawvideo", "-"],
                         check=True, capture_output=True).stdout
    n = len(raw) // (larg * h)
    return [raw[i * larg * h:(i + 1) * larg * h] for i in range(n)], larg, h, fps


def acertar_tempo(segs, video, W, H, ocr=None):
    """o OCR olha 3 quadros por segundo: aqui relê só o pedaço da tela de cada texto, 15 vezes por segundo,
    para achar o quadro exato em que o texto entra e sai (sem pegar o texto do trecho vizinho)"""
    import numpy as np
    try:
        qs, lw, lh_, fps = quadros_cinza(video, W, H, larg=540)
    except Exception as e:
        log(f"  acertar tempo: {e}")
        return
    ocr = ocr or RapidOCR()
    e = lw / W
    for s in segs:
        b = s["box"]
        pad = int(s["lh"] * e * 0.4) + 2
        x0, y0 = max(0, int(b["x0"] * e) - pad), max(0, int(b["y0"] * e) - pad)
        x1, y1 = min(lw, int(b["x1"] * e) + pad), min(lh_, int(b["y1"] * e) + pad)
        alvo = s["texto"].lower()
        def presente(k):
            img = np.frombuffer(qs[k], dtype=np.uint8).reshape(lh_, lw)[y0:y1, x0:x1]
            r, _ = ocr(np.ascontiguousarray(img))
            lido = " ".join(str(t) for _, t, c in (r or []) if float(c) > 0.4).lower()
            return bool(lido) and (SequenceMatcher(None, alvo, lido).ratio() > 0.5 or (len(lido) > 3 and lido in alvo))
        ki = min(len(qs) - 1, int(round(s["ini"] * fps)))
        kf = min(len(qs) - 1, int(round(s["fim"] * fps)))
        k = ki
        while k - 1 >= 0 and ki - (k - 1) <= 0.5 * fps and presente(k - 1):
            k -= 1
        s["ini"] = k / fps
        k = kf
        while k + 1 < len(qs) and (k + 1) - kf <= 0.5 * fps and presente(k + 1):
            k += 1
        s["fim"] = (k + 1) / fps
        if os.environ.get("TRADUZIR_DEBUG"):
            log("   dbg", s["texto"][:20], f"{s['ini']:.2f}-{s['fim']:.2f}")


def alargar(video, s, W, H):
    """emojis e enfeites ao lado do texto (o OCR não lê): estica a caixa até cobrir"""
    f = tempfile.mktemp(suffix=".png")
    t = (s["ini"] + s["fim"]) / 2
    try:
        sh("ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", video, "-frames:v", "1", f)
        im = Image.open(f).convert("HSV")
    except Exception:
        return
    finally:
        if os.path.exists(f):
            os.remove(f)
    b, lh = s["box"], s["lh"]
    y0, y1 = int(max(0, b["y0"])), int(min(H - 1, b["y1"]))
    passo = max(1, int(lh / 12))
    def tinta(x):
        for y in range(y0, y1 + 1, passo):
            hh, ss, vv = im.getpixel((x, y))
            if (ss > 115 and vv > 90) or vv > 215:
                return True
        return False
    for lado in (1, -1):
        x = int(b["x1"]) if lado == 1 else int(b["x0"])
        ultimo, vazio = x, 0
        while 0 < x < W - 1 and abs(x - (b["x1"] if lado == 1 else b["x0"])) < 3.2 * lh:
            x += lado * 2
            if tinta(x):
                ultimo, vazio = x, 0
            else:
                vazio += 2
                if vazio > 0.7 * lh:
                    break
        if lado == 1:
            b["x1"] = max(b["x1"], ultimo)
        else:
            b["x0"] = min(b["x0"], ultimo)


def traduzir(textos):
    if os.environ.get("TRADUZIR_FAKE"):
        return [f"[PT] {t}" for t in textos]
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not key:
        raise SystemExit("Falta ANTHROPIC_API_KEY para traduzir")
    prompt = (
        "Estes são textos escritos na tela de um vídeo curto de produto, lidos por OCR (podem ter pequenos erros de leitura). "
        "Traduza cada um para português do Brasil, natural e curto como legenda de vídeo, com o MESMO sentido e as mesmas informações "
        "(números, medidas e nomes de marca iguais). Corrija erros óbvios de OCR. Se o texto já estiver em português, devolva igual. "
        "Se for lixo sem sentido (letras soltas), devolva string vazia.\n"
        "Responda SOMENTE com um array JSON de strings, na mesma ordem e com o mesmo tamanho:\n"
        + json.dumps(textos, ensure_ascii=False)
    )
    body = {"model": os.environ.get("ANTHROPIC_MODEL_TRADUCAO", "claude-haiku-5-5"), "max_tokens": 4000,
            "messages": [{"role": "user", "content": prompt}]}
    if "haiku" in body["model"]:
        body["thinking"] = {"type": "disabled"}
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
                                 headers={"content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01"})
    j = json.loads(urllib.request.urlopen(req, timeout=120).read())
    raw = "".join(c.get("text", "") for c in j.get("content", []))
    out = json.loads(raw[raw.index("["): raw.rindex("]") + 1])
    if len(out) != len(textos):
        raise RuntimeError("tradução veio com tamanho diferente")
    return [str(x).strip() for x in out]


def cor_fundo(video, t, box):
    """cor do fundo atrás do texto (borda da caixa) → caixa da mesma cor e texto preto/branco"""
    f = tempfile.mktemp(suffix=".png")
    sh("ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", video, "-frames:v", "1", f)
    im = Image.open(f).convert("RGB")
    x0, y0, x1, y1 = [int(v) for v in (box["x0"], box["y0"], box["x1"], box["y1"])]
    px = []
    for x in range(max(0, x0 - 4), min(im.width, x1 + 4), max(1, (x1 - x0) // 40)):
        for y in (max(0, y0 - 4), min(im.height - 1, y1 + 4)):
            px.append(im.getpixel((x, y)))
    os.remove(f)
    if not px:
        return (255, 255, 255), (20, 20, 20)
    c = tuple(int(median(p[i] for p in px)) for i in range(3))
    lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
    # fundo muito "sujo" (texto solto em cima da imagem): usa caixa branca, que fica limpa
    var = median(abs(p[0] - c[0]) + abs(p[1] - c[1]) + abs(p[2] - c[2]) for p in px)
    if var > 60:
        return (255, 255, 255), (20, 20, 20)
    return c, ((20, 20, 20) if lum > 140 else (255, 255, 255))


def quebrar(draw, texto, fonte, largura):
    palavras, linhas, atual = texto.split(), [], ""
    for p in palavras:
        teste = (atual + " " + p).strip()
        if draw.textlength(teste, font=fonte) <= largura or not atual:
            atual = teste
        else:
            linhas.append(atual)
            atual = p
    if atual:
        linhas.append(atual)
    return linhas


def caixa_png(texto, box, lh, fundo, cor, W, H, arq):
    pad = max(8, int(lh * 0.35))
    x0, y0 = max(0, box["x0"] - pad), max(0, box["y0"] - pad)
    x1, y1 = min(W, box["x1"] + pad), min(H, box["y1"] + pad)
    larg = max(x1 - x0, int(W * 0.35))
    if larg > x1 - x0:  # texto em português costuma ser maior: alarga para os dois lados
        cx = (x0 + x1) / 2
        x0, x1 = max(0, cx - larg / 2), min(W, cx + larg / 2)
    alt_max = max(y1 - y0, int((y1 - y0) * 1.9))
    tam = int(min(lh * 1.05, H * 0.07))
    im = Image.new("RGBA", (1, 1))
    d = ImageDraw.Draw(im)
    while tam > 14:
        fonte = ImageFont.truetype(FONTE, tam) if FONTE else ImageFont.load_default()
        linhas = quebrar(d, texto, fonte, (x1 - x0) - 2 * pad)
        alt = len(linhas) * tam * 1.2 + 2 * pad
        if alt <= alt_max and all(d.textlength(l, font=fonte) <= (x1 - x0) - 2 * pad for l in linhas):
            break
        tam -= 2
    alt = int(max(y1 - y0, len(linhas) * tam * 1.2 + 2 * pad))
    cy = (y0 + y1) / 2
    y0 = int(max(0, min(H - alt, cy - alt / 2)))
    w = int(x1 - x0)
    im = Image.new("RGBA", (w, alt), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, alt - 1], radius=int(min(alt, w) * 0.18), fill=fundo + (255,))
    ty = (alt - len(linhas) * tam * 1.2) / 2
    for l in linhas:
        lw = d.textlength(l, font=fonte)
        d.text(((w - lw) / 2, ty), l, font=fonte, fill=cor + (255,))
        ty += tam * 1.2
    im.save(arq)
    return int(x0), y0


def main(entrada, saida):
    W, H, dur = info(entrada)
    tmp = tempfile.mkdtemp()
    segs = ler_texto(entrada, tmp, W, H)
    if not segs:
        log("SEM_TEXTO")
        sh("cp", entrada, saida)
        return
    acertar_tempo(segs, entrada, W, H)
    trad = traduzir([s["texto"] for s in segs])
    usar = []
    for s, pt in zip(segs, trad):
        log(f"  {s['ini']:.2f}-{s['fim']:.2f}s  {s['texto']!r} → {pt!r}")
        if pt and pt.strip().lower() != s["texto"].strip().lower():
            s["pt"] = pt
            usar.append(s)
    if not usar:
        log("SEM_TEXTO (já estava em português)")
        sh("cp", entrada, saida)
        return
    entradas, filtros, ant = ["-i", entrada], [], "[0:v]"
    for i, s in enumerate(usar):
        meio = (s["ini"] + s["fim"]) / 2
        alargar(entrada, s, W, H)
        fundo, cor = cor_fundo(entrada, meio, s["box"])
        png = os.path.join(tmp, f"t{i}.png")
        x, y = caixa_png(s["pt"], s["box"], s["lh"], fundo, cor, W, H, png)
        entradas += ["-i", png]
        ini, fim = max(0, s["ini"]), min(dur, s["fim"])
        lab = f"[v{i}]"
        filtros.append(f"{ant}[{i + 1}:v]overlay={x}:{y}:enable='between(t,{ini:.2f},{fim:.2f})'{lab}")
        ant = lab
    sh("ffmpeg", "-v", "error", "-y", *entradas, "-filter_complex", ";".join(filtros), "-map", ant, "-map", "0:a?",
       "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", saida)
    log(f"TRADUZIDO {len(usar)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
