#!/usr/bin/env node
/**
 * Batch search & replace generic/placeholder product images with real photos.
 *
 * Usage:
 *   node scripts/fetch-real-product-images-batch.mjs [plan.json]
 *
 * Reads a plan JSON (default /tmp/image_plan.json):
 *   [{ id, name, search, file, size }]
 *
 * For each entry:
 *   1. Open Food Facts search (exact-ish product match) -> image_front_url
 *   2. Wikimedia Commons search (namespace 6) -> first valid jpg/png/webp URL
 * Downloads the best candidate, resizes to cover 800x800, encodes WebP q80,
 * and overwrites the local file IN PLACE (image_url in DB stays the same).
 *
 * Failures are written to /tmp/plan_failures.json for manual review.
 */
import sharp from 'sharp'
import fs from 'fs'

const PLAN = process.argv[2] || process.env.PLAN || '/tmp/image_plan.json'
const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'))
console.log(`plan has ${plan.length} entries`)

const UA = 'ResurteImageBot/1.0 (https://resurte.me; catalog image restoration)'
const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------- search providers ----------

async function searchOpenFoodFacts(term) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=8`
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(5000 + attempt * 5000)
    let resp
    try {
      resp = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(30000),
      })
    } catch (e) {
      if (attempt === 3) throw e
      continue
    }
    if (resp.status === 429 || resp.status === 503) continue
    if (!resp.ok) continue
    const ct = resp.headers.get('content-type') || ''
    if (!ct.includes('json')) continue // rate-limit HTML page
    const j = await resp.json()
    const products = (j.products || []).filter(p => p.image_front_url)
    if (!products.length) return null
    // rank by name overlap with the search term
    const terms = term.toLowerCase().split(/\s+/).filter(t => t.length > 2)
    products.sort((a, b) => score(b, terms) - score(a, terms))
    return products[0].image_front_url
  }
  return null
}

function score(p, terms) {
  const name = `${p.product_name || ''} ${p.brands || ''}`.toLowerCase()
  let s = 0
  for (const t of terms) if (name.includes(t)) s++
  return s
}

async function searchWikimedia(term) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrnamespace=6&gsrlimit=10&prop=imageinfo&iiprop=url&format=json`
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(3000 + attempt * 2000)
    let resp
    try {
      resp = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(20000),
      })
    } catch {
      continue
    }
    if (!resp.ok) continue
    const j = await resp.json()
    const pages = j?.query?.pages ? Object.values(j.query.pages) : []
    for (const pg of pages) {
      const u = pg?.imageinfo?.[0]?.url
      if (u && /\.(jpe?g|png|webp)(\?|$)/i.test(u)) return u
    }
    return null
  }
  return null
}

// ---------- main ----------

const ok = []
const fail = []

for (let i = 0; i < plan.length; i++) {
  const item = plan[i]
  const { file, id, name, search } = item
  let url = null
  let source = ''
  try {
    url = await searchOpenFoodFacts(search)
    if (url) source = 'openfoodfacts'
    if (!url) {
      url = await searchWikimedia(search)
      if (url) source = 'wikimedia'
    }
    if (!url) throw new Error('no photo found in OFF or Wikimedia')

    let resp
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await sleep(4000 + attempt * 3000)
      resp = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(30000),
        redirect: 'follow',
      })
      if (resp.ok || resp.status !== 429) break
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const buf = Buffer.from(await resp.arrayBuffer())
    const out = await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize(800, 800, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toBuffer()
    fs.writeFileSync(file, out)
    ok.push({ file, url, source })
    if ((i + 1) % 10 === 0) console.log(`progress ${i + 1}/${plan.length} ok=${ok.length} fail=${fail.length}`)
  } catch (e) {
    fail.push({ id, name, search, file, err: String(e).slice(0, 120) })
  }
  await sleep(1200) // be gentle with OFF/Wikimedia
}

console.log(`\nDONE ok=${ok.length} fail=${fail.length}`)
if (fail.length) {
  fs.writeFileSync('/tmp/plan_failures.json', JSON.stringify(fail, null, 1))
  console.log('failures written to /tmp/plan_failures.json')
  for (const f of fail) console.log(`  FAIL ${f.id} ${f.name} :: ${f.err}`)
}
