// Descarga portadas de Unsplash para los 54 posts del blog de Resurte.me.
// CDN directo images.unsplash.com/photo-{id}?w=1200&q=70&fm=webp
// Normaliza a 1200x675 (16:9) con sharp y guarda en public/images/blog/{slug}.webp
import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"

const OUT_DIR = path.join(process.cwd(), "public/images/blog")
fs.mkdirSync(OUT_DIR, { recursive: true })

// Mapeo slug -> Unsplash photo id. 54 IDs ÚNICOS de temática restaurante/comida
// (requisito: sin repetir fotos, todas de restaurantes, WebP comprimidas).
const MAP = {
  // ── costos ─────────────────────────────────────────────
  "guia-food-cost-restaurante-2026": "1504674900247-0877df9cc836", // platillo en mesa
  "calculadora-food-cost-gratis": "1559339352-11d035aa65de", // ingredientes cocina
  "costeo-menu-completo-restaurante": "1414235077428-338989a2e8c0", // comida fina
  "costeo-platillo-nuevo-restaurante": "1559847844-5315695dadae", // chef emplatando
  "costeo-semanal-panel": "1476224203421-9ac39bcb3327", // platillo gourmet
  "food-cost-tipo-cocina-mexico": "1551504734-5ee1c4a1479b", // comida mexicana
  "margenes-delivery-vs-local": "1565299624946-b28f40a0ae38", // pizza
  "margenes-restaurantes-mexico": "1552566626-52f8b828add9", // restaurante interior
  "precios-mayoreo-restaurantes": "1488459716781-31db52582fe9", // frutas de mercado
  "subir-precios-menu-restaurante": "1555939594-58d7cb561ad1", // carne a la parrilla
  "costo-oportunidad-desperdicio": "1547592180-85f173990554", // plato sopa gourmet
  "plan-rentabilidad-mensual-restaurante": "1513104890138-7c749659a591", // pizza gourmet

  // ── operacion ──────────────────────────────────────────
  "como-reducir-merma-cocina": "1556910103-1c02745aae4d", // cocina en acción
  "control-de-merma-sin-hojas": "1584992236310-6edddc08acff", // verdura fresca
  "errores-inventario-restaurante": "1533777857889-4be7c70b33f7", // cocina profesional
  "higiene-cocina-nom251": "1584634731339-252c581abfc5", // guantes limpieza
  "inventario-conteo-ciclico-restaurante": "1546069901-ba9599a7e63c", // ensalada fresca
  "menu-fiestas-patrias-restaurante": "1552332386-f8dd00dc2f85", // tacos
  "mise-en-place-cocina-restaurante": "1556911220-bff31c812dba", // preparación cocina
  "nom-251-higiene-restaurante": "1551218808-94e220e084d2", // cocina de trabajo
  "rotacion-inventario-restaurante": "1467003909585-2f8a72700288", // bowl saludable
  "turnos-costo-laboral-restaurante": "1550966871-3ed3cdb5ed0c", // chef equipo
  "delivery-insumos-restaurantes": "1526367790999-0150786686a2", // comida rápida

  // ── proveeduria ────────────────────────────────────────
  "compra-estacional-restaurante": "1482049016688-2d3e1b311543", // frutas mercado
  "compra-mayoreo-15-septiembre": "1511920170033-f8396924c348", // platillo festivo
  "elegir-proveedor-mayorista": "1506368249639-73a05d6f6488", // mercado alimentos
  "mayoreo-vs-menudeo-precios": "1544025162-d76694265947", // parrilla y carnes
  "negociacion-proveedores-restaurante": "1501339847302-ac426a4a7cbb", // café restaurante
  "proveeduria-abc-insumos": "1554118811-1e0d58224f24", // brunch ingredientes
  "proveeduria-mayoreo-restaurantes": "1565958011703-44f9829ba187", // bowl de alimentos

  // ── marketing ──────────────────────────────────────────
  "caso-google-maps-restaurante": "1517248135467-4c7edcad34c4", // restaurante mesas
  "comisiones-delivery-apps-2026": "1550547660-d9450f859349", // hamburguesa para llevar
  "email-sms-restaurantes-fidelizacion": "1568901346375-23c9450c58cd", // platillo casual
  "google-maps-restaurantes-2026": "1577219491135-ce391730fb2c", // fachada restaurante
  "instagram-restaurantes-contenido": "1484723091739-30a097e8f929", // plato creativo
  "loyalty-recompensas-restaurante": "1424847651672-bf20a4b0982b", // comedor elegante
  "menu-digital-restaurante-guia": "1590650153855-d9e808231d41", // QR menú
  "pedir-resenas-restaurante": "1455619452474-d2be8b1e70cd", // ramen emplatado
  "plan-marketing-restaurante-plantilla": "1511690743698-d9d85f2fbf38", // mesa puesta
  "responder-resenas-google-restaurantes": "1512058564366-18510be2db19", // platillo servido
  "temporada-alta-restaurante": "1555396273-367ea4eb4db5", // restaurante lleno

  // ── herramientas ───────────────────────────────────────
  "digitalizar-restaurante-panel": "1521017432531-fbd92d768814", // interior restaurante
  "errores-gestion-restaurante": "1583394838336-acd977736f90", // sala restaurante
  "panel-herramientas-restaurante-guia": "1553909489-cd47e0907980", // ambiente restaurante
  "planificador-pedidos-restaurante": "1567620905732-2d1ec7ab7445", // desayuno de trabajo
  "rentabilidad-panel-calculadora": "1565299585323-38d6b0865b47", // pizza artesanal

  // ── industria / administracion ────────────────────────
  "credito-financiamiento-restaurante": "1541167760496-1628856ab772", // café negocios
  "facturacion-cfdi-restaurantes": "1514362545857-3bc16c4c7d1b", // bar restaurante
  "horarios-consumo-restaurante": "1514933651103-005eec06c04b", // restaurante en servicio
  "inflacion-alimentos-menu-restaurante": "1561758033-d89a9ad46330", // platillo urbano
  "salarios-personal-restaurantes": "1470337458703-46ad1756a187", // cocina elaborando
  "sector-restaurantero-2027-preview": "1504754524776-8f4f37790ca0", // platillo moderno
  "sector-restaurantero-mexico-2026": "1569718212165-3a8278d5f624", // corte de carne
  "tendencias-consumo-restaurantes": "1571091718767-18b5b1457add", // hamburguesa gourmet
}

