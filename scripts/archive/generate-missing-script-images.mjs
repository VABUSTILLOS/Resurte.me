// One-time script to ensure every image referenced by scripts/add_missing_products.js
// resolves to a real file on disk.
//
// Strategy:
//   1. If an equivalent WebP already exists under products/ (flat, recipe/ or generic/),
//      remap the script entry to that path.
//   2. Otherwise, generate a branded placeholder WebP (800x600, quality 82) at the
//      referenced path so products added by the script never show a broken image.
//
// Run: node scripts/generate-missing-script-images.mjs
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(__dirname, '..')
const SCRIPT = path.join(REPO, 'scripts', 'add_missing_products.js')

const CATEGORY_COLORS = {
  1: ['#166534', '#108910'],
  2: ['#92400e', '#b45309'],
  3: ['#0c4a6e', '#0369a1'],
  4: ['#881337', '#be123c'],
  5: ['#713f12', '#a16207'],
  6: ['#312e81', '#4f46e5'],
  7: ['#9a3412', '#ea580c'],
  8: ['#334155', '#475569'],
  9: ['#134e4a', '#0f766e'],
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

/** Parse products from add_missing_products.js. */
function parseProducts() {
  const src = fs.readFileSync(SCRIPT, 'utf8')
  return [...src.matchAll(/\{ name:"([^"]+)", slug:"([^"]+)", desc:"([^"]*)", img:"(\/images\/[^"]+)", brand:"([^"]+)", cat:(\d+),/g)].map(
    (m) => ({ name: m[1], slug: m[2], desc: m[3], img: m[4], brand: m[5], cat: Number(m[6]) })
  )
}

async function main() {
  const products = parseProducts()
  const remaps = new Map() // img path -> replacement path
  const toGenerate = []

  for (const p of products) {
    const abs = path.join(REPO, 'public', p.img)
    if (fs.existsSync(abs)) continue
    const base = p.img.split('/').pop().replace(/\.webp$/, '')
    // Prefer an exact existing name in any products dir (recipe/ and generic/
    // hold many of these). Flat dir wins, then recipe, then generic.
    let replacement = null
    for (const dir of ['', 'recipe', 'generic']) {
      const candidate = `/images/products/${dir ? dir + '/' : ''}${base}.webp`
      if (fs.existsSync(path.join(REPO, 'public', candidate))) {
        replacement = candidate
        break
      }
    }
    if (replacement) {
      remaps.set(p.img, replacement)
    } else {
      toGenerate.push(p)
    }
  }

  // Rewrite the script: swap img values to existing paths.
  let src = fs.readFileSync(SCRIPT, 'utf8')
  let remappedCount = 0
  for (const [from, to] of remaps) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`img:"${escaped}"`)
    if (re.test(src)) {
      src = src.replace(re, `img:"${to}"`)
      remappedCount++
    }
  }
  if (remappedCount > 0) {
    fs.writeFileSync(SCRIPT, src)
    console.log(`Remapped ${remappedCount} script images to existing files.`)
  }

  // Generate placeholders for the rest at their referenced paths.
  let generated = 0
  for (const p of toGenerate) {
    const abs = path.join(REPO, 'public', p.img)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    if (fs.existsSync(abs)) continue
    const svg = buildSvg(p.name, p.cat)
    await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(abs)
    generated++
  }
  console.log(`Generated ${generated} placeholders (${toGenerate.length - generated} already existed).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
