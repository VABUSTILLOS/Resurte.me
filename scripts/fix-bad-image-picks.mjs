#!/usr/bin/env node
/** Corrige selecciones malas usando archivos exactos de Wikimedia Commons. */
import fs from "fs"
import path from "path"
import sharp from "sharp"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const UA = "ResurteMe-ImageBot/1.0 (contacto: admin@resurte.me)"
const FIXES = {
  "diezmillo-de-res": "File:Raw beef steak, 2011.jpg",
  "camaron-pacotilla": "File:Raw shrimp.jpg",
  "cloro-5l": "File:Clorox Bleach products.jpg",
  "sabritas-clasicas-170g": "File:Opened bag of Ruffles All Dressed potato chips (cropped).jpg",
  "jabon-lavaplatos-750ml": "File:Tesco and Sainsburys own dishwashing liquid.jpg",
  "pan-para-crutones": "File:Croutons on yayla soup.jpg",
  "filete-de-pescado-blanco": "File:Raw frozen barramundi fillet cropped.jpg",
  "papas-cambray": "File:20 Baby potatoes - young potatoes cleaned and cut before cooking - British cuisine.jpg",
  "pure-de-jitomate": "File:Tomato puree in glass bottles 01.jpg",
  "suadero-de-res": "File:Carne de suadero en puesto de taquero.jpg",
  "tomillo-fresco": "File:Fresh thyme.jpg",
}
const missing = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/missing-images.json"), "utf8"))
for (const [slug, file] of Object.entries(FIXES)) {
  const t = missing.find(m => m.slug === slug)
  if (!t) { console.log("skip (no está en missing):", slug); continue }
  const dest = path.join(ROOT, "public", t.path)
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/^File:/, ""))}?width=800`
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" })
  if (!res.ok) { console.log(`[error] ${slug}: HTTP ${res.status}`); continue }
  const buf = Buffer.from(await res.arrayBuffer())
  try {
    await sharp(buf).resize(800, 800, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toFile(dest)
    console.log(`[ok] ${slug} <- ${file}`)
  } catch (e) { console.log(`[error] ${slug}: ${e.message}`) }
  await new Promise(r => setTimeout(r, 400))
}
