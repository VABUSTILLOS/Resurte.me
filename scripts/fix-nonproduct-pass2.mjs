#!/usr/bin/env node
/** Pasada 2: rehace las 108 imágenes de blog con queries explícitas y unicidad global,
 *  corrige misses/malos picks de recipes/collections/products.
 *  Lee los títulos ya usados de fix-nonproduct-report.json para no repetir archivos. */
import fs from "fs"
import path from "path"
import sharp from "sharp"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const UA = "ResurteMe-ImageBot/1.0 (contacto: admin@resurte.me)"
const sleep = ms => new Promise(r => setTimeout(r, ms))
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()

// ── Blog: slug -> query Commons explícita (cada una distinta) ────────────────
const BLOG = {
  "panel-herramientas-restaurante-guia": "restaurant dining room people",
  "precios-mayoreo-restaurantes": "fruit crates wholesale market",
  "como-reducir-merma-cocina": "professional kitchen pots cooking",
  "guia-food-cost-restaurante-2026": "plated dish white plate",
  "economia-restaurantes-2027": "pantry shelves food jars",
  "renta-local-restaurante-costo": "empty shop for rent",
  "sostenibilidad-restaurantes": "organic vegetables basket",
  "tendencias-cocina-mexicana": "mole poblano",
  "estadisticas-delivery-mexico": "delivery motorcycle city",
  "legislacion-laboral-restaurantes": "contract documents pen desk",
  "food-trucks-costos-regulacion": "food truck street",
  "franquicias-restaurantes-mexico": "fast food counter",
  "cuanto-cuesta-abrir-restaurante-mexico": "empty restaurant interior",
  "sector-restaurantero-2027-preview": "modern gourmet dish",
  "inflacion-alimentos-menu-restaurante": "street food plate",
  "renegociar-precios-inflacion": "fresh vegetables plate",
  "costos-fijos-vs-variables-restaurante": "restaurant kitchen service cooking",
  "punto-de-equilibrio-restaurante": "fine dining plating",
  "stock-seguridad-inventario": "warehouse shelves",
  "almacenamiento-alimentos-temperatura": "food storage containers",
  "desperdicio-preparacion-porciones": "chopping vegetables kitchen",
  "tendencias-consumo-restaurantes": "gourmet burger fries",
  "horarios-consumo-restaurante": "busy restaurant people dining",
  "tecnologia-delivery-restaurante": "food delivery courier backpack",
  "margenes-delivery-vs-local": "pizza delivery box",
  "comisiones-delivery-apps-2026": "burger takeaway box",
  "salarios-personal-restaurantes": "cooks working restaurant kitchen",
  "turnos-costo-laboral-restaurante": "chef kitchen brigade",
  "datos-restaurante-para-decidir": "tablet sales chart",
  "dashboard-restaurante-un-dia": "laptop business analytics",
  "errores-gestion-restaurante": "restaurant dining room empty tables",
  "digitalizar-restaurante-panel": "cozy cafe interior",
  "inteligencia-artificial-restaurantes": "cooking robot",
  "seguridad-datos-restaurante": "padlock",
  "punto-venta-restaurante-guia": "point of sale terminal",
  "kpi-financieros-restaurante-mes": "haute cuisine dish",
  "plan-rentabilidad-mensual-restaurante": "gourmet pizza",
  "automatizar-procesos-restaurante": "automated kitchen machine",
  "planificador-pedidos-restaurante": "business breakfast table",
  "apps-gestion-inventario-movil": "smartphone restaurant table",
  "hojas-calculo-vs-panel": "laptop coffee desk",
  "rentabilidad-panel-calculadora": "artisan pizza oven",
  "control-de-merma-sin-hojas": "fresh vegetables cutting board",
  "encuestas-satisfaccion-clientes": "restaurant customers eating",
  "plan-marketing-restaurante-plantilla": "set table restaurant",
  "loyalty-recompensas-restaurante": "elegant dining room",
  "pedir-resenas-restaurante": "ramen noodles restaurant",
  "historia-marca-restaurante": "vintage restaurant interior",
  "cross-selling-upselling-restaurante": "dinner with cocktail",
  "marketing-estacional-restaurante": "seasonal dishes table",
  "club-clientes-restaurante": "friends dinner restaurant",
  "email-sms-restaurantes-fidelizacion": "casual dining plate",
  "fotografia-comida-restaurante": "food photography camera",
  "campanas-redes-sociales-comida": "colorful gourmet plate",
  "instagram-restaurantes-contenido": "creative food plating",
  "menu-digital-restaurante-guia": "QR code menu",
  "eventos-colaboraciones-restaurante": "banquet table decoration",
  "google-business-restaurante-guia": "restaurant neon sign",
  "responder-resenas-google-restaurantes": "chef plating dish",
  "google-maps-restaurantes-2026": "sidewalk cafe tables",
  "entregas-programadas-proveedores": "food service truck",
  "proveedores-cumplen-plazos": "delivery van street",
  "comprar-mercado-vs-mayoreo": "market stall produce",
  "mayoreo-vs-menudeo-precios": "grilled meat skewers",
  "negociacion-proveedores-restaurante": "coffee meeting table",
  "calendario-compras-mensual-restaurante": "fruit stand market mexico",
  "compra-mayoreo-15-septiembre": "chiles en nogada",
  "proveeduria-mayoreo-restaurantes": "fresh bowl vegetables",
  "proveedores-directos-vs-distribuidores": "bulk food bins",
  "cotizaciones-comparar-proveedores": "fresh produce table",
  "elegir-proveedor-mayorista": "wholesale market vegetables",
  "criterios-calidad-insumos": "vegetables stacked market stall",
  "proveeduria-abc-insumos": "brunch ingredients",
  "recepcion-mercancia-verificacion": "cardboard boxes delivery",
  "compra-estacional-restaurante": "seasonal fruits market",
  "capacitacion-equipo-cocina": "kitchen staff team cooking",
  "menu-operativo-restaurante": "chalkboard menu",
  "limpieza-profunda-cocina-rutina": "clean commercial kitchen",
  "mise-en-place-cocina-restaurante": "mise en place",
  "inventario-inicial-final-restaurante": "ingredients work table kitchen",
  "menu-fiestas-patrias-restaurante": "tacos plate lime",
  "errores-inventario-restaurante": "kitchen utensils organized",
  "higiene-cocina-nom251": "disinfecting surface gloves",
  "nom-251-higiene-restaurante": "stainless steel kitchen clean",
  "inventario-conteo-ciclico-restaurante": "salad bowls",
  "recetas-estandar-cocina-restaurante": "traditional home cooking",
  "organizar-cocina-por-estaciones": "commercial kitchen stainless steel",
  "utilidad-bruta-vs-neta-restaurante": "modern restaurant interior warm light",
  "impuestos-utilidad-restaurante-mexico": "breakfast table sunlight",
  "facturacion-cfdi-restaurantes": "restaurant bar counter",
  "descuentos-combos-promociones-restaurante": "restaurant table served food",
  "precio-por-gramo-rendimiento-restaurante": "professional kitchen equipment",
  "costeo-menu-completo-restaurante": "gourmet dish elegant",
  "costeo-semanal-panel": "gourmet plate vegetables",
  "costo-bebidas-alcohol-restaurante": "liquor bottles bar shelf",
  "food-cost-tipo-cocina-mexico": "mexican food salsas",
  "como-calcular-precio-venta-restaurante": "fine dining elegant dish",
  "subir-precios-menu-restaurante": "meat griddle grill",
  "credito-financiamiento-restaurante": "coffee cup business",
  "margenes-restaurantes-mexico": "cozy restaurant warm lighting",
  "costo-oportunidad-desperdicio": "gourmet soup bowl",
  "calculadora-food-cost-gratis": "cooking ingredients table",
  "sector-restaurantero-mexico-2026": "steak dish restaurant",
  "rotacion-inventario-restaurante": "healthy bowl ingredients",
  "caso-google-maps-restaurante": "restaurant tables set ready",
  "temporada-alta-restaurante": "crowded restaurant",
  "costeo-platillo-nuevo-restaurante": "chef garnishing dish",
  "delivery-insumos-restaurantes": "takeaway food containers",
}

