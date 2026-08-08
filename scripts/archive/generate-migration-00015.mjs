// Generates supabase/migrations/00015_fix_broken_product_images.sql from the
// current seed.sql state (48 products with /images/products/generic/ URLs +
// store logo/banner local WebP).
// Run: node scripts/generate-migration-00015.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repo = path.join(__dirname, '..')
const seed = fs.readFileSync(path.join(repo, 'supabase', 'seed.sql'), 'utf8')

const slugToWebp = new Map()
for (const m of seed.matchAll(/\(\s*'[^']+',\s*'([^']+)',[^)]*?'(\/images\/products\/generic\/[^']+\.webp)'/g)) {
  slugToWebp.set(m[1], m[2])
}

const lines = ['-- Migration 00015: Fix broken product images (48 products) + store logo/banner', '-- Replaces broken Wikimedia thumbnail URLs with local branded WebP placeholders.', '-- Generated: ' + new Date().toISOString(), '', 'BEGIN;', '']
for (const [slug, webp] of [...slugToWebp.entries()].sort()) {
  lines.push(
    `UPDATE products SET image_url = '${webp}', images = jsonb_build_array('${webp}'), updated_at = now() WHERE slug = '${slug}';`
  )
}

lines.push(
  '',
  "-- Store logo/banner: replace broken Wikimedia thumbnails with local WebP",
  "UPDATE stores SET logo_url = '/images/store/logo.webp', banner_url = '/images/store/banner.webp', updated_at = now() WHERE slug = 'resurte-me';",
  '',
  'COMMIT;',
  ''
)

const out = lines.join('\n')
fs.writeFileSync(path.join(repo, 'supabase', 'migrations', '00015_fix_broken_product_images.sql'), out)
console.log('Wrote migration with', slugToWebp.size, 'product updates')
