#!/usr/bin/env node
// Busca comparables en la API de Alsuper (branch 6) para los SKUs de
// weber-items.mjs y emite scripts/product-images/weber-topes.json:
// { slug: { al_id, al_name, format, price, regular, cap_kg } }
//
// cap_kg = precio por kilo del rival; null cuando la presentación no es un
// peso (pieza/paquete) — entonces la fila NO genera tope, como 00202.
// El mapeo es curado: se elige el candidato por nombre y se imprime la
// lista completa para revisión.

import { writeFileSync } from "node:fs"
import { WEBER_ITEMS } from "./weber-items.mjs"

const BRANCH = 6

async function search(keyword) {
  const url = `https://prod.alsuperapi.com/ms-products/branch/${BRANCH}?keyword=${encodeURIComponent(keyword)}&page=1&limit=40&ecommerce=true`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Alsuper ${res.status} para "${keyword}"`)
  const json = await res.json()
  return json?.data?.data ?? []
}

// Convierte la presentación del rival a precio por kilo; null si no es peso.
function perKilo(item) {
  const fmt = (item.format || "").toUpperCase().trim()
  const price = item.price
  const m = fmt.match(/^(\d+(?:\.\d+)?)\s*(KG|GR|G|ML|LT|L)$/)
  if (!m) return null
  const qty = parseFloat(m[1])
  const unit = m[2]
  if (unit === "KG" || unit === "LT" || unit === "L") return price / qty
  if (unit === "GR" || unit === "G" || unit === "ML") return (price / qty) * 1000
  return null
}

function score(candidate, keyword) {
  const name = (candidate.name || "").toLowerCase()
  const words = keyword.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  return words.filter((w) => name.includes(w)).length
}

const out = {}
const misses = []
for (const item of WEBER_ITEMS) {
  if (!item.alsuper) continue
  try {
    const candidates = await search(item.alsuper)
    if (!candidates.length) {
      misses.push(`${item.slug}: sin resultados para "${item.alsuper}"`)
      continue
    }
    const best = candidates
      .map((c) => ({ c, s: score(c, item.alsuper), kg: perKilo(c) }))
      .sort((a, b) => b.s - a.s || (b.kg ?? 0) - (a.kg ?? 0))[0]
    out[item.slug] = {
      al_id: best.c.id,
      al_name: best.c.name,
      format: best.c.format,
      price: best.c.price,
      regular: best.c.regular_price,
      cap_kg: best.kg ? Math.round(best.kg * 100) / 100 : null,
    }
    console.log(
      `${item.slug} → ${best.c.name} [${best.c.format}] $${best.c.price} = ${best.kg ? "$" + best.kg.toFixed(2) + "/kg" : "sin tope"}`
    )
    await new Promise((r) => setTimeout(r, 120))
  } catch (err) {
    misses.push(`${item.slug}: ${err.message}`)
  }
}

writeFileSync("scripts/product-images/weber-topes.json", JSON.stringify(out, null, 2))
console.log(`\nTopes: ${Object.keys(out).length}, sin mapeo: ${misses.length}`)
misses.forEach((m) => console.log("  -", m))
