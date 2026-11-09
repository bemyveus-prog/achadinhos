import { createHash } from "crypto";

// Bot do Telegram: busca produtos na API de afiliados e coloca na vitrine com um toque.
const token = () => (process.env.TELEGRAM_BOT_TOKEN || "").trim();
export const hasBot = () => Boolean(token());
export const allowedChat = () => (process.env.TELEGRAM_CHAT_ID || "").trim();
// segredo do webhook derivado do token (o Telegram manda de volta em cada chamada)
export const webhookSecret = () => createHash("sha256").update("vitrine-tg:" + token()).digest("hex").slice(0, 48);

export async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(`Telegram ${method}: ${json.description || res.status}`);
  return json.result;
}

export const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const brl = (v) => "R$ " + Number(v).toFixed(2).replace(".", ",");
export const pct = (v) => (v * 100).toFixed(1).replace(".", ",").replace(",0", "") + "%";
const n = (v) => (v == null || v === "" ? 0 : Number(v) || 0);

export function normalize(p) {
  const price = n(p.priceMin || p.price);
  const discount = n(p.priceDiscountRate);
  return {
    itemId: String(p.itemId),
    shopId: String(p.shopId),
    name: String(p.productName || "").trim(),
    imageUrl: p.imageUrl,
    price,
    originalPrice: price && discount > 0 && discount < 100 ? Math.round((price / (1 - discount / 100)) * 100) / 100 : null,
    commission: n(p.commissionRate),
    sellerCommission: n(p.sellerCommissionRate),
    shopeeCommission: n(p.shopeeCommissionRate),
    sales: n(p.sales),
    rating: n(p.ratingStar),
    productLink: p.productLink,
    offerLink: p.offerLink,
  };
}

// comissão pesa mais; vendas e nota evitam produto ruim
export const score = (p) => p.commission * (1 + Math.log10(Math.max(p.sales, 1))) * (p.rating / 5);

// Todas as categorias principais da Shopee Brasil (ids da API de afiliados)
export const CATEGORIAS = {
  moda: [100017, "Moda Feminina"],
  masculino: [100011, "Moda Masculina"],
  infantil: [100633, "Moda Infantil"],
  calcados: [100532, "Calçados Femininos"],
  "calcados-masculinos": [100012, "Calçados Masculinos"],
  bolsas: [100016, "Bolsas Femininas"],
  "bolsas-masculinas": [100533, "Bolsas Masculinas"],
  acessorios: [100009, "Acessórios de Moda"],
  relogios: [100534, "Relógios"],
  beleza: [100630, "Beleza"],
  saude: [100001, "Saúde"],
  bebe: [100632, "Mãe e Bebê"],
  casa: [100636, "Casa e Construção"],
  eletro: [100010, "Eletrodomésticos"],
  celular: [100013, "Celulares e Acessórios"],
  informatica: [100644, "Informática"],
  audio: [100535, "Áudio"],
  games: [100634, "Games"],
  cameras: [100635, "Câmeras e Drones"],
  esportes: [100637, "Esportes"],
  brinquedos: [100639, "Brinquedos e Hobbies"],
  papelaria: [100638, "Papelaria"],
  livros: [100643, "Livros e Revistas"],
  pets: [100631, "Pets"],
  alimentos: [100629, "Alimentos e Bebidas"],
  carros: [100640, "Automotivo"],
  motos: [100641, "Motos"],
  viagem: [100015, "Viagem e Malas"],
};

// outros nomes que a pessoa pode digitar
export const CAT_ALIAS = {
  feminina: "moda", roupa: "moda", roupas: "moda", masculina: "masculino", homem: "masculino", crianca: "infantil", kids: "infantil",
  sapato: "calcados", sapatos: "calcados", tenis: "calcados", bolsa: "bolsas", acessorio: "acessorios", relogio: "relogios",
  maquiagem: "beleza", make: "beleza", skincare: "beleza", cabelo: "beleza", bebes: "bebe", maternidade: "bebe",
  decoracao: "casa", cozinha: "casa", construcao: "casa", ferramentas: "casa", eletrodomesticos: "eletro", tecnologia: "celular",
  computador: "informatica", fone: "audio", jogos: "games", camera: "cameras", fitness: "esportes", academia: "esportes",
  brinquedo: "brinquedos", escola: "papelaria", livro: "livros", pet: "pets", comida: "alimentos", carro: "carros", automotivo: "carros",
  moto: "motos", motocicleta: "motos", mala: "viagem", malas: "viagem",
};

// Comissão do jeito que o app mostra: "Comissão extra" é a parte da loja; o total soma a da Shopee
export function commissionLine(p) {
  const total = `≈ ${brl(p.price * p.commission)} por venda`;
  if (p.sellerCommission) {
    const shopee = p.shopeeCommission || Math.max(p.commission - p.sellerCommission, 0);
    return `💸 Comissão total ${pct(p.commission)} ${total}\n     (extra da loja ${pct(p.sellerCommission)} + Shopee ${pct(shopee)})`;
  }
  return `💸 Comissão ${pct(p.commission)} ${total}`;
}
