"use client";

import { useEffect, useRef, useState } from "react";

const INTERVAL = 5000; // tempo de cada banner na tela

// Banners com arte, entre a frase e a busca. Passam sozinhos, dá para arrastar com o dedo,
// e param de passar enquanto a pessoa está tocando ou com o mouse em cima.
export default function BannerCarousel({ banners }) {
  const track = useRef(null);
  const [index, setIndex] = useState(0);
  const paused = useRef(false);
  const many = banners.length > 1;

  // Atualiza o pontinho conforme a pessoa arrasta
  function onScroll() {
    const el = track.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index) setIndex(i);
  }

  function go(i) {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  useEffect(() => {
    if (!many) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const t = setInterval(() => {
      if (paused.current || document.hidden) return;
      const el = track.current;
      if (!el) return;
      const cur = Math.round(el.scrollLeft / el.clientWidth);
      go((cur + 1) % banners.length);
    }, INTERVAL);
    return () => clearInterval(t);
  }, [many, banners.length]);

  if (!banners.length) return null;

  const pause = () => { paused.current = true; };
  const resume = () => { paused.current = false; };

  return (
    <section className="banners" aria-label="Campanhas" aria-roledescription="carrossel">
      <div
        className="banners-track"
        ref={track}
        onScroll={onScroll}
        onPointerEnter={pause}
        onPointerLeave={resume}
        onTouchStart={pause}
        onTouchEnd={() => setTimeout(resume, 2500)}
      >
        {banners.map((b, i) => (
          <a
            key={b.id}
            className="banner"
            href={`/b/${b.id}`}
            rel="nofollow sponsored noopener"
            aria-label={b.title || `Banner ${i + 1}`}
            aria-roledescription="slide"
          >
            <img
              src={b.image_url}
              alt={b.title || ""}
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : "auto"}
              decoding="async"
              draggable="false"
            />
          </a>
        ))}
      </div>
      {many && (
        <div className="banner-dots">
          {banners.map((b, i) => (
            <button
              key={b.id}
              type="button"
              className={i === index ? "on" : ""}
              onClick={() => go(i)}
              aria-label={`Mostrar banner ${i + 1}`}
              aria-current={i === index}
            />
          ))}
        </div>
      )}
    </section>
  );
}
