"use client";

import { useState } from "react";

export default function LoginForm() {
  const [user, setUser] = useState("");
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
      body: JSON.stringify({ user, password }),
    });
    const j = await r.json().catch(() => ({}));
    setLoading(false);
    if (r.ok) window.location.reload();
    else setErr(j.error || "Não foi possível entrar");
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>Painel da vitrine</h1>
      <p className="login-sub">Entre com o seu usuário (o nome do seu endereço) e a senha.</p>
      <div className="field">
        <label htmlFor="login-user">Usuário</label>
        <input
          id="login-user" value={user} onChange={(e) => setUser(e.target.value)}
          placeholder="ex: joao" autoCapitalize="none" autoCorrect="off" autoComplete="username" autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor="login-pass">Senha</label>
        <input id="login-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </div>
      {err && <div className="warn">{err}</div>}
      <button className="btn" style={{ width: "100%" }} disabled={loading}>{loading ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
