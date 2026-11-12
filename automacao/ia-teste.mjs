import { gerarNarracao } from "./lib/narracao.mjs";
const t = await gerarNarracao({ name: "Escorredor Secador Inox 16 Pratos Louca Louça Portátil", price: 119.99, rating: 4.9, sales: 300 }, { contexto: "Vídeo de Jonas Silva" });
console.log("RESULTADO:", t);
