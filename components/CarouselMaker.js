"use client";

import { useEffect, useRef, useState } from "react";
import { SLIDE_COUNT, buildData, defaultTexts, drawSlide, loadFonts, loadImage } from "@/lib/carouselCanvas";

const toBlob = (canvas) => new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.92));

export default function CarouselMaker({ offer, defaultHandle = "", onClose }) {
  const number = `#${offer.id}`;
  const [img, setImg] = useState(undefined); // undefined = carregando, null = sem foto
  const [stats, setStats] = useState({});
  const [showNumber, setShowNumber] = useState(true);
  const [handle, setHandle] = useState(defaultHandle);
  const [texts, setTexts] = useState(() => defaultTexts(offer, number));
  const [captionTouched, setCaptionTouched] = useState(false);
  const [status, setStatus] = useState("");
  const canvases = useRef([]);

  // foto + fontes + números do produto
  useEffect(() => {
    let alive = true;
    Promise.all([loadImage(offer.image_url), loadFonts()]).then(([i]) => alive && setImg(i));
    fetch(`/api/offers/${offer.id}/carrossel`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((s) => alive && setStats(s || {}))
      .catch(() => {});
    return () => { alive = false; };
  }, [offer.id, offer.image_url]);

  // legenda automática acompanha os números e o #ID (até você editar à mão)
  useEffect(() => {
    if (captionTouched) return;
    setTexts((t) => ({ ...t, legenda: defaultTexts(offer, showNumber ? number : null, stats).legenda }));
  }, [stats, showNumber]); // eslint-disable-line

  // redesenha quando algo muda
  useEffect(() => {
    if (img === undefined) return;
    const d = buildData(offer, texts, { img, stats, number: showNumber ? number : null, handle: handle.trim() });
    canvases.current.forEach((c, i) => c && drawSlide(c, i, d));
  }, [img, stats, texts, showNumber, handle, offer, number]);

  // fecha com Esc e trava a rolagem da página de trás
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const setT = (k, v) => setTexts((t) => ({ ...t, [k]: v }));
  const setDest = (i, v) => setTexts((t) => ({ ...t, destaques: t.destaques.map((d, j) => (j === i ? v : d)) }));

  async function files() {
    const out = [];
    for (let i = 0; i < SLIDE_COUNT; i++) {
      const blob = await toBlob(canvases.current[i]);
      out.push(new File([blob], `carrossel-${offer.id}-${i + 1}.jpg`, { type: "image/jpeg" }));
    }
    return out;
  }

  async function download() {
    setStatus("Gerando imagens…");
    const list = await files();
    for (const f of list) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(f);
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      await new Promise((r) => setTimeout(r, 350)); // o navegador bloqueia downloads em rajada
    }
    setStatus("Pronto! Se o navegador perguntar, permita baixar vários arquivos.");
  }

  async function share() {
    setStatus("Preparando…");
    try {
      const list = await files();
      if (!navigator.canShare?.({ files: list })) {
        setStatus("Seu navegador não compartilha imagens. Use \"Baixar imagens\".");
        return;
      }
      await navigator.clipboard?.writeText(texts.legenda).catch(() => {});
      await navigator.share({ files: list, text: texts.legenda });
      setStatus("Legenda copiada. É só colar no post.");
    } catch (e) {
      setStatus(e.name === "AbortError" ? "" : "Não consegui compartilhar. Use \"Baixar imagens\".");
    }
  }

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(texts.legenda);
      setStatus("Legenda copiada!");
    } catch {
      setStatus("Não consegui copiar. Selecione o texto e copie.");
    }
  }

  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div className="cm-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cm" role="dialog" aria-label="Gerar carrossel">
        <div className="cm-head">
          <h2>Carrossel · {number}</h2>
          <button className="btn ghost sm" onClick={onClose}>Fechar</button>
        </div>

        <div className="cm-strip">
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <canvas key={i} ref={(el) => (canvases.current[i] = el)} width={1080} height={1350} />
          ))}
          {img === undefined && <div className="cm-loading">Carregando foto…</div>}
        </div>
        {img === null && <div className="warn">Não consegui carregar a foto do produto. Confira a URL da foto na oferta.</div>}
        {!stats.sales && img !== undefined && (
          <div className="cm-note">Sem vendas/nota deste produto: o slide 2 usa o preço, o desconto ou os destaques que você escrever.</div>
        )}

        <div className="field">
          <label>Frase da capa</label>
          <input value={texts.gancho} onChange={(e) => setT("gancho", e.target.value)} maxLength={80} />
        </div>
        <div className="field">
          <label>Nome do produto (slide 3)</label>
          <input value={texts.nome} onChange={(e) => setT("nome", e.target.value)} maxLength={60} />
        </div>
        <div className="field">
          <label>Destaques (opcional, até 3)</label>
          {texts.destaques.map((d, i) => (
            <input key={i} value={d} onChange={(e) => setDest(i, e.target.value)} maxLength={40}
              placeholder={["Ex: Hidrata a pele", "Ex: Cabe na bolsa", "Ex: Kit com 2 itens"][i]} style={{ marginTop: i ? 6 : 0 }} />
          ))}
        </div>
        <div className="row">
          <div className="field">
            <label>Seu @ (último slide)</label>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@seuperfil" />
          </div>
          <label className="check" style={{ alignSelf: "end", marginBottom: 22 }}>
            <input type="checkbox" checked={showNumber} onChange={(e) => setShowNumber(e.target.checked)} />
            Mostrar {number}
          </label>
        </div>
        <div className="field">
          <label>Legenda</label>
          <textarea value={texts.legenda} onChange={(e) => { setCaptionTouched(true); setT("legenda", e.target.value); }} rows={7} style={{ height: "auto" }} />
        </div>

        {status && <div className="ok">{status}</div>}

        <div className="cm-actions">
          {canShare && <button className="btn orange" onClick={share} disabled={img === undefined}>Salvar / compartilhar</button>}
          <button className="btn" onClick={download} disabled={img === undefined}>Baixar imagens</button>
          <button className="btn ghost" onClick={copyCaption}>Copiar legenda</button>
        </div>
      </div>
    </div>
  );
}
