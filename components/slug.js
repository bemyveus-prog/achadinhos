// Mesmo formato de endereço que o servidor aceita (lib/stores.js)
export function slugifyClient(s) {
  return String(s || "")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 30);
}
