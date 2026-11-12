// Teste: resposta crua da API para os modelos usados
for (const model of [process.env.M1 || "claude-haiku-5-5", "claude-sonnet-5-5"]) {
  for (const max of [300, 1024]) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY.trim(), "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: max, messages: [{ role: "user", content: "Escreva uma frase animada de 20 palavras sobre um escorredor de louça inox. Só a frase." }] }),
    });
    const j = await r.json();
    console.log(`\n== ${model} max=${max} status=${r.status} stop=${j.stop_reason}`);
    console.log("tipos:", (j.content || []).map((c) => c.type).join(","), "| uso:", JSON.stringify(j.usage || {}));
    console.log("texto:", (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join(" ").slice(0, 200) || JSON.stringify(j).slice(0, 300));
  }
}
