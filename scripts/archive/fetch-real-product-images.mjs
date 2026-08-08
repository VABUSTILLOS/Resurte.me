#!/usr/bin/env node
/**
 * Batch-replace placeholder product images with real photos.
 * Usage: node scripts/fetch-real-product-images.mjs
 * Reads /tmp/image_plan.json: [{file: "public/images/products/recipe/x.webp", url: "...", w: 800, h: 600}]
 * Downloads each URL, resizes to (w,h), encodes WebP q80, overwrites in place.
 */
import sharp from 'sharp'
import fs from 'fs'

const PLAN = process.env.PLAN || '/tmp/image_plan.json'
const plan = JSON.parse(fs.readFileSync(PLAN, 'utf8'))
console.log(`plan has ${plan.length} files`)

const sleep = ms => new Promise(r => setTimeout(r, ms))
const ok = []
const fail = []

for (let i = 0; i < plan.length; i++) {
  const { file, url, w, h, quality = 80 } = plan[i]
  try {
    let resp
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt) await sleep(4000 + attempt * 3000)
      resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResurteImageBot/1.0)' },
        signal: AbortSignal.timeout(30000),
        redirect: 'follow',
      })
      if (resp.ok || resp.status !== 429) break
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const buf = Buffer.from(await resp.arrayBuffer())
    const out = await sharp(buf, { failOn: 'none' })
      .resize(w, h, { fit: 'cover', position: 'centre' })
      .webp({ quality })
      .toBuffer()
    fs.writeFileSync(file, out)
    ok.push(file)
    await sleep(250)
    if ((i + 1) % 25 === 0) console.log(`progress ${i + 1}/${plan.length} ok=${ok.length} fail=${fail.length}`)
  } catch (e) {
    fail.push({ file, url, err: String(e).slice(0, 120) })
  }
}

console.log(`\nDONE ok=${ok.length} fail=${fail.length}`)
if (fail.length) {
  fs.writeFileSync('/tmp/plan_failures.json', JSON.stringify(fail, null, 1))
  console.log('failures written to /tmp/plan_failures.json')
  for (const f of fail) console.log(`  FAIL ${f.file} <- ${f.url} :: ${f.err}`)
}
