#!/usr/bin/env node
// Genera la infografía nutrimental (2ª imagen) de cada producto publicado,
// replicando el estilo de la 2ª imagen del perejil (ver /tmp/perejil-infografia.png):
//
//   1200×1200 · foto del producto a pantalla completa · pill "100% NATURAL"
//   · título bold blanco en 2 líneas con overlay verde a la izquierda
//   · tira blanca con 4 macros (ENERGÍA / PROTEÍNAS / GRASAS / CARBOHIDRATOS
//     por 100 g) · sección BENEFICIOS 2×2 con íconos lineales verdes.
//
// Se renderiza programáticamente (sharp + SVG) y NO con IA de imagen: el
// dato nutrimental tiene que salir exacto y el texto siempre legible.
//
// Uso:
//   node scripts/generate-infographics.mjs --only=perejil,aguacate-hass
//   node scripts/generate-infographics.mjs            # todos los del feed
//
// Salida: public/images/products/infografia/<slug>.webp (carpeta nueva,
// sin conflicto con el cache immutable de /images/**).

import { createRequire } from "node:module"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { nutritionFor } from "./product-images/nutrition-data.mjs"

const require = createRequire(import.meta.url)
const sharp = require("sharp")

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const OUT_DIR = join(ROOT, "public/images/products/infografia")
const FEED_PATH = join(ROOT, "scripts/product-images/catalogo-snapshot.json")
const TMP = "/tmp/infog-assets"
const SIZE = 1200

// Paleta medida de la referencia
const VERDE = "#2f5d1e"
const VERDE_PILL = "#2f5d1e"
const VERDE_OVERLAY = "rgba(47, 93, 30, 0.55)"
const BLANCO = "#ffffff"
const GRIS_TXT = "#6b6f66"

// ─── Íconos lineales (stroke, estilo de la referencia) ─────────────────────
const ICONOS = {
  corazon: 'M32 56C20 46 10 36 10 25c0-8 6-14 14-14 5 0 9 2.5 12 6 3-3.5 7-6 12-6 8 0 14 6 14 14 0 11-10 21-30 31z',
  hoja: 'M14 50C14 26 30 12 52 12c0 24-14 40-38 38zm0 0c4-10 12-18 22-24',
  escudo: 'M32 8l20 7v14c0 14-8.5 23.5-20 27-11.5-3.5-20-13-20-27V15l20-7z',
  gota: 'M32 8s18 20 18 34a18 18 0 1 1-36 0C14 28 32 8 32 8z',
  musculo: 'M14 40c0-12 8-22 20-22 8 0 12 4 16 4s8-4 12-2c3 1.5 4 5 3 8-1 4-5 6-9 7 2 3 2 7-1 9-4 3-9 2-13-1-3 2-7 3-11 2-7-2-17-1-17-5z',
  hueso: 'M20 18a7 7 0 1 1 9 9l16 16a7 7 0 1 1-9 9L20 36a7 7 0 1 1 0-18z',
  ojo: 'M8 32s10-14 24-14 24 14 24 14-10 14-24 14S8 32 8 32zm24 7a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
  rayo: 'M36 6L16 36h12l-4 22 24-32H34l2-20z',
}

function icon(nombre, x, y, s = 44, color = VERDE) {
  const d = ICONOS[nombre] || ICONOS.hoja
  return `<g transform="translate(${x},${y}) scale(${s / 64})">
    <path d="${d}" fill="none" stroke="${color}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  </g>`
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

// Divide el nombre en 2 líneas como la referencia (una palabra larga = una línea)
function tituloLineas(nombre) {
  const limpio = nombre
    .replace(/\s*\((caja|bolsa|paquete)[^)]*\)/gi, "")
    .replace(/\s*\d+(\.\d+)?\s*(kg|g|pzs|piezas).*$/i, "")
    .trim()
  const palabras = limpio.split(/\s+/)
  if (palabras.length <= 1) return [limpio.toUpperCase(), ""]
  // Caso especial: "CARNE MOLIDA 90/10" -> línea 2 es "MOLIDA 90/10"
  const mejor = { i: 1, score: Infinity }
  for (let i = 1; i < palabras.length; i++) {
    const l1 = palabras.slice(0, i).join(" ")
    const l2 = palabras.slice(i).join(" ")
    const score = Math.abs(l1.length - l2.length) + (l2.length > l1.length ? 4 : 0)
    if (score < mejor.score) mejor.score = score, mejor.i = i
  }
  const l1 = palabras.slice(0, mejor.i).join(" ").toUpperCase()
  const l2 = palabras.slice(mejor.i).join(" ").toUpperCase()
  return [l1, l2]
}

