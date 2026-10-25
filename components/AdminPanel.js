"use client";

import { useEffect, useMemo, useState } from "react";

const EMPTY = {
  kind: "produto", title: "", description: "", image_url: "", price: "", original_price: "",
  link: "", platform: "shopee", category: "", coupon_code: "", badge: "", pinned: false,
  active: true, expires_at: "",
};

const brl = (v) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

// datetime-local <-> ISO
const toLocal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function AdminPanel({ dbReady, shopeeReady }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [importUrl, setImportUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // {type, text}
  const [filter, setFilter] = useState("");

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function load() {
    if (!dbReady) return;
    const r = await fetch("/api/offers");
    if (r.ok) setItems(await r.json());
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(), [items]);
  const totalClicks = items.reduce((s, i) => s + (i.clicks || 0), 0);
  const activeCount = items.filter((i) => i.active).length;

  async function doImport() {
    if (!importUrl.trim()) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: importUrl }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ type: "warn", text: j.error });
    setForm((f) => ({
      ...f,
      link: j.link || f.link,
      platform: j.platform || f.platform,
      title: j.title || f.title,
      image_url: j.image_url || f.image_url,
      price: j.price ?? f.price,
      original_price: j.original_price ?? f.original_price,
    }));
    const extra = j.commission ? ` Comissão: ${j.commission}%.` : "";
    setMsg(
      j.warnings?.length
        ? { type: "warn", text: j.warnings.join(" ") + extra }
        : { type: "ok", text: "Dados puxados! Confira e salve." + extra }
    );
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const payload = { ...form, expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null };
    const r = await fetch(editing ? `/api/offers/${editing}` : "/api/offers", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg({ type: "warn", text: j.error });
    setMsg({ type: "ok", text: editing ? "Atualizado!" : `Publicado como #${j.id} ✅ Fale no vídeo: "produto ${j.id} na bio".` });
    reset(false);
    load();
  }

  function reset(clearMsg = true) {
    setForm((f) => ({ ...EMPTY, kind: f.kind }));
    setEditing(null);
    setImportUrl("");
    if (clearMsg) setMsg(null);
  }

  function edit(o) {
    setEditing(o.id);
    setForm({
      ...EMPTY,
      ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v ?? ""])),
      pinned: !!o.pinned,
      active: !!o.active,
      expires_at: toLocal(o.expires_at),
    });
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function patch(o, changes) {
    setItems((list) => list.map((i) => (i.id === o.id ? { ...i, ...changes } : i)));
    await fetch(`/api/offers/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
  }

  async function remove(o) {
    if (!confirm(`Excluir "${o.title}"?`)) return;
    await fetch(`/api/offers/${o.id}`, { method: "DELETE" });
    setItems((list) => list.filter((i) => i.id !== o.id));
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.reload();
  }

  const isCoupon = form.kind === "cupom";
  const shown = items.filter((i) => !filter || String(i.id) === filter.replace("#", "") || i.title.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="adm">
      <div className="adm-top">
        <h1>Painel</h1>
        <div className="links">
          <a className="btn ghost sm" href="/" target="_blank">Ver vitrine</a>
          <button className="btn ghost sm" onClick={logout}>Sair</button>
        </div>
      </div>

      {!dbReady && <div className="warn">Supabase não configurado. Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY e rode o supabase/schema.sql.</div>}
      {!shopeeReady && <div className="warn">API da Shopee não configurada: os dados de links Shopee não serão puxados automaticamente (cole seu link de afiliado e preencha à mão).</div>}

      <div className="kpis">
        <div className="kpi"><b>{activeCount}</b><span>ofertas ativas</span></div>
        <div className="kpi"><b>{totalClicks.toLocaleString("pt-BR")}</b><span>cliques totais</span></div>
        <div className="kpi"><b>{items.filter((i) => i.kind === "cupom" && i.active).length}</b><span>cupons</span></div>
      </div>

      <form className="panel" onSubmit={save}>
        <h2>{editing ? `Editando #${editing}` : "Nova oferta"}</h2>

        <div className="tabs">
          <button type="button" className={!isCoupon ? "on" : ""} onClick={() => set("kind", "produto")}>🛍️ Produto</button>
          <button type="button" className={isCoupon ? "on" : ""} onClick={() => set("kind", "cupom")}>🎟️ Cupom</button>
        </div>

        {!isCoupon && (
          <div className="field">
            <label>Cole o link (Shopee ou TikTok Shop) e puxe os dados</label>
            <div className="inline">
              <input value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="https://shopee.com.br/..." inputMode="url" />
              <button type="button" className="btn orange" onClick={doImport} disabled={busy || !importUrl}>
                {busy ? "…" : "Puxar"}
              </button>
            </div>
          </div>
        )}

        {msg && <div className={msg.type}>{msg.text}</div>}

        {form.image_url && !isCoupon && (
          <div className="preview">
            <img src={form.image_url} alt="" />
            <small style={{ color: "var(--muted)" }}>Prévia da foto</small>
          </div>
        )}

        <div className="field">
          <label>{isCoupon ? "Título do cupom (ex: R$20 OFF acima de R$99)" : "Título"}</label>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} required />
        </div>

        {isCoupon && (
          <div className="row">
            <div className="field">
              <label>Código</label>
              <input value={form.coupon_code} onChange={(e) => set("coupon_code", e.target.value.toUpperCase())} placeholder="MODA20" />
            </div>
            <div className="field">
              <label>Válido até</label>
              <input type="datetime-local" value={form.expires_at} onChange={(e) => set("expires_at", e.target.value)} />
            </div>
          </div>
        )}

        <div className="field">
          <label>Link de afiliado (para onde o clique vai)</label>
          <input value={form.link} onChange={(e) => set("link", e.target.value)} required inputMode="url" placeholder="https://s.shopee.com.br/..." />
        </div>

        {!isCoupon && (
          <>
            <div className="field">
              <label>URL da foto</label>
              <input value={form.image_url} onChange={(e) => set("image_url", e.target.value)} inputMode="url" />
            </div>
            <div className="row">
              <div className="field">
                <label>Preço (R$)</label>
                <input value={form.price} onChange={(e) => set("price", e.target.value)} inputMode="decimal" placeholder="59,90" />
              </div>
              <div className="field">
                <label>Preço antigo (R$)</label>
                <input value={form.original_price} onChange={(e) => set("original_price", e.target.value)} inputMode="decimal" placeholder="119,90" />
              </div>
            </div>
          </>
        )}

        <div className="row">
          <div className="field">
            <label>Plataforma</label>
            <select value={form.platform} onChange={(e) => set("platform", e.target.value)}>
              <option value="shopee">Shopee</option>
              <option value="tiktok">TikTok Shop</option>
              <option value="outro">Outra loja</option>
            </select>
          </div>
          <div className="field">
            <label>Categoria</label>
            <input value={form.category} onChange={(e) => set("category", e.target.value)} list="cats" placeholder="Moda" />
            <datalist id="cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>

        <div className="row">
          <div className="field">
            <label>Selo (opcional)</label>
            <input value={form.badge} onChange={(e) => set("badge", e.target.value)} list="badges" placeholder="Mais vendido" />
            <datalist id="badges">
              {["Mais vendido", "Frete grátis", "Últimas unidades", "Queridinho", "Oferta relâmpago"].map((b) => <option key={b} value={b} />)}
            </datalist>
          </div>
          {!isCoupon && (
            <div className="field">
              <label>Oferta expira em (opcional)</label>
              <input type="datetime-local" value={form.expires_at} onChange={(e) => set("expires_at", e.target.value)} />
            </div>
          )}
        </div>

        {isCoupon && (
          <div className="field">
            <label>Descrição curta</label>
            <input value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Válido em moda feminina" />
          </div>
        )}

        <label className="check">
          <input type="checkbox" checked={form.pinned} onChange={(e) => set("pinned", e.target.checked)} />
          Destacar no topo
        </label>

        <div className="actions">
          {editing && <button type="button" className="btn ghost" onClick={() => reset()}>Cancelar</button>}
          <button className="btn" disabled={busy || !dbReady}>{editing ? "Salvar alterações" : "Publicar na vitrine"}</button>
        </div>
      </form>

      <div className="panel">
        <h2>Minhas ofertas ({items.length})</h2>
        <div className="list-tools">
          <input placeholder="Filtrar por nome ou #nº" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        {shown.map((o) => (
          <div key={o.id} className={`item ${o.active ? "" : "off"}`}>
            {o.image_url ? <img src={o.image_url} alt="" /> : <div className="ph">{o.kind === "cupom" ? "🎟️" : "🛍️"}</div>}
            <div className="meta">
              <b>#{o.id} · {o.title}</b>
              <small>
                {o.kind === "cupom" ? `Cupom ${o.coupon_code || ""}` : brl(o.price)} · {o.clicks || 0} cliques
                {o.pinned ? " · ⭐" : ""}
                {o.expires_at && new Date(o.expires_at) < new Date() ? " · expirado" : ""}
              </small>
            </div>
            <div className="btns">
              <button className="btn ghost sm" onClick={() => patch(o, { active: !o.active })} title="Mostrar/ocultar">{o.active ? "👁" : "🚫"}</button>
              <button className="btn ghost sm" onClick={() => patch(o, { pinned: !o.pinned })} title="Destaque">{o.pinned ? "★" : "☆"}</button>
              <button className="btn ghost sm" onClick={() => edit(o)}>Editar</button>
              <button className="btn danger sm" onClick={() => remove(o)}>✕</button>
            </div>
          </div>
        ))}
        {!shown.length && <p style={{ color: "var(--muted)", fontSize: 14 }}>Nenhuma oferta ainda.</p>}
      </div>
    </div>
  );
}
