"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import BannerCarousel from "./BannerCarousel";

const brl = (v) =>
  v == null ? "" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PLATFORM = {
  shopee: { label: "Shopee", cls: "p-shopee" },
  tiktok: { label: "TikTok Shop", cls: "p-tiktok" },
  amazon: { label: "Amazon", cls: "p-amazon" },
  shein: { label: "Shein", cls: "p-shein" },
  aliexpress: { label: "AliExpress", cls: "p-ali" },
  outro: { label: "Loja", cls: "p-outro" },
};

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function Vitrine({ offers, profile, demo, banners = [] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Todos");
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const coupons = offers.filter((o) => o.kind === "cupom");
  const products = offers.filter((o) => o.kind !== "cupom");

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean));
    // categorias "Kit ..." (campanhas, como o Kit Emergência) vêm primeiro
    const sorted = [...set].sort((a, b) => (/^kit/i.test(b) - /^kit/i.test(a)) || a.localeCompare(b, "pt-BR"));
    return ["Todos", ...(coupons.length ? ["Cupons"] : []), ...sorted];
  }, [offers]); // eslint-disable-line

  // Busca: "23" ou "#23" vai direto no produto do vídeo
  const num = q.trim().replace(/^#/, "");
  const isNum = /^\d+$/.test(num);

  const filtered = useMemo(() => {
    if (isNum) return products.filter((p) => String(p.id) === num);
    const nq = norm(q);
    return products.filter(
      (p) =>
        (cat === "Todos" || p.category === cat) &&
        (!nq || norm(p.title).includes(nq) || norm(p.category).includes(nq))
    );
  }, [q, cat, offers]); // eslint-disable-line

  const showCoupons = coupons.length > 0 && !q && (cat === "Todos" || cat === "Cupons");
  const showProducts = cat !== "Cupons" || q;

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }

  // Compartilhar um produto: no celular abre a janela do sistema (Stories, WhatsApp, TikTok...)
  // com a imagem vertical do produto; o link é copiado para colar no adesivo de link do Stories.
  const [sheet, setSheet] = useState(null);
  async function share(p) {
    const url = `${window.location.origin}/p/${p.id}`;
    const text = `${p.title}${p.price != null ? ` por ${brl(p.price)}` : ""} 🛍️ Achei ${p.platform === "amazon" ? "na Amazon" : p.platform === "shein" ? "na Shein" : p.platform === "aliexpress" ? "na AliExpress" : "na Shopee"}:`;
    try { await navigator.clipboard?.writeText(url); } catch {}
    try {
      if (navigator.canShare) {
        const r = await fetch(`/api/story/${p.id}`);
        if (r.ok) {
          const file = new File([await r.blob()], `achadinho-${p.id}.png`, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            flash("Link copiado! No Stories, cole no adesivo de link 🔗");
            await navigator.share({ files: [file], text: `${text} ${url}` });
            return;
          }
        }
      }
      if (navigator.share) { await navigator.share({ title: p.title, text, url }); return; }
    } catch (e) {
      if (e?.name === "AbortError") return; // a pessoa fechou a janela
    }
    setSheet({ p, url, text }); // computador: escolhe a rede
  }

  function openCoupon(c) {
    if (c.coupon_code) {
      navigator.clipboard?.writeText(c.coupon_code).catch(() => {});
      flash(`Cupom ${c.coupon_code} copiado! Abrindo a loja…`);
      setTimeout(() => (window.location.href = `/r/${c.id}`), 900);
    } else {
      window.location.href = `/r/${c.id}`;
    }
  }

  useEffect(() => {
    // abre direto no produto se vier com ?p=23 (ex: link do vídeo)
    const params = new URLSearchParams(window.location.search);
    const p = params.get("p");
    if (p) setQ(p);
    // abre direto numa categoria com ?c=kit (vale o começo do nome, sem acento)
    const c = norm(params.get("c") || "");
    if (c) {
      const found = categories.find((x) => norm(x).startsWith(c));
      if (found) setCat(found);
    }
  }, []);

  const initials = profile.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <main className="wrap">
      {demo && (
        <div className="demo">Modo demonstração — configure o Supabase para ver suas ofertas reais.</div>
      )}

      <header className="hero">
        <div className="avatar-ring">
          {profile.avatar ? (
            <img className="avatar" src={profile.avatar} alt={profile.name} />
          ) : (
            <div className="avatar avatar-fallback">{initials}</div>
          )}
        </div>
        <h1 className="name">{profile.name}</h1>
        {profile.handle && <p className="handle">{profile.handle}</p>}
        <p className="tagline">{profile.tagline}</p>
        <div className="stats">
          <span className="dot" /> {products.length} achados · {coupons.length} cupons ativos
        </div>
        <Socials s={profile.socials} />
        <Canais c={profile.canais} />
      </header>

      <BannerCarousel banners={banners} />

      <div className="sticky">
        <label className="search">
          <SearchIcon />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar ou digite o nº do vídeo"
            inputMode="search"
            enterKeyHint="search"
          />
          {q && (
            <button className="clear" onClick={() => setQ("")} aria-label="Limpar">
              ×
            </button>
          )}
        </label>
        {!isNum && (
          <nav className="chips">
            {categories.map((c) => (
              <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>
                {c === "Cupons" ? "🎟️ Cupons" : c}
              </button>
            ))}
          </nav>
        )}
      </div>

      {showCoupons && (
        <section className="section">
          <div className="section-head">
            <h2>Cupons do momento</h2>
            <span className="hint">toque para copiar</span>
          </div>
          <div className={cat === "Cupons" ? "coupon-list" : "rail"}>
            {coupons.map((c) => (
              <button key={c.id} className="coupon" onClick={() => openCoupon(c)}>
                <div className="coupon-left">
                  <span className={`pill ${PLATFORM[c.platform]?.cls || "p-outro"}`}>
                    {PLATFORM[c.platform]?.label || "Loja"}
                  </span>
                  <strong className="coupon-title">{c.title}</strong>
                  {c.description && <span className="coupon-desc">{c.description}</span>}
                  {c.expires_at && <span className="coupon-exp">até {new Date(c.expires_at).toLocaleDateString("pt-BR")}</span>}
                </div>
                <div className="coupon-right">
                  {c.coupon_code ? <span className="code">{c.coupon_code}</span> : <span className="code">VER</span>}
                  <span className="coupon-cta">{c.coupon_code ? "Copiar" : "Abrir"}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {showProducts && (
        <section className="section">
          {isNum ? (
            <div className="section-head">
              <h2>Produto do vídeo #{num}</h2>
            </div>
          ) : (
            <div className="section-head">
              <h2>{cat === "Todos" || cat === "Cupons" ? "Achadinhos" : cat}</h2>
              <span className="hint">{filtered.length} itens</span>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="empty">
              <p>Nada encontrado {isNum ? `com o nº ${num}` : "por aqui"}.</p>
              <button className="chip on" onClick={() => { setQ(""); setCat("Todos"); }}>Ver todos</button>
            </div>
          ) : (
            <div className={`grid ${isNum ? "single" : ""}`}>
              {filtered.map((p, i) => (
                <ProductCard key={p.id} p={p} eager={i < 4} onShare={() => share(p)} />
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="foot">
        <p>Preços e estoque podem mudar a qualquer momento. Como afiliado(a), posso receber comissão pelas compras feitas pelos links, sem custo extra pra você. 💛</p>
      </footer>

      <div className={`toast ${toast ? "show" : ""}`} role="status">{toast}</div>
      <Atividade onPick={(id) => { setQ(String(id)); window.scrollTo({ top: 0, behavior: "smooth" }); }} hidden={!!toast} />
      {sheet && <ShareSheet {...sheet} onClose={() => setSheet(null)} onCopied={() => flash("Link copiado!")} />}
    </main>
  );
}

// Aviso no rodapé com atividade REAL da vitrine (cliques únicos das últimas horas)
function Atividade({ onPick, hidden }) {
  const [msgs, setMsgs] = useState([]);
  const [i, setI] = useState(-1);
  useEffect(() => {
    let alive = true;
    fetch("/api/atividade").then((r) => r.json()).then((d) => { if (alive) setMsgs(d.msgs || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (!msgs.length) return;
    const first = setTimeout(() => setI(0), 4000);
    const t = setInterval(() => setI((x) => (x + 1) % (msgs.length * 2)), 5000); // aparece 5 s, some 5 s
    return () => { clearTimeout(first); clearInterval(t); };
  }, [msgs]);
  if (!msgs.length || i < 0) return null;
  const visible = i % 2 === 0 && !hidden;
  const m = msgs[Math.floor(i / 2) % msgs.length];
  return (
    <button type="button" className={`ativ ${visible ? "show" : ""}`} onClick={() => onPick(m.id)} aria-live="polite">
      {m.text}
    </button>
  );
}

function ShareSheet({ p, url, text, onClose, onCopied }) {
  const t = encodeURIComponent(`${text} ${url}`);
  const u = encodeURIComponent(url);
  const items = [
    { label: "WhatsApp", icon: "💬", href: `https://wa.me/?text=${t}` },
    { label: "Facebook", icon: "📘", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { label: "Telegram", icon: "✈️", href: `https://t.me/share/url?url=${u}&text=${encodeURIComponent(text)}` },
    { label: "X", icon: "✖️", href: `https://twitter.com/intent/tweet?text=${t}` },
    { label: "Pinterest", icon: "📌", href: `https://pinterest.com/pin/create/button/?url=${u}&media=${encodeURIComponent(p.image_url || "")}&description=${encodeURIComponent(text)}` },
    { label: "Imagem p/ Stories", icon: "🖼️", href: `/api/story/${p.id}`, download: `achadinho-${p.id}.png` },
  ];
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h4>Compartilhar #{p.id}</h4>
        <div className="sheet-grid">
          {items.map((i) => (
            <a key={i.label} href={i.href} target="_blank" rel="noopener" download={i.download}><i>{i.icon}</i>{i.label}</a>
          ))}
          <button onClick={async () => { try { await navigator.clipboard.writeText(url); } catch {} onCopied(); onClose(); }}><i>🔗</i>Copiar link</button>
        </div>
      </div>
    </div>
  );
}

function ShareIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>;
}

function ProductCard({ p, eager, onShare }) {
  const [err, setErr] = useState(false);
  const off =
    p.original_price && p.price && p.original_price > p.price
      ? Math.round((1 - p.price / p.original_price) * 100)
      : 0;
  const plat = PLATFORM[p.platform] || PLATFORM.outro;

  return (
    <div className="cardw">
    <a className="card" href={`/r/${p.id}`} rel="nofollow sponsored noopener">
      <div className="thumb">
        {p.image_url && !err ? (
          <img
            src={p.image_url}
            alt={p.title}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onError={() => setErr(true)}
          />
        ) : (
          <div className="thumb-fallback">🛍️</div>
        )}
        <span className="num">#{p.id}</span>
        {off >= 5 && <span className="off">-{off}%</span>}
        {(p.badge || p.pinned) && <span className="badge">{p.badge || "Destaque"}</span>}
      </div>
      <div className="info">
        <span className={`pill ${plat.cls}`}>{plat.label}</span>
        <h3 className="title">{p.title}</h3>
        <div className="prices">
          {p.original_price > p.price && <s>{brl(p.original_price)}</s>}
          {p.price != null && <strong>{brl(p.price)}</strong>}
        </div>
        <span className={`cta ${plat.cls}`}>
          Ver oferta <Arrow />
        </span>
      </div>
    </a>
    {onShare && (
      <button className="share" type="button" aria-label={`Compartilhar #${p.id}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShare(); }}>
        <ShareIcon />
      </button>
    )}
    </div>
  );
}

// convite para os canais de ofertas relâmpago
function Canais({ c }) {
  if (!c?.telegram && !c?.whatsapp) return null;
  return (
    <div className="canais">
      <p>⚡ Ofertas relâmpago que somem rápido: receba antes de todo mundo</p>
      <div>
        {c.telegram && <a className="canal tg" href={c.telegram} target="_blank" rel="noopener">Canal no Telegram</a>}
        {c.whatsapp && <a className="canal zap" href={c.whatsapp} target="_blank" rel="noopener">Canal no WhatsApp</a>}
      </div>
    </div>
  );
}

function Socials({ s }) {
  const items = [
    s.tiktok && { href: s.tiktok, label: "TikTok", d: "M16.6 5.82s.51.5 0 0A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z" },
    s.instagram && { href: s.instagram, label: "Instagram", stroke: true },
    s.youtube && { href: s.youtube, label: "YouTube", d: "M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3z" },
    s.whatsapp && { href: s.whatsapp, label: "WhatsApp", d: "M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .3-3.4-.7-2.9-1.2-4.7-4.1-4.8-4.3-.1-.2-1.2-1.6-1.2-3s.7-2.2 1-2.5c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.5.5c-.2.2-.3.4-.1.7.2.3.8 1.4 1.8 2.2 1.2 1.1 2.2 1.4 2.5 1.6.3.1.5.1.7-.1l1-1.2c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.6.3.1.2.1.8-.1 1.3z" },
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="socials">
      {items.map((i) => (
        <a key={i.label} href={i.href} aria-label={i.label} target="_blank" rel="noopener">
          {i.stroke ? (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d={i.d} /></svg>
          )}
        </a>
      ))}
    </div>
  );
}

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  </svg>
);
const Arrow = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
