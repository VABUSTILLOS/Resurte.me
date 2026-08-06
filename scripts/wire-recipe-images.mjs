// Wires the 42 branded per-recipe images (already converted to WebP) into
// src/lib/recipes.ts, replacing the shared 14-image pool with per-recipe images.
// Run: node scripts/wire-recipe-images.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const file = path.join(__dirname, '..', 'src', 'lib', 'recipes.ts')

// branded webp slug -> recipe name (exact match from recipes.ts)
const MAPPING = {
  'alitas-buffalo': 'Alitas Buffalo Clásicas',
  'arepas': 'Arepas Reina Pepiada',
  'arrachera': 'Arrachera a la Parrilla',
  'boneless-bbq': 'Boneless BBQ',
  'burger-smash': 'Hamburguesa Clásica Smash',
  'california-roll': 'California Roll',
  'ceviche-camaron': 'Ceviche de Camarón',
  'chiles-rellenos': 'Chiles Rellenos',
  'coctel-camaron': 'Cóctel de Camarón',
  'conchas': 'Conchas Mexicanas',
  'crepa-nutella': 'Crepa Dulce de Nutella y Fresa',
  'empanadas-colombianas': 'Empanadas Colombianas',
  'enchiladas-verdes': 'Enchiladas Verdes',
  'ensalada-cesar': 'Ensalada César con Pollo',
  'gyro-cerdo': 'Gyro de Cerdo',
  'helado-vainilla': 'Helado de Vainilla Artesanal',
  'hotcakes': 'Hot Cakes Americanos',
  'hotdog-chicago': 'Hot Dog Estilo Chicago',
  'huevos-rancheros': 'Huevos Rancheros',
  'hummus': 'Hummus Casero',
  'limonada': 'Limonada Natural',
  'michelada': 'Michelada Clásica',
  'mole-poblano': 'Mole Poblano',
  'nachos': 'Nachos Supreme',
  'papas-gourmet': 'Papas Fritas Gourmet',
  'pasta-alfredo': 'Pasta Alfredo con Pollo',
  'pastel-chocolate': 'Pastel de Chocolate',
  'patacones': 'Patacones',
  'pescado-empanizado': 'Filete de Pescado Empanizado',
  'pizza-margherita': 'Pizza Margherita Clásica',
  'pizza-pepperoni': 'Pizza Pepperoni Supreme',
  'poke-atun': 'Poké Bowl de Atún',
  'pollo-rostizado': 'Pollo Rostizado',
  'pollo-teriyaki': 'Pollo Teriyaki',
  'queso-fundido': 'Queso Fundido con Chorizo',
  'ramen-tonkotsu': 'Ramen Tonkotsu',
  'ribeye-parrilla': 'Ribeye a la Parrilla',
  'shawarma-pollo': 'Shawarma de Pollo',
  'smoothie-verde': 'Smoothie Energético Verde',
  'sopes-pollo': 'Sopes de Pollo',
  'tacos-bistec': 'Tacos de Bistec',
  'tacos-pastor': 'Tacos al Pastor',
}

// build name -> webp map (avoid duplicate names overwriting)
const nameToWebp = {}
for (const [slug, name] of Object.entries(MAPPING)) {
  if (nameToWebp[name]) console.warn(`Duplicate recipe name: ${name}`)
  nameToWebp[name] = `/images/recipes/${slug}.webp`
}

let src = fs.readFileSync(file, 'utf8')
let replaced = 0

// Replace image_url in the recipe object whose name precedes it.
// Each recipe block: name: "...", ..., image_url: "..."
const lines = src.split('\n')
const out = []
let currentName = null
for (const line of lines) {
  const nameMatch = line.match(/name:\s*"([^"]+)"/)
  if (nameMatch) {
    currentName = nameMatch[1]
    out.push(line)
    continue
  }
  const imgMatch = line.match(/^(.*image_url:\s*")([^"]+)(".*)$/)
  if (imgMatch && currentName && nameToWebp[currentName]) {
    const newUrl = nameToWebp[currentName]
    out.push(imgMatch[1] + newUrl + imgMatch[3])
    replaced++
    currentName = null // consume mapping
    continue
  }
  out.push(line)
}

fs.writeFileSync(file, out.join('\n'))
console.log(`Replaced ${replaced} image_url references`)
