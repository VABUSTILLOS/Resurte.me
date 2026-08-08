// Converts the 111 legacy /images/products/*.jpg files (used by live-DB
// products inserted via admin scripts) to compressed WebP, and generates a
// migration that remaps any product referencing the .jpg path to the .webp.
// Run: node scripts/convert-product-jpgs-to-webp.mjs
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(__dirname, '..')
const DIR = path.join(REPO, 'public', 'images', 'products')

const jpgs = fs.readdirSync(DIR).filter((f) => f.endsWith('.jpg'))
const converted = []
const skipped = []

for (const f of jpgs) {
  const src = path.join(DIR, f)
  const out = path.join(DIR, f.replace(/\.jpg$/, '.webp'))
  try {
    const image = sharp(src, { failOn: 'none' }).rotate()
    const outMeta = await image
      .webp({ quality: 80 })
      .toFile(out)
    const kb = (fs.statSync(out).size / 1024).toFixed(1)
    converted.push({ jpg: f, webp: f.replace(/\.jpg$/, '.webp'), w: outMeta.width, h: outMeta.height, kb })
  } catch (e) {
    skipped.push({ jpg: f, error: e.message })
  }
}

console.log(`Converted ${converted.length} / ${jpgs.length}`)
for (const s of skipped) console.log(`SKIPPED ${s.jpg}: ${s.error}`)
for (const c of converted) console.log(`  ${c.jpg} -> ${c.webp} (${c.w}x${c.h}, ${c.kb} KB)`)

// ── Generate remap migration ─────────────────────────────
const lines = [
  '-- Migration 00016: Convert legacy product .jpg images to compressed WebP',
  '-- Remaps any product image_url / images array entries pointing at',
  '-- /images/products/{slug}.jpg to the equivalent .webp (files converted locally).',
  '-- Generated: ' + new Date().toISOString(),
  '',
  'BEGIN;',
  '',
]
for (const c of converted) {
  const slug = c.jpg.replace(/\.jpg$/, '')
  lines.push(
    `-- ${slug}`,
    `UPDATE products SET image_url = '/images/products/${slug}.webp', updated_at = now() WHERE image_url = '/images/products/${slug}.jpg';`,
    `UPDATE products SET images = (SELECT jsonb_agg(CASE WHEN v = '/images/products/${slug}.jpg' THEN '/images/products/${slug}.webp' ELSE v END) FROM jsonb_array_elements(images) AS v) WHERE images @> '["/images/products/${slug}.jpg"]'::jsonb;`,
    ''
  )
}
lines.push('COMMIT;', '')

const migPath = path.join(REPO, 'supabase', 'migrations', '00016_convert_product_jpgs_to_webp.sql')
fs.writeFileSync(migPath, lines.join('\n'))
console.log(`\nWrote migration: ${path.relative(REPO, migPath)} (${converted.length} remaps)`)