// Garantiza que no haya IDs repetidos (regresión de la auditoría de duplicados)
const ids = Object.values(MAP)
const seen = new Set()
const dupes = ids.filter((id) => {
  if (seen.has(id)) return true
  seen.add(id)
  return false
})
if (dupes.length) {
  console.error(`ERROR: ${dupes.length} photo id(s) repetidos:`, dupes)
  process.exit(1)
}
console.log(`MAP validado: ${ids.length} slugs, ${seen.size} IDs únicos`)

const failed = []
let ok = 0

for (const [slug, id] of Object.entries(MAP)) {
  const url = `https://images.unsplash.com/photo-${id}?w=1200&q=70&fm=webp`
  const out = path.join(OUT_DIR, `${slug}.webp`)
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    // Normaliza a 1200x675 (16:9) y re-comprime
    await sharp(buf)
      .resize(1200, 675, { fit: "cover", position: "centre" })
      .webp({ quality: 72, effort: 4 })
      .toFile(out)
    ok++
    console.log(`✓ ${slug} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`)
  } catch (e) {
    failed.push([slug, id, e.message])
    console.log(`✗ ${slug} photo-${id}: ${e.message}`)
  }
}

console.log(`\nOK: ${ok}/${Object.keys(MAP).length}`)
if (failed.length) {
  console.log("\nFAILED:")
  for (const [s, i, m] of failed) console.log(`  ${s} | photo-${i} | ${m}`)
}
