#!/usr/bin/env npx tsx
/**
 * Compara imágenes huérfanas candidatas vs imágenes reales en products.
 * Uso: npx tsx scripts/compare-orphan-images.ts <productos_imgs.txt>
 * Output: lista de imágenes verdaderamente huérfanas (para borrado seguro)
 */

import { readFileSync, writeFileSync } from "fs"
import { resolve, basename } from "path"

const CANDIDATES_FILE = resolve("/Users/mac/.copilot/session-state/1b92be98-5d74-4785-ac32-149e0d6c6e9c/files/imagenes_huerfanas_candidatas.txt")
const OUTPUT_FILE = resolve("scripts/orphan-images-to-delete.txt")
const BACKUP_DIR = resolve("public/.trash")

function normalizeUrl(url: string): string {
  // Extraer solo el nombre de archivo de URLs como /images/foo.jpg o https://.../foo.jpg
  return basename(url.trim()).toLowerCase()
}

function main() {
  const productosFile = process.argv[2]
  if (!productosFile) {
    console.error("Uso: npx tsx scripts/compare-orphan-images.ts <productos_imgs.txt>")
    process.exit(1)
  }

  // Leer candidatos (734 líneas)
  const candidatesRaw = readFileSync(CANDIDATES_FILE, "utf-8")
  const candidateFiles = candidatesRaw
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .map(normalizeUrl)

  // Leer imágenes reales en products
  const productosRaw = readFileSync(resolve(productosFile), "utf-8")
  const productImages = productosRaw
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .map(normalizeUrl)

  const productSet = new Set(productImages)

  // Verdaderamente huérfanas = candidatas NO en products
  const trulyOrphan = candidateFiles.filter(f => !productSet.has(f))

  console.log(`Candidatas totales: ${candidateFiles.length}`)
  console.log(`Imágenes en products: ${productImages.length}`)
  console.log(`Únicas en products: ${productSet.size}`)
  console.log(`Verdaderamente huérfanas: ${trulyOrphan.length}`)

  // Guardar lista para borrado
  writeFileSync(OUTPUT_FILE, trulyOrphan.join("\n") + "\n")
  console.log(`\nLista guardada en: ${OUTPUT_FILE}`)
  console.log(`Para borrado seguro con backup:`)
  console.log(`  mkdir -p ${BACKUP_DIR}`)
  console.log(`  while read f; do mv "public/$f" "${BACKUP_DIR}/"; done < ${OUTPUT_FILE}`)
}

main()