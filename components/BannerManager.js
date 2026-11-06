"use client";

import { useEffect, useRef, useState } from "react";

// Tamanho final da arte: 2:1 (1200 × 600). Imagens de outro formato são mostradas inteiras, com fundo.
const MAX_W = 1600;

const toLocal = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const EMPTY = { image_url: "", link: "", title: "", ends_at: "" };

// Reduz a imagem no próprio celular antes de enviar (fica leve e cabe no limite do servidor)
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use uma imagem JPG, PNG ou WebP");
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("Não consegui abrir essa imagem");
  if (bmp.width <= MAX_W && file.size < 900 * 1024) return file; // já está leve
  const scale = Math.min(1, MAX_W / bmp.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise((r) => canvas.toBlob(r, type, 0.86));
  return new File([blob], file.name.replace(/\.\w+$/, type === "image/png" ? ".png" : ".jpg"), { type });
}

export default function BannerManager() {
  const [list, setList] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const fileRef = useRef(null);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function load() {
    const r = await fetch("/api/banners");
    const j = await r.json().catch(() => []);
    if (r.ok) setList(j);
    else { setList([]); setMsg({ type: "warn", text: j.error || "Erro ao carregar os banners" }); }
  }
  useEffect(() => { load(); }, []);

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    setMsg({ type: "ok", text: "Enviando imagem…" });
    try {
      const small = await shrink(f);
      const fd = new FormData();
      fd.append("file", small);
      const r = await fetch("/api/banners/upload", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Falha ao enviar a imagem");
      set("image_url", j.url);
      setMsg({ type: "ok", text: "Imagem enviada. Agora cole o link e salve." });
    } catch (err) {
      setMsg({ type: "warn", text: err.message });
    }
    setBusy(false);
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const payload = { ...form, ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null };
    if (!editing) payload.sort = list?.length ? Math.max(...list.map((b) => b.sort || 0)) + 1 : 0;
    const r = await fetch(editing ? `/api/banners/${editing}` : "/api/banners", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMsg({ type: "warn", text: j.error });
    setMsg({ type: "ok", text: editing ? "Banner atualizado." : "Banner publicado na vitrine." });
    setForm(EMPTY);
    setEditing(null);
    load();
  }

  async function patch(b, changes) {
    setList((l) => l.map((x) => (x.id === b.id ? { ...x, ...changes } : x)));
    await fetch(`/api/banners/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) });
  }

  // Troca a posição com o vizinho e renumera a ordem toda
  async function move(i, dir) {
    const arr = [...list];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const renum = arr.map((b, k) => ({ ...b, sort: k }));
    setList(renum);
    await Promise.all(
      renum.filter((b, k) => list.find((x) => x.id === b.id)?.sort !== k).map((b) =>
        fetch(`/api/banners/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort: b.sort }) })
      )
    );
  }

  async function remove(b) {
    setConfirmDel(null);
    const r = await fetch(`/api/banners/${b.id}`, { method: "DELETE" });
    if (r.ok) setList((l) => l.filter((x) => x.id !== b.id));
    else setMsg({ type: "warn", text: "Não consegui excluir o banner" });
  }

  function edit(b) {
    setEditing(b.id);
    setForm({ image_url: b.image_url, link: b.link, title: b.title || "", ends_at: toLocal(b.ends_at) });
    setMsg(null);
  }

  const expired = (b) => b.ends_at && new Date(b.ends_at) <= new Date();

  return (
    <div className="panel">
      <h2>Banners do topo</h2>
      <p className="help">
        Arte larga e clicável que aparece entre a frase e a busca. Use imagens no formato <b>2:1</b> (ex: 1200 × 600 px).
        Com mais de um banner, eles passam sozinhos.
      </p>

      {msg && <div className={msg.type}>{msg.text}</div>}

      <form onSubmit={save}>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} />
        {form.image_url ? (
          <div className="bn-preview">
            <img src={form.image_url} alt="" />
            <button type="button" className="btn ghost sm" onClick={() => fileRef.current?.click()} disabled={busy}>Trocar imagem</button>
          </div>
        ) : (
          <button type="button" className="bn-drop" onClick={() => fileRef.current?.click()} disabled={busy}>
            <b>{busy ? "Enviando…" : "Escolher imagem do banner"}</b>
            <span>JPG, PNG ou WebP · formato 2:1</span>
          </button>
        )}

        <div className="field">
          <label htmlFor="bn-link">Link (para onde o clique vai)</label>
          <input id="bn-link" value={form.link} onChange={(e) => set("link", e.target.value)} placeholder="https://s.shopee.com.br/..." inputMode="url" required />
        </div>
        <div className="row">
          <div className="field">
            <label htmlFor="bn-title">Descrição (opcional)</label>
            <input id="bn-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="11.11 Shopee" />
          </div>
          <div className="field">
            <label htmlFor="bn-end">Sai do ar em (opcional)</label>
            <input id="bn-end" type="datetime-local" value={form.ends_at} onChange={(e) => set("ends_at", e.target.value)} />
          </div>
        </div>
        <div className="actions">
          {editing && <button type="button" className="btn ghost" onClick={() => { setEditing(null); setForm(EMPTY); setMsg(null); }}>Cancelar</button>}
          <button className="btn" disabled={busy || !form.image_url}>{editing ? "Salvar banner" : "Publicar banner"}</button>
        </div>
      </form>

      {list?.length > 0 && (
        <div className="bn-list">
          {list.map((b, i) => (
            <div key={b.id} className={`bn-item ${b.active && !expired(b) ? "" : "is-off"}`}>
              <img src={b.image_url} alt="" />
              <div className="bn-meta">
                <b>{b.title || "Banner"}</b>
                <small>
                  {b.clicks || 0} cliques
                  {b.ends_at && (expired(b) ? " · expirado" : ` · até ${new Date(b.ends_at).toLocaleDateString("pt-BR")}`)}
                  {!b.active && " · oculto"}
                </small>
              </div>
              <div className="btns">
                <button type="button" className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                <button type="button" className="btn ghost sm" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Descer">↓</button>
                <button type="button" className="btn ghost sm" onClick={() => patch(b, { active: !b.active })}>{b.active ? "Ocultar" : "Mostrar"}</button>
                <button type="button" className="btn ghost sm" onClick={() => edit(b)}>Editar</button>
                {confirmDel === b.id ? (
                  <button type="button" className="btn danger sm" onClick={() => remove(b)}>Confirmar</button>
                ) : (
                  <button type="button" className="btn danger sm" onClick={() => setConfirmDel(b.id)} aria-label="Excluir">✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
