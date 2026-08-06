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

  // ── costos (nuevos) ─────────────────────────────────────
  "como-calcular-precio-venta-restaurante": "1461023058943-07fcbe16d735", // platillo gourmet
  "punto-de-equilibrio-restaurante": "1466978913421-dad2ebd01d17", // platillo elegante
  "utilidad-bruta-vs-neta-restaurante": "1468071174046-657d9d351a40", // restaurante moderno
  "costo-bebidas-alcohol-restaurante": "1476124369491-e7addf5db371", // botellas bar
  "precio-por-gramo-rendimiento-restaurante": "1476718406336-bb5a9690ee2a", // cocina profesional
  "descuentos-combos-promociones-restaurante": "1481070414801-51fd732d7184", // mesa de comida
  "impuestos-utilidad-restaurante-mexico": "1485808191679-5f86510681a2", // desayuno restaurante
  "kpi-financieros-restaurante-mes": "1487017159836-4e23ece2e4cf", // platillo de autor
  "costos-fijos-vs-variables-restaurante": "1490645935967-10de6ba17061", // cocina en acción

  // ── operacion (nuevos) ─────────────────────────────────
  "organizar-cocina-por-estaciones": "1495474472287-4d71bcdd2085", // cocina profesional
  "recetas-estandar-cocina-restaurante": "1498837167922-ddd27525d352", // platillo casero
  "inventario-inicial-final-restaurante": "1506461883276-594a12b11cf3", // ingredientes frescos
  "limpieza-profunda-cocina-rutina": "1507048331197-7d4ac70811cf", // cocina limpia
  "recepcion-mercancia-verificacion": "1509042239860-f550ce710b93", // cajas insumos
  "desperdicio-preparacion-porciones": "1510707577719-ae7c14805e3a", // verduras cocina
  "menu-operativo-restaurante": "1511689660979-10d2b1aada49", // menú en pizarrón
  "almacenamiento-alimentos-temperatura": "1512621776951-a57141f2eefd", // despensa organizada
  "capacitacion-equipo-cocina": "1513456852971-30c0b8199d4d", // equipo en cocina

  // ── proveeduria (nuevos) ───────────────────────────────
  "cotizaciones-comparar-proveedores": "1515003197210-e0cd71810b5f", // mesa con alimentos
  "proveedores-directos-vs-distribuidores": "1525059696034-4967a8e1dca2", // granos y semillas
  "calendario-compras-mensual-restaurante": "1530554764233-e79e16c91d08", // mercado de frutas
  "criterios-calidad-insumos": "1532938911079-1b06ac7ceec7", // verduras frescas
  "comprar-mercado-vs-mayoreo": "1533134242443-d4fd215305ad", // puesto de mercado
  "proveedores-cumplen-plazos": "1534422298391-e4f8c172dddb", // camión de entregas
  "stock-seguridad-inventario": "1537047902294-62a40c20a6ae", // almacén alimentos
  "renegociar-precios-inflacion": "1540189549336-e6e99c3679fe", // plato de comida
  "entregas-programadas-proveedores": "1544787219-7f47ccb76574", // entrega de alimentos

  // ── marketing (nuevos) ─────────────────────────────────
  "google-business-restaurante-guia": "1550317138-10000687a72b", // fachada restaurante
  "campanas-redes-sociales-comida": "1551538827-9c037cb4f32a", // platillo colorido
  "eventos-colaboraciones-restaurante": "1556909114-f6e7ad7d3136", // mesa para eventos
  "fotografia-comida-restaurante": "1563379091339-03b21ab4a4f8", // platillo fotografiado
  "club-clientes-restaurante": "1563379926898-05f4575a45d8", // clientes en restaurante
  "marketing-estacional-restaurante": "1563805042-7684c019e1cb", // comida de temporada
  "cross-selling-upselling-restaurante": "1564355808539-22fda35bed7e", // platillo servido
  "historia-marca-restaurante": "1567188040759-fb8a883dc6d8", // interior acogedor
  "encuestas-satisfaccion-clientes": "1567620832903-9fc6debc209f", // mesa con comida

  // ── herramientas (nuevos) ──────────────────────────────
  "punto-venta-restaurante-guia": "1572442388796-11668a67e53d", // caja registradora
  "apps-gestion-inventario-movil": "1572490122747-3968b75cc699", // teléfono con comida
  "hojas-calculo-vs-panel": "1573080496219-bb080dd4f877", // laptop con café
  "automatizar-procesos-restaurante": "1574071318508-1cdbab80d002", // cocina automatizada
  "dashboard-restaurante-un-dia": "1581006852262-e4307cf6283a", // laptop datos
  "tecnologia-delivery-restaurante": "1581091226825-a6a2a5aee158", // repartidor comida
  "seguridad-datos-restaurante": "1585032226651-759b368d7246", // candado seguridad
  "inteligencia-artificial-restaurantes": "1589302168068-964664d93dc0", // robot cocina
  "datos-restaurante-para-decidir": "1589308078059-be1415eab4c3", // gráficas en tablet

  // ── industria (nuevos) ─────────────────────────────────
  "cuanto-cuesta-abrir-restaurante-mexico": "1592417817098-8fd3d9eb14a5", // local nuevo
  "franquicias-restaurantes-mexico": "1599974579688-8dbdd335c77f", // franquicia comida
  "food-trucks-costos-regulacion": "1600334089648-b0d9d3028eb2", // food truck
  "legislacion-laboral-restaurantes": "1600891964092-4316c288032e", // documentos laborales
  "estadisticas-delivery-mexico": "1601050690597-df0568f70950", // entregas a domicilio
  "tendencias-cocina-mexicana": "1603894584373-5ac82b2ae398", // comida mexicana
  "sostenibilidad-restaurantes": "1604908176997-125f25cc6f3d", // productos orgánicos
  "renta-local-restaurante-costo": "1606755962773-d324e0a13086", // local comercial
  "economia-restaurantes-2027": "1611145367651-6303b46e4040", // economato cocina
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
