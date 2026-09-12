#!/usr/bin/env node
/** Crea las imágenes de las URLs rotas EN VIVO usando archivos exactos de Wikimedia Commons. */
import fs from "fs"
import path from "path"
import sharp from "sharp"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const UA = "ResurteMe-ImageBot/1.0 (contacto: admin@resurte.me)"
// slug (basename del path) -> archivo exacto de Commons
const FIXES = {
  // 19 sin coincidencia automática
  "aceitunas-negras": "File:2019-11-28 14 33 54 A bowl of olives laid out for Thanksgiving Dinner in the Parkway Village section of Ewing Township, Mercer County, New Jersey.jpg",
  "chile-arbol": "File:Chile de Árbol seco.JPG",
  "escarchado-michelada": "File:Michelada Cocktail.jpg",
  "pure-tomate": "File:Tomato purée in cans - multilingual.jpg",
  "pimienta-negra": "File:Ground black pepper.jpg",
  "quinoa-1kg": "File:Bolivian quinoa (1).jpg",
  "jarabe-caramelo": "File:Caramel Sauce - Caramel Syrup.jpg",
  "arandanos": "File:Dried cranberries (2).jpg",
  "cajas-pizza": "File:11 30 2022 Park Slope Pizza Boxes BPL WikiWeds Nov WMNYC.jpg",
  "wiki-213": "File:Ice cube bag 01.jpg",
  "192": "File:Transparent plastic spoons.jpg",
  "189": "File:Clear Plastic Cups (4877665249).jpg",
  "193": "File:Compostable plates (5486273308).jpg",
  "195": "File:Paper plates - isolated.png",
  "188": "File:Just a styrofoam cup - panoramio.jpg",
  "190": "File:Disposable plastic cup.jpg",
  "191": "File:Plastikgabel.jpg",
  "196": "File:A plastic spoon.jpg",
  "194": "File:BiodegradablePlasticUtensils1.jpg",
  // 7 selecciones automáticas incorrectas
  "wiki-220": "File:Pork loin (1027276219).jpg",
  "wiki-205": "File:Manihot esculenta MHNT.BOT.2004.0.508.jpg",
  "wiki-221": "File:Whole raw chicken - Japan Dec 22 2019.jpeg",
  "cebollitas-cambray": "File:Scallions - Massachusetts.jpg",
  "aderezo-bluecheese": "File:Blue cheese dressing.jpg",
  "chocolate-polvo": "File:Cocoa-powder-1883108.jpg",
  "filtros-cafe": "File:Coffee-filter.jpg",
}
const missing = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/live-missing-images.json"), "utf8"))
for (const [slug, file] of Object.entries(FIXES)) {
  const t = missing.find(m => path.basename(m.path, ".webp") === slug)
  const dest = path.join(ROOT, "public", t ? t.path : `/images/products/${slug}.webp`)
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/^File:/, ""))}?width=800`
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" })
  if (!res.ok) { console.log(`[error] ${slug}: HTTP ${res.status}`); continue }
  const buf = Buffer.from(await res.arrayBuffer())
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    await sharp(buf).resize(800, 800, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toFile(dest)
    console.log(`[ok] ${slug} <- ${file}`)
  } catch (e) { console.log(`[error] ${slug}: ${e.message}`) }
  await new Promise(r => setTimeout(r, 400))
}
