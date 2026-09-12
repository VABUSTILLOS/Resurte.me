#!/usr/bin/env node
/**
 * Descarga imágenes para los productos listados en scripts/missing-images.json.
 *
 * Estrategia por producto:
 *  1. Open Food Facts (mejor para productos de marca).
 *  2. Wikimedia Commons (mejor para ingredientes/genéricos).
 * La imagen se convierte a WebP (máx. 800px, calidad 80) con sharp y se guarda
 * en la ruta exacta que el producto ya referencia (public/<path>).
 *
 * Uso: node scripts/fetch-missing-images.mjs [--only slug1,slug2] [--dry-run]
 */
import fs from "fs"
import path from "path"
import sharp from "sharp"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const REPORT = "/Users/mac/.copilot/session-state/41fcbf16-8e6b-44df-b21e-95355e944fa0/files/fetch-report.json"
const UA = "ResurteMe-ImageBot/1.0 (contacto: admin@resurte.me)"
const args = process.argv.slice(2)
const DRY = args.includes("--dry-run")
const onlyIdx = args.indexOf("--only")
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1].split(",") : null

const inputIdx = args.indexOf("--input")
const INPUT_FILE = inputIdx > -1 ? args[inputIdx + 1] : "scripts/missing-images.json"
const missing = JSON.parse(fs.readFileSync(path.join(ROOT, INPUT_FILE), "utf8"))
  .map(m => ({ ...m, slug: m.slug || path.basename(m.path, ".webp") }))
const OVERRIDES = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/manual-image-overrides.json"), "utf8"))
const targets = ONLY ? missing.filter(m => ONLY.includes(m.slug)) : missing

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function fetchJSON(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } })
    if (res.ok) return res.json()
    if (res.status >= 500 && i < retries - 1) { await sleep(1500 * (i + 1)); continue }
    throw new Error(`HTTP ${res.status} ${url}`)
  }
}

// Quita tamaños/presentaciones del nombre para buscar ("Queso Manchego 400g" -> "Queso Manchego")
function baseName(name) {
  return name.replace(/\s*\d+([.,]\d+)?\s*(kg|g|l|ml|pz|pack)\b\.?/gi, "").replace(/\s{2,}/g, " ").trim()
}

async function searchOpenFoodFacts(name, query) {
  const base = query || baseName(name)
  const q = encodeURIComponent(base)
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${q}&search_simple=1&action=process&json=1&page_size=20&fields=product_name,image_front_url,image_url`
  const data = await fetchJSON(url)
  const tokens = base.toLowerCase().normalize("NFD").replace(/[́-ͯ]/g, "").split(/\s+/).filter(t => t.length > 2)
  let best = null, bestScore = 0
  for (const p of data.products || []) {
    const img = p.image_front_url || p.image_url
    if (!img || !p.product_name) continue
    const pn = p.product_name.toLowerCase().normalize("NFD").replace(/[́-ͯ]/g, "")
    const score = tokens.filter(t => pn.includes(t)).length
    if (score > bestScore || (score === bestScore && best && p.product_name.length < best.title.length)) {
      best = { url: img, source: "openfoodfacts", title: p.product_name, score }; bestScore = score
    }
  }
  // exigir que al menos la mitad de los tokens relevantes aparezcan
  return bestScore >= Math.max(1, Math.ceil(tokens.length / 2)) ? best : null
}

async function searchWikimedia(name, query) {
  const q = encodeURIComponent(query || baseName(name))
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${q}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=800&format=json`
  const data = await fetchJSON(url)
  const pages = Object.values(data.query?.pages || {})
    .filter(p => p.imageinfo?.[0]?.mime?.startsWith("image/") && p.imageinfo[0].width >= 300)
    .sort((a, b) => (b.imageinfo[0].width * b.imageinfo[0].height) - (a.imageinfo[0].width * a.imageinfo[0].height))
  const best = pages[0]
  if (!best) return null
  const info = best.imageinfo[0]
  return { url: info.thumburl || info.url, source: "wikimedia", title: best.title }
}

async function downloadToWebp(url, dest) {
  const res = await fetch(url, { headers: { "User-Agent": UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status} descargando ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 2000) throw new Error("imagen sospechosamente pequeña")
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  await sharp(buf).resize(800, 800, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toFile(dest)
}

const report = []
let done = 0, failed = 0
for (const t of targets) {
  const dest = path.join(ROOT, "public", t.path)
  if (fs.existsSync(dest)) { report.push({ ...t, status: "skip-exists" }); continue }
  let hit = null, err = null
  const ov = OVERRIDES[t.slug]
  if (ov) {
    try { hit = ov.engine === "off" ? await searchOpenFoodFacts(t.name, ov.query) : await searchWikimedia(t.name, ov.query) } catch (e) { err = String(e.message || e) }
    await sleep(400)
  } else {
    try { hit = await searchOpenFoodFacts(t.name) } catch (e) { err = String(e.message || e) }
    await sleep(400)
    if (!hit) {
      try { hit = await searchWikimedia(t.name) } catch (e) { err = err || String(e.message || e) }
      await sleep(400)
    }
  }
  if (!hit && !err) err = "sin coincidencias"

  if (hit && !err) {
    if (DRY) { report.push({ ...t, status: "dry", ...hit }); continue }
    try {
      await downloadToWebp(hit.url, dest)
      done++
      report.push({ ...t, status: "ok", source: hit.source, title: hit.title })
      console.log(`[ok] ${t.slug} <- ${hit.source}: ${hit.title}`)
    } catch (e) {
      failed++
      report.push({ ...t, status: "error", error: String(e.message || e), ...hit })
      console.log(`[error] ${t.slug}: ${e.message}`)
    }
  } else {
    failed++
    report.push({ ...t, status: "not-found", error: err })
    console.log(`[not-found] ${t.slug} (${t.name})`)
  }
  await sleep(200)
}
fs.writeFileSync(REPORT, JSON.stringify(report, null, 2))
console.log(`\nResumen: ${done} descargadas, ${failed} fallidas de ${targets.length}. Reporte: ${REPORT}`)
