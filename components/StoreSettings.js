"use client";

import { useState } from "react";

const FIELDS = [
  ["name", "Nome da vitrine", "Achadinhos da Maria"],
  ["handle", "Seu @", "@maria"],
  ["tagline", "Frase do topo", "Os achados que eu indico nos vídeos"],
  ["avatar_url", "URL da sua foto", "https://..."],
  ["tiktok_url", "Link do TikTok", "https://www.tiktok.com/@..."],
  ["instagram_url", "Link do Instagram", "https://instagram.com/..."],
  ["youtube_url", "Link do YouTube", "https://youtube.com/@..."],
  ["whatsapp_url", "Link do WhatsApp", "https://wa.me/55..."],
];

export default function StoreSettings({ store, adminActing, onSaved }) {
  const [form, setForm] = useState({ ...store, shopee_app_secret: "" });
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function send(payload, okText) {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/store", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ type: "warn", text: j.error || "Não foi possível salvar" });
    onSaved?.(j);
    setForm((f) => ({ ...f, ...j, shopee_app_secret: "" }));
    setMsg({ type: "ok", text: okText });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function saveProfile(e) {
    e.preventDefault();
    const { name, handle, tagline, avatar_url, tiktok_url, instagram_url, youtube_url, whatsapp_url, shopee_app_id, shopee_app_secret, shopee_sub_id } = form;
    send(
      { name, handle, tagline, avatar_url, tiktok_url, instagram_url, youtube_url, whatsapp_url, shopee_app_id, shopee_app_secret, shopee_sub_id },
      "Vitrine atualizada. As mudanças aparecem no site em até 1 minuto."
    );
  }

  function savePassword(e) {
    e.preventDefault();
    send(pw, "Senha alterada.");
    setPw({ current_password: "", new_password: "" });
  }

  return (
    <>
      {msg && <div className={msg.type}>{msg.text}</div>}

      <form className="panel" onSubmit={saveProfile}>
        <h2>Topo da vitrine</h2>
        {form.avatar_url && (
          <div className="preview">
            <img src={form.avatar_url} alt="" style={{ borderRadius: "50%" }} />
            <small style={{ color: "var(--muted)" }}>Prévia da foto</small>
          </div>
        )}
        {FIELDS.map(([k, label, ph]) => (
          <div className="field" key={k}>
            <label htmlFor={`st-${k}`}>{label}</label>
            <input id={`st-${k}`} value={form[k] || ""} onChange={(e) => set(k, e.target.value)} placeholder={ph} required={k === "name"} />
          </div>
        ))}

        <h2 style={{ marginTop: 18 }}>API de afiliado da Shopee</h2>
        <p className="help">
          Com a sua API, o painel gera o <b>seu</b> link de afiliado a partir de qualquer link da Shopee e puxa foto e preço.
          Pegue o App ID e o Secret em affiliate.shopee.com.br → Open API. Sem a API, cole sempre o seu link curto (s.shopee.com.br/...).
        </p>
        <div className="row">
          <div className="field">
            <label htmlFor="st-appid">App ID</label>
            <input id="st-appid" value={form.shopee_app_id || ""} onChange={(e) => set("shopee_app_id", e.target.value)} inputMode="numeric" />
          </div>
          <div className="field">
            <label htmlFor="st-sub">Sub ID (opcional)</label>
            <input id="st-sub" value={form.shopee_sub_id || ""} onChange={(e) => set("shopee_sub_id", e.target.value)} placeholder="bio" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="st-secret">Secret {store.has_shopee_secret && <span className="tag-ok">salvo</span>}</label>
          <input
            id="st-secret" type="password" value={form.shopee_app_secret} onChange={(e) => set("shopee_app_secret", e.target.value)}
            placeholder={store.has_shopee_secret ? "•••••••• (deixe vazio para manter)" : "cole o Secret"} autoComplete="off"
          />
        </div>
        {store.has_shopee_secret && (
          <button type="button" className="btn ghost sm" style={{ marginBottom: 12 }} disabled={busy}
            onClick={() => send({ remove_shopee: true }, "API da Shopee removida.")}>
            Remover API da Shopee
          </button>
        )}
        <button className="btn" style={{ width: "100%" }} disabled={busy}>{busy ? "Salvando…" : "Salvar vitrine"}</button>
      </form>

      <form className="panel" onSubmit={savePassword}>
        <h2>Trocar senha</h2>
        {!adminActing && (
          <div className="field">
            <label htmlFor="pw-cur">Senha atual</label>
            <input id="pw-cur" type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} autoComplete="current-password" />
          </div>
        )}
        <div className="field">
          <label htmlFor="pw-new">Senha nova (mínimo 6 caracteres)</label>
          <input id="pw-new" type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} autoComplete="new-password" minLength={6} required />
        </div>
        <button className="btn ghost" style={{ width: "100%" }} disabled={busy}>Trocar senha</button>
      </form>
    </>
  );
}
