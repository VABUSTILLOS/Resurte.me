// Generates migration 00017 remapping restaurant_collections.image_url from
// remote Wikimedia URLs to local compressed WebP covers, and patches seed.sql.
// Run: node scripts/generate-migration-00017-collection-covers.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(__dirname, '..')

const COVERS = {
  'hamburguesas-hot-dogs': 'burger',
  'taquerias-antojitos': 'taqueria',
  'sushi-comida-asiatica': 'sushi',
  'pizzas-comida-italiana': 'pizza',
  'pollo-alitas': 'pollo',
  'comida-mexicana-corrida': 'fonda',
  'mariscos-pescados': 'mariscos',
  'cortes-carne-asaderos': 'cortes',
  'cafeterias-crepas-desayunos': 'cafe',
  'saludable-ensaladas-pokes': 'saludable',
  'postres-panaderia-helados': 'postres',
  'comida-arabe-griega': 'arabe',
  'comida-venezolana-latina': 'latina',
  'bebidas-bares-botanas': 'bebidas',
}

// Extract current remote URL per slug from seed.sql
const seedPath = path.join(REPO, 'supabase', 'seed.sql')
const seed = fs.readFileSync(seedPath, 'utf8')
const lines = seed.split('\n')

// Walk the INSERT block for restaurant_collections
const startIdx = lines.findIndex((l) => l.includes('INSERT INTO restaurant_collections'))
const endIdx = lines.findIndex((l, i) => i > startIdx && l.trim().endsWith(';'))
const block = lines.slice(startIdx, endIdx + 1).join('\n')

const updates = []
const missingFiles = []
for (const [slug, short] of Object.entries(COVERS)) {
  // Find the image_url line belonging to this slug row
  const slugIdx = block.indexOf(`'${slug}',`)
  if (slugIdx === -1) {
    console.error(`WARN: slug not found in seed: ${slug}`)
    continue
  }
  const rest = block.slice(slugIdx)
  const urlMatch = rest.match(/'(https:\/\/[^']+)'/)
  if (!urlMatch) {
    console.error(`WARN: no URL found after ${slug}`)
    continue
  }
  const remoteUrl = urlMatch[1]
  const local = `/images/collections/${short}.webp`
  const file = path.join(REPO, 'public', local)
  if (!fs.existsSync(file)) missingFiles.push(local)
  updates.push({ slug, remoteUrl, local })
}

console.log(`Parsed ${updates.length} collection rows`)
if (missingFiles.length) {
  console.error('MISSING FILES:', missingFiles)
  process.exit(1)
}

// ── Migration ─────────────────────────────────────────
const mig = [
  '-- Migration 00017: Point collection covers to local compressed WebP',
  '-- Replaces remote Wikimedia image_url values with bundled /images/collections/*.webp',
  '-- Generated: ' + new Date().toISOString(),
  '',
  'BEGIN;',
  '',
  ...updates.map(
    (u) => `UPDATE restaurant_collections SET image_url = '${u.local}', updated_at = now() WHERE slug = '${u.slug}' AND image_url = '${u.remoteUrl}';`
  ),
  '',
  'COMMIT;',
  '',
]
const migPath = path.join(REPO, 'supabase', 'migrations', '00017_local_collection_covers.sql')
fs.writeFileSync(migPath, mig.join('\n'))
console.log(`Wrote migration: ${path.relative(REPO, migPath)}`)

// ── Patch seed.sql ────────────────────────────────────
let patched = seed
for (const u of updates) {
  patched = patched.replace(u.remoteUrl, u.local)
}
if (patched !== seed) {
  fs.writeFileSync(seedPath, patched)
  console.log('Patched seed.sql: replaced remote collection cover URLs with local webp')
} else {
  console.log('seed.sql unchanged (already local?)')
}