// ── Otros fixes: recipes/collections/products (misses, dups, malos picks) ────
const OTHER = {
  "quesadillas-flor-calabaza": ["squash blossoms", "/images/recipes/quesadillas-flor-calabaza.webp"],
  "gyozas-cerdo": ["gyoza", "/images/recipes/gyozas-cerdo.webp"],
  "pizza-margherita": ["margherita pizza", "/images/recipes/pizza-margherita.webp"],
  tiramisu: ["tiramisu", "/images/recipes/tiramisu.webp"],
  "ensalada-mediterranea": ["quinoa salad", "/images/recipes/ensalada-mediterranea.webp"],
  falafel: ["falafel", "/images/recipes/falafel.webp"],
  "tacos-pastor": ["tacos al pastor trompo", "/images/recipes/tacos-pastor.webp"],
  "poke-salon": ["salmon bowl rice", "/images/recipes/poke-salon.webp"],
  latina: ["arepas", "/images/collections/latina.webp"],
  mozzarella: ["shredded mozzarella", "/images/products/mozzarella.webp"],
}

// Títulos ya usados en pasada 1 que se conservan (no-blog, no re-hechos)
const REDO = new Set([...Object.keys(BLOG), ...Object.keys(OTHER)])
const prev = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/fix-nonproduct-report.json"), "utf8"))
const used = new Set(prev.filter(r => r.title && !REDO.has(r.slug)).map(r => r.title))

