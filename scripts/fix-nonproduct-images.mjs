#!/usr/bin/env node
/** Descarga las 213 imágenes rotas (hero, collections, products, blog, recipes, story)
 *  listadas en scripts/live-missing-nonproduct.json desde Wikimedia Commons / Open Food Facts.
 *  Uso: node scripts/fix-nonproduct-images.mjs [--only products|collections|story|recipes|blog|hero]
 *  Genera scripts/fix-nonproduct-report.json con los picks para revisión. */
import fs from "fs"
import path from "path"
import sharp from "sharp"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const UA = "ResurteMe-ImageBot/1.0 (contacto: admin@resurte.me)"
const sleep = ms => new Promise(r => setTimeout(r, ms))
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()

// ── Queries exactas por slug (basename del path) ─────────────────────────────
const EXACT = {
  "hero-grocery": "fresh fruits vegetables market stall",
  // products
  "crema-mexicana": "OFF:crema mexicana",
  "queso-americano": "american cheese slices",
  "queso-cheddar": "cheddar cheese slices",
  "queso-mozzarella": "shredded mozzarella cheese",
  // collections
  arabe: "middle eastern food shawarma",
  bebidas: "assorted beverages drinks",
  burger: "gourmet hamburger",
  cafe: "cup of coffee coffee shop",
  cortes: "raw beef steak cuts butcher",
  fonda: "traditional mexican food",
  latina: "latin american food arepas",
  mariscos: "seafood",
  pizza: "pizza",
  pollo: "roast chicken",
  postres: "desserts cakes",
  saludable: "healthy salad bowl",
  sushi: "sushi",
  taqueria: "tacos al pastor",
  // story (hash basenames -> tema de su colección)
  "1565299585323-38d6b0865b47": "tacos al pastor trompo",
  "1568901346375-23c9450c58cd": "burger restaurant grill",
  "1579871494447-9811cf80d66c": "sushi chef preparation",
  "1513104890138-7c749659a591": "pizza wood fired oven",
  "1509042239860-f550ce710b93": "barista coffee",
  "1565557623262-b51c2513a641": "seafood restaurant",
  "1504674900247-0877df9cc836": "mexican restaurant kitchen",
  "1600891964092-4316c288032e": "restaurant chef cooking",
  "1512621776951-a57141f2eefd": "fresh vegetables cooking",
  "1488477181946-6428a0291777": "ice cream dessert",
  "1544025162-d76694265947": "grilled meat restaurant",
  "1514362545857-3bc16c4c7d1b": "restaurant food plating",
  "1556910103-1c02745aae4d": "kitchen cooking pots",
  // recipes con nombre ambiguo → query inglés
  "burger-smash": "smash burger",
  "hotdog-chicago": "Chicago-style hot dog",
  "hotdog-sonora": "Sonoran hot dog",
  "papas-gourmet": "french fries",
  "hamburguesa-bbq-bacon": "bacon cheeseburger barbecue",
  "sopes-pollo": "sopes mexican food",
  "quesadillas-flor-calabaza": "squash blossom quesadilla",
  "tostadas-tinga": "chicken tinga tostada",
  "sushi-dragon": "dragon roll sushi",
  "pescado-empanizado": "breaded fried fish fillet",
  "pasta-alfredo": "fettuccine alfredo",
  "lasana-bolonesa": "lasagna bolognese",
  "alitas-buffalo": "buffalo wings",
  "boneless-bbq": "barbecue boneless chicken wings",
  "alitas-mango-habanero": "glazed chicken wings",
  "alitas-ajillo": "garlic chicken wings",
  "tenders-pollo": "chicken tenders",
  "ribeye-parrilla": "grilled ribeye steak",
  arrachera: "grilled skirt steak arrachera",
  "t-bone": "T-bone steak grilled",
  "costillas-bbq": "barbecue pork ribs",
  "tacos-suadero": "suadero tacos",
  "crepa-nutella": "crepe strawberries chocolate",
  hotcakes: "pancakes",
  "cafe-latte": "cafe latte",
  "poke-atun": "poke bowl tuna",
  "poke-salon": "salmon poke bowl",
  "ensalada-cesar": "caesar salad chicken",
  "smoothie-verde": "green smoothie",
  "ensalada-mediterranea": "quinoa salad mediterranean",
  "wrap-pollo": "chicken wrap",
  "pastel-chocolate": "chocolate cake slice",
  conchas: "concha pan dulce mexicano",
  "helado-vainilla": "vanilla ice cream scoop",
  "flan-napolitano": "flan custard",
  "pay-limon": "key lime pie",
  "churros-cajeta": "churros",
  "shawarma-pollo": "chicken shawarma",
  "gyro-cerdo": "gyro pita",
  "ensalada-griega": "greek salad",
  arepas: "arepa venezuelan",
  patacones: "patacones tostones",
  "empanadas-colombianas": "colombian empanadas",
  cachapas: "cachapa",
  tequenos: "tequeños",
  michelada: "michelada",
  limonada: "lemonade glass",
  margarita: "margarita cocktail",
}

