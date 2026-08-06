// Agrega coverImage/coverAlt al frontmatter de cada post del blog.
// Inserta después de la línea `featured:` y reemplaza portadas SVG previas.
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"

const DIR = path.join(process.cwd(), "src/content/blog")
const ALTS = {
  "calculadora-food-cost-gratis": "Calculadora de food cost sobre un escritorio con ingredientes y recetas de cocina",
  "caso-google-maps-restaurante": "Interior de un restaurante con mesas listas para recibir clientes",
  "comisiones-delivery-apps-2026": "Caja de comida para llevar de un restaurante de comida rápida",
  "como-reducir-merma-cocina": "Cocina profesional en plena actividad con ollas y sartenes",
  "compra-estacional-restaurante": "Canastas con frutas y verduras frescas de temporada en un mercado",
  "compra-mayoreo-15-septiembre": "Plato de tacos mexicanos con guarniciones para celebración de fiestas patrias",
  "control-de-merma-sin-hojas": "Verduras frescas sobre una tabla de madera en la cocina",
  "costeo-menu-completo-restaurante": "Platillo gourmet emplatado con presentación cuidadosa en un restaurante",
  "costeo-platillo-nuevo-restaurante": "Chef emplatando y decorando un platillo en la cocina del restaurante",
  "costeo-semanal-panel": "Pantalla con gráficas de costos y métricas de un restaurante",
  "costo-oportunidad-desperdicio": "Sopa gourmet emplatada con ingredientes frescos en un restaurante",
  "credito-financiamiento-restaurante": "Calculadora sobre documentos financieros de un negocio",
  "delivery-insumos-restaurantes": "Cajas de cartón apiladas en el almacén de un restaurante",
  "digitalizar-restaurante-panel": "Tablet con pantalla de gestión usada en la cocina de un restaurante",
  "elegir-proveedor-mayorista": "Cajas de frutas frescas en el puesto de un mercado de mayoreo",
  "email-sms-restaurantes-fidelizacion": "Teléfono móvil con notificaciones de mensajes en primer plano",
  "errores-gestion-restaurante": "Equipo de trabajo planeando en una mesa con documentos y laptop",
  "errores-inventario-restaurante": "Estanterías con cajas y mercancía en el almacén del restaurante",
  "facturacion-cfdi-restaurantes": "Facturas y documentos fiscales sobre un escritorio con calculadora",
  "food-cost-tipo-cocina-mexico": "Comida mexicana tradicional con salsas y guarniciones sobre la mesa",
  "google-maps-restaurantes-2026": "Teléfono móvil mostrando un mapa con la ubicación de un restaurante",
  "guia-food-cost-restaurante-2026": "Platillo recién servido en un plato blanco sobre mesa de restaurante",
  "higiene-cocina-nom251": "Manos con guantes desinfectando y limpiando superficies de cocina",
  "horarios-consumo-restaurante": "Reloj de pared sobre una mesa de restaurante con menú",
  "inflacion-alimentos-menu-restaurante": "Etiquetas de precios sobre productos de supermercado",
  "instagram-restaurantes-contenido": "Teléfono móvil mostrando la aplicación de Instagram con fotos de comida",
  "inventario-conteo-ciclico-restaurante": "Frutas y verduras frescas apiladas listas para inventariar",
  "loyalty-recompensas-restaurante": "Tarjetas de lealtad y recompensas de clientes sobre la barra",
  "margenes-delivery-vs-local": "Pizza recién horneada vista desde arriba en su caja",
  "margenes-restaurantes-mexico": "Interior acogedor de un restaurante con iluminación cálida",
  "mayoreo-vs-menudeo-precios": "Pasillo de supermercado con productos a granel en estantes",
  "menu-digital-restaurante-guia": "Código QR de menú digital sobre la mesa de un restaurante",
  "menu-fiestas-patrias-restaurante": "Plato de tacos mexicanos con salsa y limones para fiestas patrias",
  "mise-en-place-cocina-restaurante": "Preparación de ingredientes en la cocina con utensilios organizados",
  "negociacion-proveedores-restaurante": "Apretón de manos entre dos personas en una reunión de negocios",
  "nom-251-higiene-restaurante": "Guantes de limpieza y utensilios desinfectados en la cocina",
  "panel-herramientas-restaurante-guia": "Tablero digital con gráficas y métricas de gestión del restaurante",
  "pedir-resenas-restaurante": "Teléfono móvil mostrando reseñas y valoraciones de un restaurante",
  "plan-marketing-restaurante-plantilla": "Equipo de marketing trabajando en una mesa con documentos y laptop",
  "plan-rentabilidad-mensual-restaurante": "Tablero con gráficas de rentabilidad y métricas de negocio",
  "planificador-pedidos-restaurante": "Computadora portátil con listas de pedidos y compras del restaurante",
  "precios-mayoreo-restaurantes": "Pasillo de supermercado con productos apilados para compra de mayoreo",
  "proveeduria-abc-insumos": "Verduras frescas en cajas listas para clasificar insumos del restaurante",
  "proveeduria-mayoreo-restaurantes": "Cajas de mercancía en el almacén de un proveedor de alimentos",
  "rentabilidad-panel-calculadora": "Calculadora junto a documentos con cifras de un restaurante",
  "responder-resenas-google-restaurantes": "Pantalla de teléfono con comentarios y reseñas de clientes",
  "rotacion-inventario-restaurante": "Estantes de tienda con productos acomodados para conteo de inventario",
  "salarios-personal-restaurantes": "Equipo de cocina profesional trabajando coordinado en el servicio",
  "sector-restaurantero-2027-preview": "Interior de un restaurante con clientes y ambiente animado",
  "sector-restaurantero-mexico-2026": "Comensales en mesas de un restaurante con ambiente cálido",
  "subir-precios-menu-restaurante": "Carne a la parrilla en una plancha de cocina profesional",
  "temporada-alta-restaurante": "Restaurante lleno de clientes en horario de temporada alta",
  "tendencias-consumo-restaurantes": "Platillo moderno servido en plato blanco con presentación actual",
  "turnos-costo-laboral-restaurante": "Chef dirigiendo a su equipo de cocina durante el servicio",
}

// Post sin alt explícito: deriva del título sanitizado
function fallbackAlt(title) {
  const clean = title.replace(/\(2026\)|\(2027\)/g, "").replace(/[:\-–].*$/, "").trim()
  return `Fotografía de ${clean.toLowerCase()} en un restaurante`
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".mdx")).sort()
let updated = 0
let missing = []

for (const file of files) {
  const slug = file.replace(/\.mdx$/, "")
  const fp = path.join(DIR, file)
  let content = fs.readFileSync(fp, "utf8")

  const alt = ALTS[slug] ?? fallbackAlt((content.match(/^title:\s*"([^"]+)"/m) || [])[1] || slug)
  if (!ALTS[slug]) missing.push(slug)

  const coverLine = `coverImage: "/images/blog/${slug}.webp"\ncoverAlt: "${alt}"\n`

  // Si ya tiene coverImage, reemplaza el bloque existente
  const hasCover = /^coverImage:/m.test(content)
  if (hasCover) {
    content = content.replace(/^coverImage:.*\ncoverAlt:.*\n/m, coverLine)
  } else {
    // Inserta después de la línea featured:
    content = content.replace(/^(featured:\s*\w+\n)/m, `$1${coverLine}`)
  }
  fs.writeFileSync(fp, content)
  updated++
}

console.log(`Updated: ${updated} posts`)
console.log(`Fallback alts used for: ${missing.length ? missing.join(", ") : "none"}`)
