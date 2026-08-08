// Regenerates the low-resolution collection cover WebP files at 1920px wide
// from the working Wikimedia Commons originals referenced in seed.sql.
// Run: node scripts/regenerate-collection-covers.mjs
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'public', 'images', 'collections')

// collectionSlug -> { localFile, sourceUrl }  (hi-res Commons originals)
const COVERS = {
  'sushi-comida-asiatica': {
    localFile: 'sushi.webp',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e6/Homemade_sushi_rolls%2C_2009.jpg/1920px-Homemade_sushi_rolls%2C_2009.jpg',
  },
  'pizzas-comida-italiana': {
    localFile: 'pizza.webp',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Margherita_pizza_on_plate.jpg/1920px-Margherita_pizza_on_plate.jpg',
  },
  'pollo-alitas': {
    localFile: 'pollo.webp',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Bankrueed_fried_chicken_wings.jpg/1920px-Bankrueed_fried_chicken_wings.jpg',
  },
  'cortes-carne-asaderos': {
    localFile: 'cortes.webp',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/Grilled_steaks_turned_by_grill_tongs_near_Host%C3%A1kov%2C_Vladislav%2C_T%C5%99eb%C3%AD%C4%8D_District.jpg/1920px-Grilled_steaks_turned_by_grill_tongs_near_Host%C3%A1kov%2C_Vladislav%2C_T%C5%99eb%C3%AD%C4%8D_District.jpg',
  },
  'comida-venezolana-latina': {
    localFile: 'latina.webp',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Arepas_venezolanas.jpg/1920px-Arepas_venezolanas.jpg',
  },
  'bebidas-bares-botanas': {
    localFile: 'bebidas.webp',
    sourceUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Beer_and_whisky_at_a_hotel_bar_in_Klagenfurt.jpg/1920px-Beer_and_whisky_at_a_hotel_bar_in_Klagenfurt.jpg',
  },
}

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Referer: 'https://commons.wikimedia.org/',
}

async function download(url, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS })
      if (res.status === 429) {
        console.log(`  429 rate-limited, retry ${i + 1}/${attempts} after ${2 ** i * 5}s...`)
        await new Promise((r) => setTimeout(r, 2 ** i * 5000))
        continue
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
      const buf = Buffer.from(await res.arrayBuffer())
      console.log(`  downloaded ${url} (${(buf.length / 1024).toFixed(0)} KB)`)
      return buf
    } catch (e) {
      if (i === attempts - 1) throw e
      await new Promise((r) => setTimeout(r, 2 ** i * 5000))
    }
  }
  throw new Error(`Gave up after ${attempts} attempts: ${url}`)
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const only = process.argv.slice(2) // optional slugs filter
  for (const [slug, { localFile, sourceUrl }] of Object.entries(COVERS)) {
    if (only.length && !only.includes(slug)) continue
    console.log(`\nProcessing ${slug} -> ${localFile}`)
    try {
      const src = await download(sourceUrl)
      const image = sharp(src, { failOn: 'none' }).rotate() // honor EXIF orientation
      const meta = await image.metadata()
      const width = meta.width ?? 0
      const height = meta.height ?? 0
      const resizeWidth = width >= 1920 ? 1920 : width // don't upscale
      const outFile = path.join(OUT, localFile)
      await image
        .resize({ width: resizeWidth, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(outFile)
      const outMeta = await sharp(outFile).metadata()
      const sizeKB = (fs.statSync(outFile).size / 1024).toFixed(0)
      console.log(`  ${width}x${height} -> ${outMeta.width}x${outMeta.height} webp (${sizeKB} KB)`)
    } catch (e) {
      console.error(`  FAILED: ${e.message}`)
    }
    await new Promise((r) => setTimeout(r, 1500))
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
