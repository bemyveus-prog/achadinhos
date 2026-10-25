import { revalidatePath } from "next/cache";

// Atualiza a página pública da vitrine na hora (sem esperar o cache de 1 min)
export function revalidateStore(store) {
  if (!store) return;
  try {
    revalidatePath(`/${store.slug}`);
    if (store.is_owner) revalidatePath("/");
  } catch {}
}
