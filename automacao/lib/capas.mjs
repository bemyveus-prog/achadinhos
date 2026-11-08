// Capa com foto de fundo por categoria.
// Imagens: mandadas pelo bot do Telegram (/capa <categoria>, guardadas no Supabase Storage, bucket "capas")
// e/ou na pasta automacao/capas/<categoria>/. Ganchos e detecção: automacao/capas/ganchos.json.
// Escolhe a categoria pelo NOME do produto; sem categoria ou sem imagem devolve null (capa antiga).
import { readFile, readdir, mkdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { salesLabel } from "./textos.mjs";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../capas");
const IMG = /\.(jpe?g|png|webp)$/i;

export async function coverConfig() {
  try { return JSON.parse(await readFile(path.join(DIR, "ganchos.json"), "utf8")); }
  catch { return {}; }
}

export function categoryOf(name, cfg) {
  for (const [slug, c] of Object.entries(cfg)) {
    if (slug.startsWith("_") || !c.detecta) continue;
    if (new RegExp(c.detecta, "i").test(name)) return slug;
  }
  return null;
}

function storage() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage.from("capas");
}

// lista as imagens da categoria: { key, local?: caminho, remote?: caminho no Storage }
async function listImages(slug) {
  const out = [];
  try { for (const f of (await readdir(path.join(DIR, slug))).filter((f) => IMG.test(f)).sort()) out.push({ key: `repo:${f}`, local: path.join(DIR, slug, f) }); } catch {}
  const st = storage();
  if (st) {
    const { data } = await st.list(slug, { limit: 100, sortBy: { column: "name", order: "asc" } });
    for (const f of data || []) if (IMG.test(f.name)) out.push({ key: `bot:${f.name}`, remote: `${slug}/${f.name}` });
  }
  return out;
}

async function materialize(img) {
  if (img.local) return img.local;
  const { data, error } = await storage().download(img.remote);
  if (error) throw new Error(`capa ${img.remote}: ${error.message}`);
  const file = path.join(os.tmpdir(), "capas", img.remote.replace(/\//g, "_"));
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await data.arrayBuffer()));
  return file;
}

// número que muda a cada postagem (hora), para girar imagem, gancho e selo
const turn = (d = new Date()) => Math.floor(d.getTime() / 3600000);

export async function pickCover(p, { log = console.log, force } = {}) {
  const cfg = await coverConfig();
  const slug = force || categoryOf(p.name || "", cfg);
  if (!slug || !cfg[slug]) { log("  capa: produto sem categoria de capa, usando a capa padrão"); return null; }
  const images = await listImages(slug).catch(() => []);
  if (!images.length) { log(`  capa: categoria "${slug}" ainda sem imagem, usando a capa padrão`); return null; }
  const c = cfg[slug], t = turn();
  const hooks = c.ganchos?.length ? c.ganchos : ["Eu *não acreditei* quando vi o preço disso"];
  const hookIdx = t % hooks.length;
  const badges = ["adivinha o preço?"];
  if (p.sales >= 500) badges.push(`+${salesLabel(p.sales)} vendidos`);
  if (p.rating >= 4.7) badges.push(`nota ${Number(p.rating).toFixed(1).replace(".", ",")} ⭐`);
  const img = images[Math.floor(t / hooks.length) % images.length];
  const cover = {
    file: await materialize(img),
    slug,
    hook: hooks[hookIdx],
    tag: c.etiqueta || slug,
    accent: c.cor,
    badge: badges[t % badges.length],
    id: `${slug} | ${img.key} | ${hooks[hookIdx]}`, // guardado no auto_picks para medir qual gancho dá mais clique
  };
  log(`  capa: ${slug} · "${cover.hook.replace(/\*/g, "")}" · selo "${cover.badge}"`);
  return cover;
}
