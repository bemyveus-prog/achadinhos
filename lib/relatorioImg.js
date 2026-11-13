import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand.mjs";

// Imagem do /relatorio (1080x1350): números grandes, barras por origem e produtos que mais venderam.
const brl = (v) => "R$ " + Number(v || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const corte = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; };

export async function relatorioImagem({ periodo, intervalo, pedidos, cancelados, comissao, concluida, cliques, origens, produtos, maisClicados }) {
  let fonts;
  try {
    const f = await fetch(`${BRAND.site}/fonts/Poppins-Bold.ttf`);
    if (f.ok) fonts = [{ name: "Poppins", data: await f.arrayBuffer(), weight: 700, style: "normal" }];
  } catch {}
  const maxO = Math.max(1, ...origens.map((o) => o.c));
  const ac = BRAND.accent || "#D0306F";
  const card = (titulo, valor, sub, destaque = false) => (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, background: destaque ? "#fff" : "rgba(255,255,255,.14)", color: destaque ? "#1c1917" : "#fff",
      borderRadius: 32, padding: "26px 28px" }}>
      <div style={{ display: "flex", fontSize: 26, opacity: destaque ? 0.6 : 0.85 }}>{titulo}</div>
      <div style={{ display: "flex", fontSize: destaque ? 64 : 58, fontWeight: 800, marginTop: 6, color: destaque ? ac : "#fff" }}>{valor}</div>
      {sub ? <div style={{ display: "flex", fontSize: 22, marginTop: 4, opacity: 0.7 }}>{sub}</div> : null}
    </div>
  );
  const vazio = !pedidos && !cancelados;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", fontFamily: fonts ? "Poppins" : "sans-serif",
        background: "#f6f2ee", color: "#1c1917" }}>
        <div style={{ display: "flex", flexDirection: "column", padding: "54px 60px 44px", background: `linear-gradient(150deg, ${ac}, #2a0f1f)`, color: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 30, opacity: 0.9 }}>{BRAND.name} · {BRAND.handle}</div>
            <div style={{ display: "flex", fontSize: 24, background: "rgba(255,255,255,.18)", padding: "8px 20px", borderRadius: 999 }}>{intervalo}</div>
          </div>
          <div style={{ display: "flex", fontSize: 58, fontWeight: 800, marginTop: 14 }}>📊 Relatório de {periodo}</div>
          <div style={{ display: "flex", gap: 18, marginTop: 30 }}>
            {card("Comissão estimada", brl(comissao), concluida ? `concluída: ${brl(concluida)}` : "a confirmar", true)}
          </div>
          <div style={{ display: "flex", gap: 18, marginTop: 18 }}>
            {card("Pedidos", String(pedidos), cancelados ? `+${cancelados} cancelado${cancelados > 1 ? "s" : ""}` : "")}
            {card("Cliques no site", String(cliques), "")}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", padding: "36px 60px 0", flex: 1 }}>
          {vazio ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 80, color: "#8a817a" }}>
              <div style={{ display: "flex", fontSize: 90 }}>⏳</div>
              <div style={{ display: "flex", fontSize: 34, marginTop: 16, textAlign: "center" }}>Nenhuma venda registrada ainda neste período</div>
              <div style={{ display: "flex", fontSize: 24, marginTop: 10 }}>A Shopee pode levar algumas horas para mostrar as vendas</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 32, fontWeight: 800 }}>De onde vieram as vendas</div>
              {origens.slice(0, 5).map((o) => (
                <div key={o.nome} style={{ display: "flex", flexDirection: "column", marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26 }}>
                    <span>{corte(o.nome, 30)}</span><span style={{ color: "#8a817a" }}>{o.n} pedido{o.n > 1 ? "s" : ""} · {brl(o.c)}</span>
                  </div>
                  <div style={{ display: "flex", height: 18, background: "#e9e1d8", borderRadius: 999, marginTop: 8 }}>
                    <div style={{ display: "flex", width: `${Math.max(4, Math.round((o.c / maxO) * 100))}%`, background: ac, borderRadius: 999 }} />
                  </div>
                </div>
              ))}
              {produtos.length ? <div style={{ display: "flex", fontSize: 32, fontWeight: 800, marginTop: 36 }}>Produtos que mais venderam</div> : null}
              {produtos.slice(0, 4).map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", marginTop: 14, background: "#fff", borderRadius: 22, padding: "14px 20px" }}>
                  <div style={{ display: "flex", width: 52, height: 52, borderRadius: 16, background: i === 0 ? "#FFD54A" : "#f1ebe4", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800 }}>{i + 1}</div>
                  <div style={{ display: "flex", flex: 1, fontSize: 25, marginLeft: 18 }}>{corte(p.nome, 34)}</div>
                  <div style={{ display: "flex", fontSize: 25, color: "#8a817a" }}>{p.n}x · {brl(p.c)}</div>
                </div>
              ))}
            </div>
          )}
          {maisClicados.length ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: vazio ? 50 : 30 }}>
              <div style={{ display: "flex", fontSize: 28, fontWeight: 800 }}>👆 Mais clicados no site</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
                {maisClicados.slice(0, 4).map((m) => (
                  <div key={m.id} style={{ display: "flex", fontSize: 22, background: "#fff", borderRadius: 999, padding: "8px 16px" }}>#{m.id} {corte(m.titulo, 22)} · {m.n}</div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", padding: "18px 60px 34px", fontSize: 20, color: "#8a817a" }}>
          Comissão estimada até o pedido ser concluído · pedidos cancelados não entram na soma
        </div>
      </div>
    ),
    { width: 1080, height: Math.max(1350, 780 + (vazio ? 330 : 70 + Math.min(5, origens.length) * 80 + (produtos.length ? 80 + Math.min(4, produtos.length) * 96 : 0)) + (maisClicados.length ? 150 : 0) + 110), fonts }
  );
}
