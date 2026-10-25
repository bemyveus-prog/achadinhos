"use client";

import { useEffect, useState } from "react";
import { slugifyClient } from "./slug";

export default function AdminHome() {
  const [stores, setStores] = useState(null);
  const [form, setForm] = useState({ name: "", slug: "", password: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [pwFor, setPwFor] = useState(null); // id da vitrine com o campo de nova senha aberto
  const [newPw, setNewPw] = useState("");
  const host = typeof window !== "undefined" ? window.location.host : "";

  async function load() {
    const r = await fetch("/api/admin/stores");
    const j = await r.json().catch(() => []);
    if (r.ok) setStores(j);
    else setMsg({ type: "warn", text: j.error || "Erro ao carregar. Você rodou a migração 2 no Supabase?" });
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ type: "warn", text: j.error });
    setMsg({
      type: "ok",
      text: `Vitrine criada. Envie para o afiliado: endereço ${host}/${j.slug}, painel ${host}/admin, usuário "${j.slug}" e a senha que você definiu.`,
    });
    setForm({ name: "", slug: "", password: "" });
    setSlugTouched(false);
    load();
  }

  async function update(st, changes, okText) {
    setMsg(null);
    const r = await fetch(`/api/admin/stores/${st.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg({ type: "warn", text: j.error });
    if (okText) setMsg({ type: "ok", text: okText });
    load();
  }

  async function remove(st) {
    if (!confirm(`Excluir a vitrine "${st.name}" e TODAS as ofertas dela? Não dá para desfazer.`)) return;
    const r = await fetch(`/api/admin/stores/${st.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg({ type: "warn", text: j.error });
    setMsg({ type: "ok", text: "Vitrine excluída." });
    load();
  }

  async function manage(st) {
    await fetch("/api/admin/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ store_id: st.id }) });
    window.location.reload();
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.reload();
  }

  const totalClicks = (stores || []).reduce((s, x) => s + x.clicks, 0);

  return (
    <div className="adm">
      <div className="adm-top">
        <div>
          <h1>Vitrines</h1>
          <span className="adm-url">Administrador geral</span>
        </div>
        <div className="links">
          <button className="btn ghost sm" onClick={logout}>Sair</button>
        </div>
      </div>

      {msg && <div className={msg.type}>{msg.text}</div>}

      <div className="kpis">
        <div className="kpi"><b>{stores ? stores.length : "–"}</b><span>vitrines</span></div>
        <div className="kpi"><b>{stores ? stores.filter((s) => s.active).length : "–"}</b><span>ativas</span></div>
        <div className="kpi"><b>{totalClicks.toLocaleString("pt-BR")}</b><span>cliques totais</span></div>
      </div>

      <form className="panel" onSubmit={create}>
        <h2>Novo afiliado</h2>
        <div className="field">
          <label htmlFor="ns-name">Nome da vitrine</label>
          <input
            id="ns-name" value={form.name} placeholder="Achadinhos da Maria" required
            onChange={(e) => {
              const name = e.target.value;
              setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugifyClient(name) }));
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="ns-slug">Endereço e usuário de login</label>
          <div className="slug-input">
            <span>/</span>
            <input
              id="ns-slug" value={form.slug} placeholder="maria" required autoCapitalize="none"
              onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: slugifyClient(e.target.value) })); }}
            />
          </div>
          {form.slug && <small className="help" style={{ margin: "6px 0 0" }}>Vitrine: {host}/{form.slug} · login: {form.slug}</small>}
        </div>
        <div className="field">
          <label htmlFor="ns-pass">Senha inicial (mínimo 6 caracteres)</label>
          <input id="ns-pass" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} minLength={6} required autoComplete="off" />
        </div>
        <button className="btn" style={{ width: "100%" }} disabled={busy}>{busy ? "Criando…" : "Criar vitrine"}</button>
      </form>

      <div className="panel">
        <h2>Todas as vitrines</h2>
        {!stores && <p className="help">Carregando…</p>}
        {stores?.map((st) => (
          <div key={st.id} className={`store-row ${st.active ? "" : "is-off"}`}>
            <div className="store-main">
              <div className="store-name">
                <b>{st.name}</b>
                {st.is_owner && <span className="tag-ok">principal</span>}
                {!st.active && <span className="tag-off">bloqueada</span>}
              </div>
              <a className="adm-url" href={`/${st.slug}`} target="_blank" rel="noopener">/{st.slug}</a>
              <small className="help">
                {st.offers} ofertas ativas · {st.clicks} cliques · {st.has_shopee ? "API Shopee própria" : "sem API Shopee"}
                {!st.has_password && " · sem senha (só você entra)"}
              </small>
            </div>
            <div className="store-actions">
              <button className="btn sm" onClick={() => manage(st)}>Gerenciar</button>
              <button className="btn ghost sm" onClick={() => { setPwFor(pwFor === st.id ? null : st.id); setNewPw(""); }}>Senha</button>
              {!st.is_owner && (
                <button className="btn ghost sm" onClick={() => update(st, { active: !st.active }, st.active ? "Vitrine bloqueada: saiu do ar e o afiliado não entra mais." : "Vitrine liberada.")}>
                  {st.active ? "Bloquear" : "Liberar"}
                </button>
              )}
              {!st.is_owner && st.active && (
                <button className="btn ghost sm" onClick={() => update(st, { is_owner: true }, `"${st.name}" agora abre no endereço principal do site.`)}>Tornar principal</button>
              )}
              {!st.is_owner && <button className="btn danger sm" onClick={() => remove(st)}>Excluir</button>}
            </div>
            {pwFor === st.id && (
              <form
                className="inline pw-inline"
                onSubmit={(e) => { e.preventDefault(); update(st, { password: newPw }, `Senha de "${st.slug}" alterada.`); setPwFor(null); }}
              >
                <input value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="nova senha" minLength={6} required autoComplete="off" />
                <button className="btn sm">Salvar</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
