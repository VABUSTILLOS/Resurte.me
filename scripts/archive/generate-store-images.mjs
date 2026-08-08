// One-time script to generate branded store logo + banner WebP for the
// single store in seed.sql (logo_url / banner_url pointed to broken Wikimedia
// thumbnails).
// Run: node scripts/generate-store-images.mjs
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(__dirname, '..')
const OUT = path.join(REPO, 'public', 'images', 'store')

// Logo: square-ish, brand green, "RESURTE" wordmark
const logoSvg = `<svg width="800" height="800" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#166534"/>
      <stop offset="100%" stop-color="#108910"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  <circle cx="640" cy="120" r="220" fill="#ffffff" opacity="0.06"/>
  <circle cx="120" cy="680" r="180" fill="#000000" opacity="0.08"/>
  <rect x="150" y="190" width="500" height="420" rx="48" fill="#ffffff" opacity="0.10" stroke="#ffffff" stroke-opacity="0.28" stroke-width="3"/>
  <text x="400" y="430" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="110" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="8">RESURTE</text>
  <text x="400" y="520" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="34" fill="#ffffff" opacity="0.8" text-anchor="middle" letter-spacing="6">CENTRAL DE ABASTOS</text>
  <text x="400" y="565" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="26" fill="#ffffff" opacity="0.6" text-anchor="middle">Restaurantes · Carnicerías · Cocinas</text>
</svg>`

// Banner: wide, green gradient, subtitle
const bannerSvg = `<svg width="1600" height="600" viewBox="0 0 1600 600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d3b12"/>
      <stop offset="55%" stop-color="#108910"/>
      <stop offset="100%" stop-color="#166534"/>
    </linearGradient>
    <linearGradient id="sheet" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.04"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="600" fill="url(#bg)"/>
  <circle cx="1420" cy="90" r="300" fill="#ffffff" opacity="0.06"/>
  <circle cx="180" cy="560" r="240" fill="#000000" opacity="0.08"/>
  <rect x="240" y="90" width="1120" height="420" rx="36" fill="url(#sheet)" stroke="#ffffff" stroke-opacity="0.22" stroke-width="2"/>
  <text x="800" y="300" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="120" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="8">RESURTE</text>
  <text x="800" y="390" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="40" fill="#ffffff" opacity="0.85" text-anchor="middle" letter-spacing="4">CENTRAL DE ABASTOS DIGITAL</text>
  <text x="800" y="448" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="28" fill="#ffffff" opacity="0.65" text-anchor="middle">Productos frescos de mayoreo, directo a tu cocina</text>
</svg>`

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  await sharp(Buffer.from(logoSvg)).webp({ quality: 82 }).toFile(path.join(OUT, 'logo.webp'))
  await sharp(Buffer.from(bannerSvg)).webp({ quality: 82 }).toFile(path.join(OUT, 'banner.webp'))
  console.log('Generated store logo + banner WebP')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
