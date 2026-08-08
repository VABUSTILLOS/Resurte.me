// Agrega coverImage/coverAlt al frontmatter de cada post del blog.
// Inserta después de la línea `featured:` y reemplaza portadas SVG previas.
import fs from "node:fs"
import path from "node:path"

const DIR = path.join(process.cwd(), "src/content/blog")
const ALTS = {
  "calculadora-food-cost-gratis": "Ingredientes frescos de cocina dispuestos sobre la mesa para calcular costos",
  "caso-google-maps-restaurante": "Interior de un restaurante con mesas listas para recibir clientes",
  "comisiones-delivery-apps-2026": "Hamburguesa artesanal en caja de comida para llevar de un restaurante",
  "como-reducir-merma-cocina": "Cocina profesional en plena actividad con ollas y sartenes",
  "compra-estacional-restaurante": "Frutas y verduras frescas de temporada en el puesto de un mercado",
  "compra-mayoreo-15-septiembre": "Platillo festivo servido en un restaurante para celebraciones de fiestas patrias",
  "control-de-merma-sin-hojas": "Verduras frescas sobre una tabla de madera en la cocina",
  "costeo-menu-completo-restaurante": "Platillo gourmet emplatado con presentación cuidadosa en un restaurante",
  "costeo-platillo-nuevo-restaurante": "Chef emplatando y decorando un platillo en la cocina del restaurante",
  "costeo-semanal-panel": "Platillo gourmet emplatado con ingredientes frescos en un restaurante",
  "costo-oportunidad-desperdicio": "Sopa gourmet emplatada con ingredientes frescos en un restaurante",
  "credito-financiamiento-restaurante": "Taza de café sobre la mesa de un restaurante con ambiente de negocios",
  "delivery-insumos-restaurantes": "Comida rápida de restaurante lista para entrega a domicilio",
  "digitalizar-restaurante-panel": "Interior de un restaurante con mesas y decoración acogedora",
  "elegir-proveedor-mayorista": "Alimentos frescos en el puesto de un mercado de mayoreo",
  "email-sms-restaurantes-fidelizacion": "Platillo casual servido en un restaurante con ambiente moderno",
  "errores-gestion-restaurante": "Sala de un restaurante con mesas y ambiente de trabajo",
  "errores-inventario-restaurante": "Cocina profesional con utensilios e ingredientes organizados",
  "facturacion-cfdi-restaurantes": "Bar de un restaurante con bebidas y ambiente de servicio",
  "food-cost-tipo-cocina-mexico": "Comida mexicana tradicional con salsas y guarniciones sobre la mesa",
  "google-maps-restaurantes-2026": "Fachada de un restaurante con mesas al exterior en una calle comercial",
  "guia-food-cost-restaurante-2026": "Platillo recién servido en un plato blanco sobre mesa de restaurante",
  "higiene-cocina-nom251": "Manos con guantes desinfectando y limpiando superficies de cocina",
  "horarios-consumo-restaurante": "Restaurante en pleno servicio con comensales en sus mesas",
  "inflacion-alimentos-menu-restaurante": "Platillo urbano servido en un restaurante casual de la ciudad",
  "instagram-restaurantes-contenido": "Plato creativo emplatado listo para fotografiar en un restaurante",
  "inventario-conteo-ciclico-restaurante": "Ensalada fresca con vegetales apilados lista para inventariar",
  "loyalty-recompensas-restaurante": "Comedor elegante de un restaurante con mesas y decoración cuidada",
  "margenes-delivery-vs-local": "Pizza recién horneada vista desde arriba en su caja",
  "margenes-restaurantes-mexico": "Interior acogedor de un restaurante con iluminación cálida",
  "mayoreo-vs-menudeo-precios": "Carnes y productos a la parrilla en un establecimiento de alimentos",
  "menu-digital-restaurante-guia": "Código QR de menú digital sobre la mesa de un restaurante",
  "menu-fiestas-patrias-restaurante": "Plato de tacos mexicanos con salsa y limones para fiestas patrias",
  "mise-en-place-cocina-restaurante": "Preparación de ingredientes en la cocina con utensilios organizados",
  "negociacion-proveedores-restaurante": "Café de especialidad sobre la mesa de un restaurante en reunión",
  "nom-251-higiene-restaurante": "Cocina de trabajo limpia y ordenada lista para preparar alimentos",
  "panel-herramientas-restaurante-guia": "Ambiente cálido de un restaurante con comensales y mesas servidas",
  "pedir-resenas-restaurante": "Ramen emplatado con cuidado en un restaurante de especialidad",
  "plan-marketing-restaurante-plantilla": "Mesa puesta de un restaurante lista para el servicio",
  "plan-rentabilidad-mensual-restaurante": "Pizza gourmet servida en un restaurante de ambiente moderno",
  "planificador-pedidos-restaurante": "Desayuno de trabajo en la mesa de un restaurante con ingredientes",
  "precios-mayoreo-restaurantes": "Frutas frescas en cajas del mercado para compra por mayoreo",
  "proveeduria-abc-insumos": "Ingredientes de brunch frescos listos para clasificar insumos del restaurante",
  "proveeduria-mayoreo-restaurantes": "Bowl de alimentos frescos con ingredientes de proveedor",
  "rentabilidad-panel-calculadora": "Pizza artesanal recién horneada lista para servir en el restaurante",
  "responder-resenas-google-restaurantes": "Platillo servido con esmero en la mesa de un restaurante",
  "rotacion-inventario-restaurante": "Bowl saludable con ingredientes frescos acomodados para conteo",
  "salarios-personal-restaurantes": "Cocina profesional elaborando platillos durante el servicio",
  "sector-restaurantero-2027-preview": "Platillo moderno emplatado con presentación actual en un restaurante",
  "sector-restaurantero-mexico-2026": "Corte de carne servido en un restaurante con ambiente cálido",
  "subir-precios-menu-restaurante": "Carne a la parrilla en una plancha de cocina profesional",
  "temporada-alta-restaurante": "Restaurante lleno de clientes en horario de temporada alta",
  "tendencias-consumo-restaurantes": "Hamburguesa gourmet servida en un restaurante con estilo moderno",
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
