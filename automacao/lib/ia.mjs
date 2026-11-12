// Chamada única à API do Claude, com o "pensar antes de responder" desligado (respostas curtas,
// mais rápidas e mais baratas). Se a API recusar o parâmetro, tenta de novo sem ele e com mais espaço.
const env = (k, d = "") => (process.env[k] ?? "").trim() || d;
export const hasIA = () => Boolean(env("ANTHROPIC_API_KEY"));

function thinkingOff(model) {
  if (/haiku/i.test(model)) return { type: "disabled" };
  return { type: "between_tools" }; // Sonnet/Opus 5.x: não pensa antes de responder
}

export async function claude({ model = "claude-haiku-5-5", content, max = 600 }) {
  const send = async (body) => {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000),
    });
    return { r, j: await r.json().catch(() => ({})) };
  };
  const messages = [{ role: "user", content }];
  let { r, j } = await send({ model, max_tokens: max, thinking: thinkingOff(model), messages });
  if (!r.ok && /thinking/i.test(j?.error?.message || "")) ({ r, j } = await send({ model, max_tokens: max + 2000, messages }));
  if (!r.ok) throw new Error(j?.error?.message || `IA ${r.status}`);
  const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
  if (!text) throw new Error(`resposta vazia (${j.stop_reason})`);
  return text;
}
