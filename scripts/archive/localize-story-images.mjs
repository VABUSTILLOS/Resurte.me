// Downloads the 15 Unsplash story-section images referenced in
// collection-content.ts, converts them to compressed WebP, and rewrites the
// source to point at local /images/story/*.webp.
// Run: node scripts/localize-story-images.mjs
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.join(__dirname, '..')
const OUT_DIR = path.join(REPO, 'public', 'images', 'story')
fs.mkdirSync(OUT_DIR, { recursive: true })

const contentPath = path.join(REPO, 'src', 'lib', 'collection-content.ts')
let src = fs.readFileSync(contentPath, 'utf8')

const urls = [...new Set(src.match(/https:\/\/images\.unsplash\.com\/[^"\s]+/g) || [])]
console.log(`Found ${urls.length} unique Unsplash URLs`)

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

const replacements = []
for (const url of urls) {
  const photoId = url.match(/photo-([0-9a-z-]+)/)?.[1]
  if (!photoId) {
    console.log(`SKIP (no photo id): ${url}`)
    continue
  }
  const outFile = path.join(OUT_DIR, `${photoId}.webp`)
  const relPath = `/images/story/${photoId}.webp`

  if (!fs.existsSync(outFile)) {
    // Fetch at a generous width; layout maxes out ~40vw of 1280px container
    const dlUrl = url.replace(/\?.*/, `?w=1200&q=80`)
    console.log(`Downloading ${photoId}...`)
    const res = await fetch(dlUrl, {
      headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' },
    })
    if (!res.ok) {
      console.error(`FAIL ${url} -> HTTP ${res.status}`)
      continue
    }
    const buf = Buffer.from(await res.arrayBuffer())
    await sharp(buf, { failOn: 'none' }).rotate().webp({ quality: 80 }).toFile(outFile)
    await new Promise((r) => setTimeout(r, 700))
  }

  const sizeKb = (fs.statSync(outFile).size / 1024).toFixed(1)
  replacements.push({ url, relPath, sizeKb })
  console.log(`  ${relPath} (${sizeKb} KB)`)
}

// Rewrite source
let updated = src
for (const { url, relPath } of replacements) {
  if (!updated.includes(url)) {
    console.error(`URL not found in source: ${url}`)
    process.exit(1)
  }
  updated = updated.split(url).join(relPath)
}
fs.writeFileSync(contentPath, updated)
console.log(`\nRewrote ${replacements.length} URLs in collection-content.ts`)
