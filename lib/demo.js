// Ofertas de exemplo — aparecem só enquanto o Supabase não está configurado
const img = (seed) => `https://picsum.photos/seed/${seed}/600/600`;

export const DEMO_OFFERS = [
  { id: 1, kind: "cupom", title: "R$20 OFF acima de R$99", description: "Cupom Shopee válido em moda feminina", coupon_code: "MODA20", link: "https://shopee.com.br", platform: "shopee", category: "Moda", pinned: true, active: true },
  { id: 2, kind: "cupom", title: "Frete grátis sem mínimo", description: "Só hoje no TikTok Shop", coupon_code: "FRETEJA", link: "https://www.tiktok.com", platform: "tiktok", category: "Geral", active: true },
  { id: 23, kind: "produto", title: "Vestido midi canelado com fenda — várias cores", image_url: img("vestido"), price: 59.9, original_price: 119.9, link: "https://shopee.com.br", platform: "shopee", category: "Moda", badge: "Mais vendido", pinned: true, active: true, clicks: 412 },
  { id: 22, kind: "produto", title: "Conjunto alfaiataria cropped + calça pantalona", image_url: img("conjunto"), price: 89.9, original_price: 149.9, link: "https://shopee.com.br", platform: "shopee", category: "Moda", active: true },
  { id: 21, kind: "produto", title: "Bolsa baguete couro sintético", image_url: img("bolsa"), price: 47.5, original_price: 79, link: "https://www.tiktok.com", platform: "tiktok", category: "Acessórios", badge: "Frete grátis", active: true },
  { id: 20, kind: "produto", title: "Kit 3 bodies básicos manga longa", image_url: img("body"), price: 64.9, link: "https://shopee.com.br", platform: "shopee", category: "Moda", active: true },
  { id: 19, kind: "produto", title: "Organizador de maquiagem giratório acrílico", image_url: img("organizador"), price: 39.9, original_price: 69.9, link: "https://shopee.com.br", platform: "shopee", category: "Casa", active: true },
  { id: 18, kind: "produto", title: "Sérum vitamina C 30ml", image_url: img("serum"), price: 29.9, original_price: 49.9, link: "https://www.tiktok.com", platform: "tiktok", category: "Beleza", active: true },
];
