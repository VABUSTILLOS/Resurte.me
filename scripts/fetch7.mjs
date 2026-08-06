import sharp from 'sharp'
import fs from 'fs'
const plan = JSON.parse(fs.readFileSync('/tmp/image_plan.json','utf8'))
const targets = ['public/images/recipes/tostadas-tinga.webp','public/images/recipes/alitas-mango-habanero.webp',
           'public/images/recipes/alitas-ajillo.webp','public/images/recipes/tamales-verdes.webp',
           'public/images/recipes/t-bone.webp','public/images/recipes/bandeja-paisa.webp',
           'public/images/recipes/mojito.webp']
const sleep = ms => new Promise(r => setTimeout(r, ms))
for (const f of targets) {
  const e = plan.find(x => x.file === f)
  let ok = false
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt) await sleep(20000 + attempt * 10000)
    try {
      const resp = await fetch(e.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResurteImageBot/1.0)' }, signal: AbortSignal.timeout(30000) })
      if (!resp.ok) { if (resp.status !== 429) throw new Error('HTTP '+resp.status); continue }
      const buf = Buffer.from(await resp.arrayBuffer())
      await sharp(buf, { failOn: 'none' }).resize(e.w, e.h, { fit: 'cover', position: 'centre' }).webp({ quality: 80 }).toFile(f)
      ok = true; break
    } catch (err) { console.log(`  attempt ${attempt} ${f}: ${err.message}`) }
  }
  console.log(ok ? `OK ${f}` : `FAIL ${f}`)
  await sleep(5000)
}