// ── Reglas blog: [regex sobre slug, query Commons] ───────────────────────────
const BLOG_RULES = [
  [/qr|menu-digital/, "QR code on restaurant table"],
  [/food-truck/, "food truck"],
  [/entregas-programadas|proveedores-cumplen|recepcion-mercancia|delivery-insumos/, "food delivery boxes"],
  [/delivery|domicilio/, "food delivery scooter"],
  [/seguridad-datos/, "padlock cyber security"],
  [/inteligencia-artificial/, "robot kitchen technology"],
  [/punto-venta/, "cash register restaurant"],
  [/tablet|graficas|dashboard/, "tablet computer business charts"],
  [/laptop|hojas-calculo/, "laptop spreadsheet coffee"],
  [/apps-gestion|telefono|movil/, "smartphone food"],
  [/mercado|abastos/, "vegetable market stall"],
  [/granel|semillas/, "bulk grains market"],
  [/almacen|stock-seguridad/, "warehouse shelves food"],
  [/despensa|almacenamiento/, "food storage containers pantry"],
  [/limpieza|higiene|nom-251|guantes|desinfect/, "kitchen cleaning gloves"],
  [/mise-en-place|preparacion/, "kitchen ingredient preparation cutting board"],
  [/chef|equipo-cocina|capacitacion|dirigiendo/, "chef commercial kitchen"],
  [/cocina-profesional|estaciones|ollas|sartenes|utensilios|merma-cocina/, "commercial kitchen"],
  [/parrilla|carne/, "grilled meat barbecue"],
  [/pizza/, "pizza box"],
  [/hamburguesa/, "gourmet burger"],
  [/ramen/, "ramen bowl"],
  [/tacos|fiestas-patrias|mexican/, "mexican tacos"],
  [/cafe/, "cup of coffee table"],
  [/fachada|local-comercial|renta-local|google-maps|google-business/, "restaurant facade"],
  [/franquicia/, "fast food restaurant interior"],
  [/bar|bebidas-alcohol|botellas/, "bar bottles"],
  [/sopa/, "soup bowl"],
  [/ensalada|bowl|saludable/, "fresh salad bowl"],
  [/documentos|laboral|legislacion|impuestos|facturacion/, "business documents desk"],
  [/credito|financiamiento/, "coffee business meeting"],
  [/sostenibilidad|organicos/, "organic vegetables"],
  [/fotografia|instagram|redes-sociales|fotografi/, "food photography camera"],
  [/eventos/, "banquet decorated table"],
  [/desayuno/, "breakfast restaurant table"],
  [/menu-operativo|pizarron/, "chalkboard menu restaurant"],
  [/temporada-alta|comensales|lleno/, "busy restaurant dining room"],
  [/satisfaccion|clientes|loyalty|club-clientes/, "people dining restaurant table"],
  [/interior|sala|comedor|mesa|ambiente|historia-marca/, "restaurant interior"],
  [/economato|insumos|ingredientes|verduras|frutas|productos/, "fresh vegetables market"],
  [/platillo|plato|emplatado|gourmet|servido/, "gourmet plated dish restaurant"],
]

const BAD_TITLE = /djvu|\.pdf|\.tif|scan|book page|illustration|engraving|drawing|painting|poster|map of|diagram|logo|coat of arms|seal of|postage|stamp|label|ex libris|title page/i

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
    + "&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=" + encodeURIComponent(query)
  const res = await fetchRetry(u)
  if (!res) return []
  const data = await res.json()
  const pages = Object.values(data.query?.pages ?? {})
  return pages.filter(p => p.imageinfo?.[0] && /image\/(jpeg|png)/.test(p.imageinfo[0].mime) && p.imageinfo[0].width >= 400)
}

