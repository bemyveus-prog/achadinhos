import { gerarNarracao } from "./lib/narracao.mjs";
for (const name of ["Garrafa Térmica 1L com Termômetro Digital Cabo de Madeira", "Tapete Bolinha Macarrão Antiderrapante Banheiro", "Escorredor Secador Inox 16 Pratos Louça", "Cortina de Luz LED Cascata Natal Estrela Papai Noel"]) {
  console.log("RESULTADO:", await gerarNarracao({ name, price: 39.9 }, { max: 240, log: (m) => console.log(m) }));
}
