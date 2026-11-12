for (const model of ["claude-haiku-5-5", "claude-sonnet-5-5"]) {
  for (const extra of [{ thinking: { type: "disabled" } }, { thinking: { type: "enabled", budget_tokens: 1024 } }]) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY.trim(), "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: 300, ...extra, messages: [{ role: "user", content: "Escreva uma frase animada de 20 palavras sobre um escorredor de louça inox. Só a frase." }] }),
    });
    const j = await r.json();
    console.log(`\n== ${model} ${JSON.stringify(extra)} status=${r.status} stop=${j.stop_reason}`);
    console.log("tipos:", (j.content || []).map((c) => c.type).join(","), "| out:", j.usage?.output_tokens);
    console.log("texto:", (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join(" ").slice(0, 160) || JSON.stringify(j.error || j).slice(0, 300));
  }
}
