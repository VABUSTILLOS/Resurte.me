// Rastrea el catálogo EN VIVO de resurte.me y detecta imágenes rotas (404).
// La BD en vivo difiere de seed.sql, así que el sitio desplegado es la fuente de verdad.
// Salida: scripts/live-missing-images.json  -> [{ path, name, productUrl }]
// Uso: node scripts/find-live-broken-images.mjs

const BASE = "https://resurte.me";
const CIUDAD = "cdmx";
const CATEGORIAS = [
  "abarrotes", "bebidas", "botanas-dulces", "carnes-aves-pescados", "congelados",
  "desechables", "frutas-verduras", "lacteos-huevos", "limpieza-cocina", "panaderia-tortilleria",
];
const CONCURRENCIA = 8;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (image-audit)" } });
      if (res.ok) return await res.text();
    } catch {}
    await sleep(800 * (i + 1));
  }
  return null;
}

// Extrae pares {name, src} de <img alt="..." ... src="..."> (alt y src en cualquier orden)
function extraerImgs(html) {
  const out = [];
  const re = /<img\b[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const alt = tag.match(/alt="([^"]*)"/)?.[1] ?? "";
    const src = tag.match(/src="([^"]*)"/)?.[1] ?? tag.match(/srcSet="([^"\s]+)/)?.[1] ?? "";
    if (src && (src.includes("/images/products") || src.includes("storage.googleapis.com"))) {
      out.push({ name: alt, src: src.replace(/&amp;/g, "&") });
    }
  }
  return out;
}

async function enLotes(items, n, fn) {
  const res = [];
  for (let i = 0; i < items.length; i += n) {
    res.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  }
  return res;
}

const paginasBase = [
  `${BASE}/${CIUDAD}`,
  ...CATEGORIAS.map((c) => `${BASE}/${CIUDAD}/categoria/${c}`),
];

console.log("1/3 Categorías...");
const htmlCats = await enLotes(paginasBase, CONCURRENCIA, fetchText);

// Slugs de productos + imágenes vistas en tarjetas
const slugs = new Set();
const imgsPorPath = new Map(); // path -> { name, productUrl }
const registrar = (name, src, productUrl) => {
  const path = src.startsWith("http") ? src : new URL(src, BASE).pathname;
  if (!imgsPorPath.has(path)) imgsPorPath.set(path, { name: name || "", productUrl: productUrl || "" });
  else {
    const e = imgsPorPath.get(path);
    if (!e.name && name) e.name = name;
  }
};

for (const html of htmlCats) {
  if (!html) continue;
  for (const { name, src } of extraerImgs(html)) registrar(name, src, "");
  for (const m of html.matchAll(/href="\/cdmx\/producto\/([a-z0-9-]+)"/g)) slugs.add(m[1]);
}
console.log(`   ${slugs.size} productos, ${imgsPorPath.size} imágenes en tarjetas`);

console.log("2/3 Páginas de producto...");
const listaSlugs = [...slugs];
await enLotes(listaSlugs, CONCURRENCIA, async (slug) => {
  const url = `${BASE}/${CIUDAD}/producto/${slug}`;
  const html = await fetchText(url);
  if (!html) return;
  for (const { name, src } of extraerImgs(html)) registrar(name, src, url);
});

console.log(`   ${imgsPorPath.size} imágenes únicas referenciadas`);

console.log("3/3 Sondeando URLs en vivo...");
const faltantes = [];
await enLotes([...imgsPorPath.entries()], CONCURRENCIA, async ([path, info]) => {
  const url = path.startsWith("http") ? path : BASE + path;
  let status = 0;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { method: "GET", headers: { "User-Agent": "Mozilla/5.0 (image-audit)" } });
      status = res.status;
      break;
    } catch { await sleep(800 * (i + 1)); }
  }
  if (status !== 200) faltantes.push({ path, name: info.name, productUrl: info.productUrl, status });
});

console.log(`\n✅ OK: ${imgsPorPath.size - faltantes.length}  |  ❌ rotas: ${faltantes.length}`);
const { writeFileSync } = await import("node:fs");
writeFileSync("scripts/live-missing-images.json", JSON.stringify(faltantes, null, 2));
for (const f of faltantes) console.log(`  [${f.status}] ${f.path}  (${f.name || "sin nombre"})`);
