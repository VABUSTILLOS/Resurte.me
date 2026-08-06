// Descarga portadas de Unsplash para los 54 posts del blog de Resurte.me.
// CDN directo images.unsplash.com/photo-{id}?w=1200&q=70&fm=webp
// Normaliza a 1200x675 (16:9) con sharp y guarda en public/images/blog/{slug}.webp
import fs from "node:fs"
import path from "node:path"
import sharp from "sharp"

const OUT_DIR = path.join(process.cwd(), "public/images/blog")
fs.mkdirSync(OUT_DIR, { recursive: true })

// Mapeo slug -> Unsplash photo id. Elige la foto más relevante al tema.
const MAP = {
  // ── costos ─────────────────────────────────────────────
  "guia-food-cost-restaurante-2026": "1504674900247-0877df9cc836", // platillo en mesa
  "calculadora-food-cost-gratis": "1554224155-6726b3ff858f", // calculadora
  "costeo-menu-completo-restaurante": "1414235077428-338989a2e8c0", // comida fina
  "costeo-platillo-nuevo-restaurante": "1559847844-5315695dadae", // chef emplatando
  "costeo-semanal-panel": "1460925895917-afdab827c52f", // analiticas
  "food-cost-tipo-cocina-mexico": "1551504734-5ee1c4a1479b", // comida mexicana
  "margenes-delivery-vs-local": "1565299624946-b28f40a0ae38", // pizza
  "margenes-restaurantes-mexico": "1552566626-52f8b828add9", // restaurante interior
  "precios-mayoreo-restaurantes": "1542838132-92c53300491e", // supermercado
  "subir-precios-menu-restaurante": "1555939594-58d7cb561ad1", // carne a la parrilla
  "costo-oportunidad-desperdicio": "1547592180-85f173990554", // plato sopa gourmet
  "plan-rentabilidad-mensual-restaurante": "1551288049-bebda4e38f71", // dashboard

  // ── operacion ──────────────────────────────────────────
  "como-reducir-merma-cocina": "1556910103-1c02745aae4d", // cocina en acción
  "control-de-merma-sin-hojas": "1584992236310-6edddc08acff", // verdura fresca
  "errores-inventario-restaurante": "1553413077-190dd305871c", // cajas almacén
  "higiene-cocina-nom251": "1576091160399-112ba8d25d1d", // sanitización
  "inventario-conteo-ciclico-restaurante": "1584473457406-6240486418e9", // frutas y verdura
  "menu-fiestas-patrias-restaurante": "1552332386-f8dd00dc2f85", // tacos
  "mise-en-place-cocina-restaurante": "1556911220-bff31c812dba", // preparación cocina
  "nom-251-higiene-restaurante": "1584634731339-252c581abfc5", // guantes limpieza
  "rotacion-inventario-restaurante": "1542838132-92c53300491e", // estantes tienda
  "turnos-costo-laboral-restaurante": "1550966871-3ed3cdb5ed0c", // chef equipo
  "delivery-insumos-restaurantes": "1553413077-190dd305871c", // entrega cajas

  // ── proveeduria ────────────────────────────────────────
  "compra-estacional-restaurante": "1542838132-92c53300491e", // mercado
  "compra-mayoreo-15-septiembre": "1552332386-f8dd00dc2f85", // tacos fiesta
  "elegir-proveedor-mayorista": "1488459716781-31db52582fe9", // frutas mercado
  "mayoreo-vs-menudeo-precios": "1542838132-92c53300491e", // mayoreo
  "negociacion-proveedores-restaurante": "1556157382-97eda2d62296", // apretón de manos
  "proveeduria-abc-insumos": "1584992236310-6edddc08acff", // verdura
  "proveeduria-mayoreo-restaurantes": "1553413077-190dd305871c", // almacén

  // ── marketing ──────────────────────────────────────────
  "caso-google-maps-restaurante": "1517248135467-4c7edcad34c4", // restaurante mesas
  "comisiones-delivery-apps-2026": "1526367790999-0150786686a2", // comida rápida
  "email-sms-restaurantes-fidelizacion": "1511707171634-5f897ff02aa9", // teléfono
  "google-maps-restaurantes-2026": "1519389950473-47ba0277781c", // teléfono mapa
  "instagram-restaurantes-contenido": "1611162617213-7d7a39e9b1d7", // teléfono instagram
  "loyalty-recompensas-restaurante": "1556745757-8d76bdb6984b", // tarjeta lealtad
  "menu-digital-restaurante-guia": "1590650153855-d9e808231d41", // QR menú
  "pedir-resenas-restaurante": "1526738549149-8e07eca6c147", // teléfono reseñas
  "plan-marketing-restaurante-plantilla": "1556761175-5973dc0f32e7", // equipo marketing
  "responder-resenas-google-restaurantes": "1516387938699-a93567ec168e", // comentarios
  "temporada-alta-restaurante": "1555396273-367ea4eb4db5", // restaurante lleno

  // ── herramientas ───────────────────────────────────────
  "digitalizar-restaurante-panel": "1517299321609-52687d1bc55a", // tablet
  "errores-gestion-restaurante": "1556761175-5973dc0f32e7", // gestión
  "panel-herramientas-restaurante-guia": "1460925895917-afdab827c52f", // datos
  "planificador-pedidos-restaurante": "1498837167922-ddd27525d352", // ordenador
  "rentabilidad-panel-calculadora": "1554224155-6726b3ff858f", // calculadora

  // ── industria / administracion ────────────────────────
  "credito-financiamiento-restaurante": "1554224155-6726b3ff858f", // dinero
  "facturacion-cfdi-restaurantes": "1450101499163-c8848c66ca85", // factura
  "horarios-consumo-restaurante": "1507679799987-c73779587ccf", // reloj
  "inflacion-alimentos-menu-restaurante": "1563013544-824ae1b704d3", // precios
  "salarios-personal-restaurantes": "1550966871-3ed3cdb5ed0c", // chef equipo
  "sector-restaurantero-2027-preview": "1552566626-52f8b828add9", // restaurante
  "sector-restaurantero-mexico-2026": "1517248135467-4c7edcad34c4", // restaurante
  "tendencias-consumo-restaurantes": "1504674900247-0877df9cc836", // platillo
}

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
