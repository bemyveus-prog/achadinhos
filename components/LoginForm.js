"use client";

import { useState } from "react";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setErr("");
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const j = await r.json();
    setLoading(false);
    if (r.ok) window.location.reload();
    else setErr(j.error || "Erro");
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>Painel da vitrine</h1>
      <div className="field">
        <input type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </div>
      {err && <div className="warn">{err}</div>}
      <button className="btn" style={{ width: "100%" }} disabled={loading}>{loading ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
