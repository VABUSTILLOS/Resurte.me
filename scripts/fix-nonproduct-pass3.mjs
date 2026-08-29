#!/usr/bin/env node
/** Pasada 3: archivos exactos de Commons para los 15 misses de pasada 2 + gyozas (imagen "half-eaten"). */
import fs from "fs"
import path from "path"
import sharp from "sharp"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const UA = "ResurteMe-ImageBot/1.0 (contacto: admin@resurte.me)"
const sleep = ms => new Promise(r => setTimeout(r, ms))

const FIXES = {
  "sector-restaurantero-2027-preview": "File:Gourmet 2026-07-25 salmon dish 01.jpg",
  "costos-fijos-vs-variables-restaurante": "File:Restaurant Dakar kitchen cooking stoves.jpg",
  "punto-de-equilibrio-restaurante": "File:13-09-01-kochtreffen-wien-RalfR-02.jpg",
  "tecnologia-delivery-restaurante": "File:Bolt Food courier with delivery bag.jpg",
  "comisiones-delivery-apps-2026": "File:A Woman Receiving a Takeaway Order on her Phone.jpg",
  "planificador-pedidos-restaurante": "File:Business breakfast (KH9A0798-CC).jpg",
  "rentabilidad-panel-calculadora": "File:Cotogna pizza oven.jpg",
  "marketing-estacional-restaurante": "File:Baked Pork and Fennel Sausages and pumpkin with rosemary, garlic.jpg",
  "proveeduria-abc-insumos": "File:Brunch Kalaset.jpg",
  "higiene-cocina-nom251": "File:Hands hold kitchen cleaning tools while preparing food at a sink.jpg",
  "impuestos-utilidad-restaurante-mexico": "File:Breakfast in Île d'Orléans 072.jpg",
  "precio-por-gramo-rendimiento-restaurante": "File:Kehtna Kutsehariduskeskus 005-kokad pano.jpg",
  "costeo-menu-completo-restaurante": "File:Linguine Al Pesto with Sausage, FraLi Gourmet, Savannah.jpg",
  "como-calcular-precio-venta-restaurante": "File:DFC 5103 Shrimp fried rice served with lime sliced cucumber and a side of spicy chili sauce - a classic Thai comfort dish from Pattaya.jpg",
  "costo-oportunidad-desperdicio": "File:Bowl of Cream of Mushroom Soup.JPG",
  "gyozas-cerdo": "File:Gyoza (52769973678).jpg",
}

const missing = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/live-missing-nonproduct.json"), "utf8"))
for (const [slug, file] of Object.entries(FIXES)) {
  const t = missing.find(m => path.basename(m.path, ".webp") === slug)
  if (!t) { console.log(`[skip] ${slug}: no está en la lista`); continue }
  const dest = path.join(ROOT, "public", t.path)
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file.replace(/^File:/, ""))}?width=800`
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" })
  if (!res.ok) { console.log(`[error] ${slug}: HTTP ${res.status}`); continue }
  const buf = Buffer.from(await res.arrayBuffer())
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    await sharp(buf).resize(800, 800, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toFile(dest)
    console.log(`[ok] ${slug} <- ${file}`)
  } catch (e) { console.log(`[error] ${slug}: ${e.message}`) }
  await sleep(500)
}