const BAD_TITLE = /djvu|\.pdf|\.tif|scan|book page|illustration|engraving|drawing|painting|poster|map of|diagram|logo|coat of arms|seal of|postage|stamp|label|title page|helicopter|navy/i

async function fetchRetry(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" })
    if (res.ok) return res
    if (res.status === 429 || res.status >= 500) { await sleep([4000, 12000, 25000][i]); continue }
    return res
  }
  return null
}

async function commonsSearch(query) {
  const u = "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|mime"
    + "&generator=search&gsrnamespace=6&gsrlimit=25&gsrsearch=" + encodeURIComponent(query)
  const res = await fetchRetry(u)
  if (!res) return []
  const data = await res.json()
  return Object.values(data.query?.pages ?? {}).filter(p => p.imageinfo?.[0] && /image\/(jpeg|png)/.test(p.imageinfo[0].mime) && p.imageinfo[0].width >= 400)
}

function pickBest(results, query) {
  const qToks = new Set(norm(query).split(" ").filter(t => t.length > 2))
  const scored = []
  for (const p of results) {
    if (BAD_TITLE.test(p.title) || used.has(p.title)) continue
    const tToks = new Set(norm(p.title.replace(/^File:/, "")).split(" "))
    let score = 0
    for (const t of qToks) if (tToks.has(t)) score++
    if (score > 0) scored.push([score, p.imageinfo[0].width * p.imageinfo[0].height, p])
  }
  scored.sort((a, b) => b[0] - a[0] || b[1] - a[1])
  return scored[0]?.[2] ?? null
}

async function download(title, dest) {
  const fileUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title.replace(/^File:/, ""))}?width=800`
  const res = await fetchRetry(fileUrl)
  if (!res) return false
  const buf = Buffer.from(await res.arrayBuffer())
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  await sharp(buf).resize(800, 800, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toFile(dest)
  return true
}

const report = []
const todo = [
  ...Object.entries(BLOG).map(([slug, q]) => [slug, q, `/images/blog/${slug}.webp`]),
  ...Object.entries(OTHER).map(([slug, [q, p]]) => [slug, q, p]),
]
for (const [slug, query, rel] of todo) {
  const dest = path.join(ROOT, "public", rel)
  try {
    const results = await commonsSearch(query)
    await sleep(300)
    const best = pickBest(results, query)
    if (!best) { report.push({ slug, status: "not-found", query }); console.log(`[miss] ${slug} (${query})`); continue }
    if (!(await download(best.title, dest))) { report.push({ slug, status: "download-fail", title: best.title }); console.log(`[dl-fail] ${slug}`); continue }
    used.add(best.title)
    report.push({ slug, status: "ok", query, title: best.title })
    console.log(`[ok] ${slug} <- ${best.title}`)
    await sleep(350)
  } catch (e) { report.push({ slug, status: "error", error: e.message }); console.log(`[error] ${slug}: ${e.message}`) }
}
fs.writeFileSync(path.join(ROOT, "scripts/fix-nonproduct-report2.json"), JSON.stringify(report, null, 2))
const counts = {}
for (const r of report) counts[r.status] = (counts[r.status] ?? 0) + 1
console.log("\nResumen:", JSON.stringify(counts))