function macro(x, y, label, valor, unidad) {
  return `
  <text x="${x + 135}" y="${y + 22}" text-anchor="middle" font-size="24" font-weight="600" fill="${GRIS_TXT}" letter-spacing="3">${label}</text>
  <text x="${x + 135}" y="${y + 108}" text-anchor="middle" font-size="86" font-weight="800" fill="#1a1a1a">${esc(valor)}</text>
  <text x="${x + 135}" y="${y + 152}" text-anchor="middle" font-size="27" font-weight="600" fill="${GRIS_TXT}">${unidad}</text>`
}

function svgInfografia({ titulo, subtitulo, macros, beneficios }) {
  const [l1, l2] = tituloLineas(titulo)
  const tituloY = l2 ? 236 : 320
  const cajas = [
    ["ENERGÍA", macros[0], "kcal"],
    ["PROTEÍNAS", macros[1], "g"],
    ["GRASAS", macros[2], "g"],
    ["CARBOHIDRATOS", macros[3], "g"],
  ]
  const posBen = [
    [92, 882],
    [640, 882],
    [92, 1064],
    [640, 1064],
  ]
  // Título en blanco + un sutil degradado verde abajo-izquierda para
  // legibilidad, como la referencia (que no tapa la foto con un overlay).
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" font-family="DejaVu Sans, Helvetica, Arial, sans-serif">
  <defs>
    <linearGradient id="overlay" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="rgba(38,76,24,0.75)"/>
      <stop offset="45%" stop-color="rgba(38,76,24,0.25)"/>
      <stop offset="100%" stop-color="rgba(38,76,24,0)"/>
    </linearGradient>
  </defs>

  <rect width="${SIZE}" height="640" fill="url(#overlay)"/>

  <!-- pill superior -->
  <rect x="72" y="72" rx="40" ry="40" width="330" height="80" fill="${VERDE_PILL}"/>
  <text x="237" y="126" text-anchor="middle" font-size="34" font-weight="700" fill="${BLANCO}" letter-spacing="2">100% NATURAL</text>

  <!-- título -->
  <text x="72" y="${tituloY}" font-size="96" font-weight="800" fill="${BLANCO}" letter-spacing="1">${esc(l1)}</text>
  ${l2 ? `<text x="72" y="${tituloY + 118}" font-size="96" font-weight="800" fill="${BLANCO}" letter-spacing="1">${esc(l2)}</text>` : ""}

  <!-- subtítulo -->
  <text x="72" y="${tituloY + (l2 ? 196 : 78)}" font-size="33" font-weight="500" font-style="italic" fill="#eaf4dd">${esc(subtitulo)}</text>

  <!-- tira de macros -->
  <rect x="0" y="640" width="${SIZE}" height="212" fill="${BLANCO}"/>
  ${macro(18, 668, ...cajas[0])}
  ${macro(312, 668, ...cajas[1])}
  ${macro(606, 668, ...cajas[2])}
  ${macro(900, 668, ...cajas[3])}

  <!-- beneficios -->
  <rect x="0" y="852" width="${SIZE}" height="348" fill="${VERDE}"/>
  <text x="72" y="920" font-size="26" font-weight="700" fill="#cfe3bd" letter-spacing="6">BENEFICIOS</text>
  ${beneficios
    .map((ben, i) => {
      const [x, y] = posBen[i]
      return `
  ${icon(ben[1], x, y - 30)}
  <text x="${x + 64}" y="${y}" font-size="31" font-weight="700" fill="${BLANCO}">${esc(ben[0])}</text>`
    })
    .join("")}
</svg>`
}

// ─── assets ─────────────────────────────────────────────────────────────────

async function assetProducto(item) {
  const url = item.imageUrl
  const file = join(TMP, item.slug + ".png")
  if (existsSync(file)) return file
  let buf
  if (!url) {
    // Sin foto (p. ej. corazon-puerco): fondo verde sólido en la zona de foto.
    const out = await sharp({
      create: { width: SIZE, height: 640, channels: 3, background: "#264c18" },
    })
      .png()
      .toBuffer()
    writeFileSync(file, out)
    return file
  }
  if (url.startsWith("/")) {
    buf = readFileSync(join(ROOT, "public", url))
  } else {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`descarga ${res.status} de ${item.slug}`)
    buf = Buffer.from(await res.arrayBuffer())
  }
  // cover 1200x640 (zona superior) — la franja inferior queda tapada por
  // la tira de macros, así que se recorta al alto de la foto de referencia
  const out = await sharp(buf)
    .resize(SIZE, 640, { fit: "cover", position: "attention" })
    .png()
    .toBuffer()
  writeFileSync(file, out)
  return file
}

async function main() {
  const args = process.argv.slice(2)
  const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",").filter(Boolean)
  // Slugs extra no presentes en el feed (productos OCULTOS): el feed solo
  // trae visibles, así que se construye su item desde targets-hidden.json.
  const extra = args.find((a) => a.startsWith("--extra="))?.slice(8).split(",").filter(Boolean)
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(TMP, { recursive: true })

  const feed = JSON.parse(readFileSync(FEED_PATH, "utf8"))
  const items = feed.items.filter((i) => (!only || only.includes(i.slug)))

  if (extra?.length) {
    const hidden = JSON.parse(
      readFileSync(join(ROOT, "scripts/product-images/targets-hidden.json"), "utf8")
    )
    const hiddenAll = existsSync(join(ROOT, "scripts/product-images/targets-hidden-all.json"))
      ? JSON.parse(readFileSync(join(ROOT, "scripts/product-images/targets-hidden-all.json"), "utf8"))
      : []
    const hiddenArchive = existsSync(join(ROOT, "scripts/product-images/targets-hidden-archive.json"))
      ? JSON.parse(readFileSync(join(ROOT, "scripts/product-images/targets-hidden-archive.json"), "utf8"))
      : []
    const weber = JSON.parse(
      readFileSync(join(ROOT, "scripts/product-images/manifest.json"), "utf8")
    )
    const { DISTMAR_ITEMS } = await import("./product-images/distmar-items.mjs")
    const { WEBER_ITEMS } = await import("./product-images/weber-items.mjs")
    for (const slug of extra) {
      if (items.some((i) => i.slug === slug)) continue
      const h = hidden.find((t) => t.slug === slug)
      const ha = hiddenAll.find((t) => t.slug === slug)
      const har = hiddenArchive.find((t) => t.slug === slug)
      const w = WEBER_ITEMS.find((t) => t.slug === slug)
      const dm = DISTMAR_ITEMS.find((t) => t.slug === slug)
      const base = h || ha || har || w || dm
      if (!base) {
        console.warn(`  ⚠ --extra: ${slug} no está en targets-hidden ni en las listas de proveedores`)
        continue
      }
      items.push({
        slug,
        name: base.name,
        categoryName: base.category === 4 ? "Carnes, Aves y Pescados" : base.category === 9 ? "Congelados" : base.category === 2 ? "Abarrotes" : base.categoryName || "Abarrotes",
        imageUrl: weber[slug] || null,
        imageUrlFallback: true,
      })
    }
  }

  console.log(`Productos: ${items.length}${only ? " (muestra)" : ""}${extra ? " (+ocultos)" : ""}`)

  let hechas = 0
  const errores = []
  for (const item of items) {
    try {
      const datos = nutritionFor(item.slug, item.categoryName)
      const [kcal, prot, grasas, carbs, beneficios] = datos
      const foto = await assetProducto(item)
      const svg = svgInfografia({
        titulo: item.name,
        subtitulo: "Valores aproximados por cada 100 gramos",
        macros: [String(kcal), String(prot), String(grasas), String(carbs)],
        beneficios: beneficios.slice(0, 4),
      })
      const overlay = await sharp(Buffer.from(svg)).png().toBuffer()
      await sharp(foto)
        .resize(SIZE, 640)
        .extend({ bottom: 560, background: VERDE })
        .composite([{ input: overlay, top: 0, left: 0 }])
        .webp({ quality: 86 })
        .toFile(join(OUT_DIR, item.slug + ".webp"))
      hechas++
      if (hechas % 25 === 0) console.log(`  ${hechas}/${items.length}`)
    } catch (err) {
      errores.push(item.slug + ": " + err.message)
      console.error(`✗ ${item.slug}: ${err.message}`)
    }
  }
  console.log(`\nListo: ${hechas} infografías, ${errores.length} errores`)
  if (errores.length) process.exitCode = 1
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
