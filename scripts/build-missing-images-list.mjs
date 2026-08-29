#!/usr/bin/env node
/**
 * Consolida el catálogo de productos (seed.sql + migraciones en orden) y
 * genera la lista de productos cuyo image_url local no existe en public/.
 * Salida: scripts/missing-images.json  [{ slug, name, description, path }]
 */
import fs from "fs"
import path from "path"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const read = (p) => fs.readFileSync(p, "utf8")

// --- 1. Parsear INSERT INTO products del seed ---
const seed = read(path.join(ROOT, "supabase/seed.sql"))
const inserts = [...seed.matchAll(/INSERT INTO products[^V]*VALUES([\s\S]*?);/g)]
const tuples = []
for (const ins of inserts) {
  const body = ins[1]
  let depth = 0, cur = "", inStr = false
  for (const c of body) {
    if (inStr) { cur += c; if (c === "'") inStr = false; continue }
    if (c === "'") { inStr = true; cur += c; continue }
    if (c === "(") { depth++; if (depth > 1) cur += c; continue }
    if (c === ")") { depth--; if (depth === 0) { tuples.push(cur); cur = "" } else cur += c; continue }
    if (depth >= 1) cur += c
  }
}
// columnas: name, slug, description, image_url, images, brand, category_id, show_in_whatsapp, unit
const products = new Map() // slug -> { slug, name, description, image_url }
for (const t of tuples) {
  const fields = []; let cur = "", inStr = false
  for (const c of t) {
    if (inStr) { if (c === "'") inStr = false; else cur += c; continue }
    if (c === "'") { inStr = true; continue }
    if (c === ",") { fields.push(cur.trim()); cur = ""; continue }
    cur += c
  }
  fields.push(cur.trim())
  const [name, slug, description, image_url] = fields
  if (slug) products.set(slug, { slug, name, description: description || "", image_url: image_url === "NULL" ? "" : image_url })
}
console.log("productos en seed:", products.size)

// --- 2. Aplicar UPDATEs de migraciones en orden ---
const migDir = path.join(ROOT, "supabase/migrations")
const migs = fs.readdirSync(migDir).filter(f => f.endsWith(".sql")).sort()
let applied = 0
for (const f of migs) {
  const sql = read(path.join(migDir, f))
  // WHERE slug = '...'
  for (const m of sql.matchAll(/UPDATE products SET image_url = '([^']+)'[^;]*?WHERE slug = '([^']+)'/g)) {
    const p = products.get(m[2]); if (p) { p.image_url = m[1]; applied++ }
  }
  // WHERE image_url = '...'
  for (const m of sql.matchAll(/UPDATE products SET image_url = '([^']+)'[^;]*?WHERE image_url = '([^']+)'/g)) {
    for (const p of products.values()) if (p.image_url === m[2]) { p.image_url = m[1]; applied++ }
  }
}
console.log("updates aplicados:", applied)

// --- 3. Detectar faltantes ---
const missing = []
for (const p of products.values()) {
  const u = p.image_url || ""
  if (!u || !u.startsWith("/")) continue
  if (!fs.existsSync(path.join(ROOT, "public", u))) missing.push({ slug: p.slug, name: p.name, description: p.description, path: u })
}
missing.sort((a, b) => a.path.localeCompare(b.path))
fs.writeFileSync(path.join(ROOT, "scripts/missing-images.json"), JSON.stringify(missing, null, 2))
console.log("faltantes:", missing.length, "-> scripts/missing-images.json")
