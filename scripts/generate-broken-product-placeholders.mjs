// One-time script to generate branded WebP placeholder images for products
// whose image_url points to broken Wikimedia thumbnail URLs (HTTP 400/404).
//
// Run: node scripts/generate-broken-product-placeholders.mjs
//
// It parses supabase/seed.sql for product rows whose image_url contains a
// broken Wikimedia thumbnail path and writes a branded placeholder per slug
// to public/images/products/generic/{slug}.webp (800x600, WebP quality 82).
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(__dirname, '..')

// Broken Wikimedia thumbnail bases observed in seed.sql (HTTP 400/404).
const BROKEN = [
  'Butcher_shop_display',
  'Soft_drinks_assortment',
  'Bread_assortment',
  'Grocery_store_aisle',
  'Chips_and_snacks',
  'Cleaning_products',
  'Frozen_food_section',
]

const CATEGORY_COLORS = {
  // cat -> [from, to]
  1: ['#166534', '#108910'], // Frutas y Verduras
  2: ['#92400e', '#b45309'], // Despensa / Especias
  3: ['#0c4a6e', '#0369a1'], // Lácteos y Huevo
  4: ['#881337', '#be123c'], // Carnes
  5: ['#713f12', '#a16207'], // Panadería
  6: ['#312e81', '#4f46e5'], // Bebidas
  7: ['#9a3412', '#ea580c'], // Salsas / Botanas
  8: ['#334155', '#475569'], // Limpieza
  9: ['#134e4a', '#0f766e'], // Congelados
}
const DEFAULT = ['#14532d', '#15803d']

function xmlEscape(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildSvg(name, cat) {
  const [from, to] = CATEGORY_COLORS[cat] || DEFAULT
  // Word-wrap name at ~22 chars/line
  const words = name.split(' ')
  const lines = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > 22 && cur) {
      lines.push(cur.trim())
      cur = w
    } else {
      cur = (cur + ' ' + w).trim()
    }
  }
  if (cur) lines.push(cur.trim())
  const lineHeight = 64
  const startY = 300 - ((lines.length - 1) * lineHeight) / 2
  const text = lines
    .map(
      (l, i) =>
        `<text x="400" y="${startY + i * lineHeight}" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="58" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">${xmlEscape(l)}</text>`
    )
    .join('')

  return `<svg width="800" height="600" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
    <linearGradient id="sheet" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.05"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <circle cx="700" cy="80" r="180" fill="#ffffff" opacity="0.07"/>
  <circle cx="90" cy="540" r="140" fill="#000000" opacity="0.08"/>
  <rect x="120" y="120" width="560" height="360" rx="28" fill="url(#sheet)" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>
  <text x="400" y="200" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="30" font-weight="600" fill="#ffffff" opacity="0.85" text-anchor="middle" letter-spacing="4">RESURTE</text>
  ${text}
  <text x="400" y="552" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="24" fill="#ffffff" opacity="0.7" text-anchor="middle">Restaurantes · Carnicerías · Cocinas</text>
</svg>`
}

/** Extrae (name, slug, cat) de las líneas de seed.sql cuyo image_url es un thumbnail roto. */
function parseBrokenProducts() {
  const src = fs.readFileSync(path.join(REPO, 'supabase', 'seed.sql'), 'utf8')
  const products = []
  for (const line of src.split('\n')) {
    if (!line.includes('https://upload.wikimedia.org/wikipedia/commons/thumb/')) continue
    const m = line.match(/\(\s*'([^']+)',\s*'([^']+)',\s*'([^']*)',\s*'(https:[^']+)',\s*(NULL|'[^']*'::jsonb|\[[^\]]*\]::jsonb),\s*'([^']*)',\s*(\d+),\s*(true|false),\s*'([^']+)'\s*\)/)
    if (!m) continue
    if (!BROKEN.some((b) => m[4].includes(b))) continue
    products.push({ name: m[1], slug: m[2], cat: Number(m[7]) })
  }
  return products
}

async function main() {
  const products = parseBrokenProducts()
  const outDir = path.join(REPO, 'public', 'images', 'products', 'generic')
  fs.mkdirSync(outDir, { recursive: true })
  let ok = 0
  let skipped = 0
  for (const p of products) {
    const file = path.join(outDir, `${p.slug}.webp`)
    if (fs.existsSync(file)) {
      skipped++
      continue
    }
    const svg = buildSvg(p.name, p.cat)
    await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(file)
    ok++
  }
  console.log(`Generated ${ok} placeholders, ${skipped} already existed. Total: ${products.length}`)
  console.log('Slugs:')
  for (const p of products) console.log(`  ${p.slug} (cat ${p.cat})`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
