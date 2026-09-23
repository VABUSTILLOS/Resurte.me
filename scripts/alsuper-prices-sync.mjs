#!/usr/bin/env node
// Precios de referencia de la competencia (tope de venta). ESCRIBE.
//
// Uso:
//   node scripts/alsuper-prices-sync.mjs --dry-run   # solo imprime
//   node scripts/alsuper-prices-sync.mjs             # upsert en la BD
//
// POR QUE EXISTE
// --------------
// Regla de negocio: nuestro precio de venta nunca debe superar el de la
// competencia. `00198` y `00199` aplican ese tope leyendo
// `public.competitor_prices`, que es privada (ver `00197`).
//
// EL MAPEO ES CURADO, NO AUTOMATICO
// ---------------------------------
// La busqueda por palabra clave del catalogo del rival es ruidosa: buscar
// "jitomate" no devuelve nada en Frutas y Verduras y "tomate" devolvio un
// caldo a $156.90. Por eso cada entrada fija el NOMBRE EXACTO del producto
// comparable. Si ese nombre desaparece del catalogo, el script lo reporta y
// NO inventa un sustituto: es preferible quedarse sin tope a topar contra el
// producto equivocado.
//
// POR QUE SOLO SE COMPARA CONTRA PRECIOS POR KILO
// -----------------------------------------------
// El costo de FRUGASA es por kilo. Comparar ese kilo contra una pieza o un
// manojo es exactamente lo que `src/lib/unit-price.ts` prohibe, asi que
// cuando la presentacion del rival no es un peso se guarda `unit_price`
// NULL y esa fila NO genera tope.
//
// La identidad de una fila es la PAREJA (nuestro producto, producto del
// rival): varios de nuestros articulos pueden compartir el mismo comparable
// (ciruelo rojo y negro -> "Ciruela de temporada"). Ver `00199`.
//
// El precio que se usa es el de la OFERTA VIGENTE (el que ve el cliente del
// rival), no el regular: la regla es "no ser mas caros que lo que el cliente
// ve alla".
import { existsSync, readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const BRANCH = 6 // Alsuper Plus Leones, Chihuahua Capital
const SUPPLIER = "alsuper"
const DRY_RUN = process.argv.includes("--dry-run")

// slug de nuestro producto, palabra clave de busqueda, nombre exacto alla.
const MAPPING = [
  { slug: "aguacate-hass", keyword: "aguacate", name: "Aguacate Hass  Kg" },
  { slug: "betabel", keyword: "betabel", name: "Betabel  Kg" },
  { slug: "cebolla-blanca", keyword: "cebolla blanca", name: "Cebolla Blanca Premium Alsuper Por Kg" },
  { slug: "cebolla-morada", keyword: "cebolla morada", name: "Cebolla Morada  Kg" },
  { slug: "champinon", keyword: "champinon", name: "Champiñón Blanco Monte Blanco 450 g" },
  { slug: "guayaba", keyword: "guayaba", name: "Guayaba  Kg" },
  { slug: "chile-jalapeno", keyword: "chile jalape", name: "Chile Jalapeño  Kg" },
  { slug: "mandarina", keyword: "mandarina", name: "Mandarina  Por Kg" },
  { slug: "manzana-roja", keyword: "manzana red", name: "Manzana red delicious  por kg" },
  { slug: "pimiento-morron", keyword: "pimiento morron", name: "Pimiento Morrón Verde  Kg" },
  { slug: "naranja-valencia", keyword: "naranja valencia", name: "Naranja Valencia  Kg" },
  { slug: "nopal", keyword: "nopal", name: "Nopal en Penca Limpio  Kg" },
  { slug: "papa-blanca", keyword: "papa blanca", name: "Papa Blanca Primera Alsuper Kg" },
  { slug: "pepino", keyword: "pepino", name: "Pepino   Kg" },
  { slug: "pera", keyword: "pera", name: "Pera de Anjou  Kg" },
  { slug: "platano-macho", keyword: "platano macho", name: "Plátano macho  Kg" },
  { slug: "sandia", keyword: "sandia", name: "Sandía  Kg" },
  { slug: "jitomate-bola", keyword: "tomate bola", name: "Tomate bola  Kg" },
  { slug: "jitomate-saladet", keyword: "tomate saladet", name: "Tomate Saladet  Kg" },
  { slug: "tomate-verde", keyword: "tomatillo", name: "Tomatillo  Kg" },
  { slug: "toronja", keyword: "toronja", name: "Toronja  Kg" },
  { slug: "uvas-rojas", keyword: "uva roja", name: "Uva Roja  Kg" },
  { slug: "uvas-verdes", keyword: "uva blanca", name: "Uva blanca sin semilla  kg" },
  { slug: "zanahoria", keyword: "zanahoria", name: "Zanahoria  Kg" },
  { slug: "chile-poblano", keyword: "chile poblano", name: "Chile Poblano  Kg" },
  { slug: "chile-serrano", keyword: "chile serrano", name: "Chile Serrano  Kg" },
  { slug: "jengibre-fresco", keyword: "jengibre", name: "Jengibre  Kg" },
  { slug: "limon-agrio", keyword: "limon agrio", name: "Limón Agrio    Kg" },
  { slug: "melon-chino", keyword: "melon", name: "Melón Chino  Kg" },
  { slug: "papaya-maradol", keyword: "papaya", name: "Papaya maradol  Kg" },
  { slug: "pina-miel", keyword: "pina miel", name: "Piña miel  Kg" },
  { slug: "apio", keyword: "apio", name: "Apio  Kg" },
  { slug: "brocoli", keyword: "brocoli", name: "Brócoli  Kg" },
  { slug: "chayote", keyword: "chayote", name: "Chayote  Kg" },
  { slug: "col-blanca", keyword: "repollo", name: "Repollo  Kg" },
  { slug: "chile-habanero", keyword: "chile habanero", name: "CHILE HABANERO NARANJA     1 PIEZA" },
  { slug: "kale-organico-1kg", keyword: "kale", name: "Kale Baby Orgánico  Earthbound Pza" },
  { slug: "ajo", keyword: "ajo", name: "Ajo en malla con 4 Alsuper por pieza" },
  { slug: "cilantro", keyword: "cilantro", name: "Cilantro Alsuper Por Manojo" },
  { slug: "coliflor", keyword: "coliflor", name: "Coliflor  Pza" },
  { slug: "elote", keyword: "elote", name: "Elote Blanco  3 Pzas" },
  { slug: "epazote", keyword: "epazote", name: "Epazote Alsuper pza" },
  { slug: "espinaca", keyword: "espinaca", name: "Espinaca Baby Alsuper Pza" },
  { slug: "fresa", keyword: "fresa", name: "Fresa   pza" },
  { slug: "hierbabuena-fresca", keyword: "hierbabuena", name: "Hierbabuena Alsuper Pza" },
  { slug: "lechuga-romana", keyword: "lechuga romana", name: "Lechuga Romana Orgánica Mr Lucky Pza" },
  { slug: "mango-ataulfo", keyword: "mango", name: "MANGO DESHIDRATADO NATURAL ALSUPER 200 GRAMOS" },
  { slug: "perejil", keyword: "perejil", name: "Perejil Liso  Manojo" },
  { slug: "rabano", keyword: "rabano", name: "Rábano  Manojo" },
  { slug: "romero-fresco", keyword: "romero", name: "ROMERO GOURMET ALSUPER    1 PIEZA" },
  { slug: "tomillo-fresco", keyword: "tomillo", name: "TOMILLO GOURMET ALSUPER    1 PIEZA" },
  { slug: "zarzamora", keyword: "zarzamora", name: "Zarzamora Alsuper 170 Gr" },
  { slug: "germinado-de-soya", keyword: "germinado", name: "Germinado Soya  Kg" },
  { slug: "cebolla-cambray", keyword: "cebolla cambray", name: "Cebollita Cambray  Manojo" },
  { slug: "jitomate-cherry", keyword: "tomate cherry", name: "Tomate Cherry Glorys Naturesweet Pza" },
  { slug: "frijol-negro-1kg", keyword: "frijol negro", name: "Frijol Negro Verde Valle 1 kg" },
  { slug: "arroz-blanco-1kg", keyword: "arroz", name: "Arroz Super Extra Verde Valle 2 kg" },
  { slug: "lenteja-1kg", keyword: "lenteja", name: "Lenteja  Verde Valle 500 g" },
  { slug: "quinoa-1kg", keyword: "quinoa", name: "Quinoa  Pick-One 500 g" },
  { slug: "semilla-chia-1kg", keyword: "chia", name: "Chia  Semilla Okko 300 g" },
  { slug: "consome-de-pollo-1kg", keyword: "consome de pollo", name: "Consome de pollo en Caldo  Knorr 750 g" },
  { slug: "sal-de-mar-fina-1kg", keyword: "sal de mar", name: "Sal Natural De Mar en grano La Fina 1 kg" },
  { slug: "azucar-refinada-5kg", keyword: "azucar", name: "Azucar Refinada Zulka 1 kg" },
  { slug: "cocoa-polvo-1kg", keyword: "cocoa", name: "Cocoa Natural   Molina 125 g" },
  { slug: "pimenton", keyword: "pimenton", name: "Pimenton Dulce Frasco Paprika Terana 58 Gr" },
  { slug: "hoja-de-laurel", keyword: "laurel", name: "Hoja De Laurel Mimarca 20 Gr" },
  { slug: "comino-molido", keyword: "comino", name: "Comino Molido Mimarca 70 Gr" },
  { slug: "oregano-molido-100g", keyword: "oregano", name: "Oregano Mimarca 40 Gr" },
  { slug: "canela-en-polvo", keyword: "canela molida", name: "CANELA EN POLVO  BADIA  454 GRAMOS" },
  { slug: "pimienta-negra-molida", keyword: "pimienta negra molida", name: "Pimienta Negra Molida Mccormick 64 g" },
  { slug: "pasas", keyword: "pasas", name: "Uva Pasa Mimarca 250 Gr" },
  { slug: "almendras-500g", keyword: "almendra", name: "ALMENDRA ENTERA  800 GRAMOS" },
  { slug: "nuez-de-castilla", keyword: "nuez", name: "Nuez En Mitades Promanuez 200 Gr" },
  { slug: "achiote", keyword: "achiote", name: "Achiote  La Anita 110 g" },
  { slug: "camote-amarillo", keyword: "camote", name: "Camote  Kg" },
  { slug: "calabaza", keyword: "calabaza", name: "Calabaza Butternut  por kg" },
  { slug: "chile-chilaca", keyword: "chile chilaca", name: "Chile Chilaca  Kg" },
  { slug: "durazno", keyword: "durazno", name: "Durazno  Kg" },
  { slug: "kiwi", keyword: "kiwi", name: "Kiwi  Kg" },
  { slug: "manzana-golden", keyword: "manzana golden", name: "Manzana Golden  Kg" },
  { slug: "ciruelo-rojo", keyword: "ciruela", name: "Ciruela de temporada  Kg" },
  { slug: "ciruelo-negro", keyword: "ciruela", name: "Ciruela de temporada  Kg" },
  { slug: "ejote", keyword: "ejote", name: "Ejote Cortado  La Huerta 500 g" },
  { slug: "arandano-fresco", keyword: "arandano", name: "Arandano Alsuper 170 Gr" },
  { slug: "blue-berry", keyword: "arandano", name: "Arandano Alsuper 170 Gr" },
  { slug: "ajonjoli", keyword: "ajonjoli", name: "Ajonjoli Mimarca 90 Gr" },
  { slug: "albahaca", keyword: "albahaca", name: "Albahaca Deshidratada  Campo Vivo  20 g" },
  { slug: "amaranto", keyword: "amaranto", name: "Amaranto Natural Semilla Dul-Cerel 250 Gr" },
  { slug: "cacahuate-japones", keyword: "cacahuate", name: "CACAHUATES JAPONESES KARATE 180 GRAMOS" },
  { slug: "clavo", keyword: "clavo", name: "Clavo Entero Mimarca 40 Gr" },
  { slug: "coco-rayado", keyword: "coco rayado", name: "Coco Rayado  Verde Valle  75 g" },
  { slug: "granola", keyword: "granola", name: "Granola   La Fuente 500 g" },
  { slug: "haba", keyword: "haba", name: "Haba  Verde Valle 500 g" },
  { slug: "jamaica", keyword: "jamaica", name: "Jamaica Verde Valle 200 Gr" },
  { slug: "chile-chiltepin", keyword: "chiltepin", name: "CHILE CHILTEPIN MIMARCA  25 GRAMOS" },
  { slug: "chile-mirasol", keyword: "chile mirasol", name: "Chile Seco Mirasol Secos Chih. 100 Gr" },
  { slug: "chile-pasado", keyword: "chile pasado", name: "Chile Seco Pasado Alsuper 300 g" },
  { slug: "chile-cascabel", keyword: "cascabel", name: "CHILE SECO CASCABEL MOBEE 100 GRAMOS" },
  { slug: "chile-colorin", keyword: "cascabel", name: "Chile Seco Colorin/Cascabel Secos Chih. 100 Gr" },
  { slug: "chile-morita", keyword: "morita", name: "Chile Seco Morita  Secos Chih. 100 Gr" },
  { slug: "pepita-de-girasol", keyword: "pepita", name: "PEPITA DE GIRASOL DOMO   250 GRAMOS" },
  { slug: "pepita-de-calabaza", keyword: "pepita", name: "PEPITA DE CALABAZA DOMO  250 GRAMOS" },
  { slug: "piloncillo", keyword: "piloncillo", name: "Piloncillo Genuino Granulado Metco 500 Gr" },
  { slug: "tamarindo", keyword: "tamarindo", name: "TAMARINDO MA CRUZITA 400 GRAMOS" },
  { slug: "ciruela-pasa", keyword: "ciruela pasa", name: "CIRUELA PASA SIN HUESO DOMO  350 GRAMOS" },
  { slug: "avena", keyword: "avena", name: "Avena  No. 1 1 Kg" },
  { slug: "curcuma", keyword: "curcuma", name: "Curcuma  Okko 200 g" },
  { slug: "linaza", keyword: "linaza", name: "Linaza Entera Semillas Okko 300 g" },
  { slug: "tapioca", keyword: "tapioca", name: "TAPIOCA GOURMETTY 255 GRAMOS" },
  { slug: "anis", keyword: "anis", name: "Anis Estrella Frasco Terana 28 Gr" },
]

function loadEnv() {
  if (!existsSync(".env.local")) return
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (!m) continue
    const value = m[2].replace(/^"|"$/g, "")
    if (!process.env[m[1]]) process.env[m[1]] = value
  }
}