function pickBest(results, query) {
  const qToks = new Set(norm(query).split(" ").filter(t => t.length > 2))
  let best = null, bestScore = 0
  for (const p of results) {
    const title = p.title
    if (BAD_TITLE.test(title)) continue
    const tToks = new Set(norm(title.replace(/^File:/, "")).split(" "))
    let score = 0
    for (const t of qToks) if (tToks.has(t)) score++
    if (score > bestScore || (score === bestScore && best && score > 0 && p.imageinfo[0].width * p.imageinfo[0].height > best.imageinfo[0].width * best.imageinfo[0].height)) {
      best = p; bestScore = score
    }
  }
  return bestScore >= 1 ? best : null
}

async function offSearch(query) {
  const u = "https://world.openfoodfacts.org/cgi/search.pl?search_terms=" + encodeURIComponent(query)
    + "&search_simple=1&action=process&json=1&page_size=20&fields=product_name,image_front_url,image_url"
  const res = await fetchRetry(u)
  if (!res) return null
  const data = await res.json()
  const qToks = new Set(norm(query).split(" ").filter(t => t.length > 2))
  let best = null, bestScore = 0
  for (const p of data.products ?? []) {
    const img = p.image_front_url || p.image_url
    if (!img || !p.product_name) continue
    const pToks = new Set(norm(p.product_name).split(" "))
    let score = 0
    for (const t of qToks) if (pToks.has(t)) score++
    if (score > bestScore) { best = img; bestScore = score }
  }
  return bestScore >= 1 ? best : null
}

async function saveWebp(bufOrUrl, dest) {
  const buf = Buffer.isBuffer(bufOrUrl) ? bufOrUrl : Buffer.from(await (await fetchRetry(bufOrUrl)).arrayBuffer())
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  await sharp(buf).resize(800, 800, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toFile(dest)
}

const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null
const items = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/live-missing-nonproduct.json"), "utf8"))
const report = []

for (const item of items) {
  const slug = path.basename(item.path, ".webp")
  const group = item.path.includes("/products/") ? "products"
    : item.path.includes("/collections/") ? "collections"
    : item.path.includes("/story/") ? "story"
    : item.path.includes("/recipes/") ? "recipes"
    : item.path.includes("/blog/") ? "blog" : "hero"
  if (only && group !== only) continue
  const dest = path.join(ROOT, "public", item.path)
  if (fs.existsSync(dest)) { report.push({ slug, group, status: "exists" }); continue }

  let query = EXACT[slug]
  if (!query && group === "blog") {
    const rule = BLOG_RULES.find(([re]) => re.test(slug))
    query = rule ? rule[1] : "restaurant interior"
  }
  if (!query) query = item.name || slug.replace(/-/g, " ") // recipes: nombre del platillo

  try {
    if (query.startsWith("OFF:")) {
      const img = await offSearch(query.slice(4))
      if (img) {
        await saveWebp(img, dest)
        report.push({ slug, group, status: "ok-off", src: img })
        console.log(`[ok-off] ${slug}`)
        await sleep(350); continue
      }
      query = norm(query.slice(4)) // fallback a Commons con el mismo término
    }
    const results = await commonsSearch(query)
    await sleep(300)
    const best = pickBest(results, query)
    if (!best) { report.push({ slug, group, status: "not-found", query }); console.log(`[miss] ${slug} (${query})`); continue }
    const fileUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(best.title.replace(/^File:/, ""))}?width=800`
    const res = await fetchRetry(fileUrl)
    if (!res) { report.push({ slug, group, status: "download-fail", title: best.title }); console.log(`[dl-fail] ${slug}`); continue }
    await saveWebp(Buffer.from(await res.arrayBuffer()), dest)
    report.push({ slug, group, status: "ok", query, title: best.title })
    console.log(`[ok] ${slug} <- ${best.title}`)
    await sleep(350)
  } catch (e) {
    report.push({ slug, group, status: "error", error: e.message })
    console.log(`[error] ${slug}: ${e.message}`)
  }
}

fs.writeFileSync(path.join(ROOT, "scripts/fix-nonproduct-report.json"), JSON.stringify(report, null, 2))
const counts = {}
for (const r of report) counts[r.status] = (counts[r.status] ?? 0) + 1
console.log("\nResumen:", JSON.stringify(counts))
