import { gerarLegendaShopee } from "./lib/narracao.mjs";
for (const name of ["Escorredor Secador Inox 16 Pratos Louça Portátil", "Kit 4 Blusas Feminina Ribana Canelada Poliester Básica Casual", "Garrafa Térmica 1L com Termômetro Digital Cabo de Madeira", "Cortina de Luz LED Cascata Natal Estrela Papai Noel"]) {
  const l = await gerarLegendaShopee({ name }, { log: () => {} });
  console.log("LEGENDA", l.length, "|", l);
}