/** Peso en kg de una presentacion ("1 KG", "500 GR"). null si no es peso. */
function formatKg(format) {
  if (!format) return null
  const t = format.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\./g, "").trim()
  const m = /^(\d+(?: \d+)?)?\s*(KG|KILOGRAMOS?|KILOS?|GR|GRAMOS?|G)$/.exec(t)
  if (!m) return null
  const amount = Number(m[1] || 1)
  return m[2].startsWith("K") ? amount : amount / 1000
}

async function search(keyword) {
  const url = `https://prod.alsuperapi.com/ms-products/branch/${BRANCH}?keyword=${encodeURIComponent(keyword)}&page=1&limit=40&ecommerce=true`
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Referer: "https://alsuper.com/" },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} al buscar ${keyword}`)
  const body = await res.json()
  return body?.data?.data ?? []
}

async function main() {
  loadEnv()
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!DRY_RUN && (!url || !key)) {
    console.error("Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
    process.exit(1)
  }

  const supabase = DRY_RUN ? null : createClient(url, key, { auth: { persistSession: false } })
  const { data: products, error } = DRY_RUN
    ? { data: MAPPING.map((m) => ({ id: null, slug: m.slug })), error: null }
    : await supabase.from("products").select("id, slug").in("slug", MAPPING.map((m) => m.slug))
  if (error) {
    console.error("No se pudieron leer los productos:", error.message)
    process.exit(1)
  }
  const idBySlug = new Map((products ?? []).map((p) => [p.slug, p.id]))

  const rows = []
  const problems = []
  const cache = new Map()

  for (const entry of MAPPING) {
    if (!cache.has(entry.keyword)) cache.set(entry.keyword, await search(entry.keyword))
    const hit = cache.get(entry.keyword).find((c) => c.name === entry.name)
    if (!hit) {
      problems.push(`${entry.slug}: no aparece "${entry.name}"`)
      continue
    }
    const kg = formatKg(hit.format)
    const unitPrice = kg ? Number((hit.price / kg).toFixed(2)) : null
    rows.push({
      product_id: idBySlug.get(entry.slug) ?? null,
      supplier_slug: SUPPLIER,
      branch_id: BRANCH,
      external_id: String(hit.objectID ?? hit.id),
      external_name: hit.name,
      format: hit.format ?? null,
      price: hit.price,
      regular_price: hit.regular_price ?? null,
      unit_price: unitPrice,
      captured_at: new Date().toISOString(),
    })
  }

  console.log(`${rows.length} precios de referencia resueltos, ${problems.length} sin resolver`)
  console.log(`${rows.filter((r) => r.unit_price === null).length} sin base comparable (pieza o manojo): no generan tope`)
  for (const p of problems) console.log("  !", p)

  if (DRY_RUN) {
    for (const r of rows) {
      console.log(`  ${r.external_name}  $${r.price} ${r.format} -> $${r.unit_price ?? "-"}/kg`)
    }
    return
  }

  const { error: upsertError } = await supabase
    .from("competitor_prices")
    .upsert(rows, { onConflict: "product_id,supplier_slug,branch_id,external_id" })
  if (upsertError) {
    console.error("Fallo el upsert:", upsertError.message)
    process.exit(1)
  }
  console.log("competitor_prices actualizada.")
  if (problems.length > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
