#!/usr/bin/env node
// Genera la migración SQL que reapunta products.image_url/images a las
// imágenes IA del manifest.json (scripts/product-images/manifest.json).
//
// Uso:
//   node scripts/product-images/build-migration.mjs <numero> <nombre>
//   node scripts/product-images/build-migration.mjs 00204 imagenes_catalogo_ai
//
// Sigue el patrón idempotente de 00194: tabla temp slug → ruta, UPDATE con
// guarda de filas esperadas. Solo incluye slugs cuyo archivo existe en disco.

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const manifest = JSON.parse(
  readFileSync(join(ROOT, "scripts/product-images/manifest.json"), "utf8")
)
const targets = JSON.parse(
  readFileSync(join(ROOT, "scripts/product-images/targets.json"), "utf8")
)
const targetSlugs = new Set(targets.map((t) => t.slug))

const [numero, nombre] = process.argv.slice(2)
if (!/^\d{5}$/.test(numero || "") || !nombre) {
  console.error("Uso: build-migration.mjs <numero-5-digitos> <nombre_snake>")
  process.exit(1)
}

// Slugs ya reapuntados por migraciones anteriores de esta serie (p.ej. 00204):
// no se repiten para que cada migración sea exactamente su delta.
import { readdirSync } from "node:fs"
const alreadyApplied = new Set()
for (const f of readdirSync(join(ROOT, "supabase/migrations"))) {
  if (!/^\d+_.*imagenes.*\.sql$/.test(f) || f.startsWith(numero)) continue
  const sql = readFileSync(join(ROOT, "supabase/migrations", f), "utf8")
  for (const m of sql.matchAll(/^\s+\('([^']+)', '\/images\/products\/ai\//gm)) {
    alreadyApplied.add(m[1])
  }
}

const rows = Object.entries(manifest)
  .filter(([slug, ruta]) => targetSlugs.has(slug) && !alreadyApplied.has(slug) && existsSync(join(ROOT, "public", ruta)))
  .sort(([a], [b]) => a.localeCompare(b))

if (rows.length === 0) {
  console.error("El manifiesto no tiene imágenes en disco para los targets.")
  process.exit(1)
}

const values = rows.map(([slug, ruta]) => `    ('${slug}', '${ruta}')`).join(",\n")

const sql = `-- ============================================================
-- ${numero} — Imágenes de catálogo generadas por IA (Kie.ai GPT-4o Image).
--
-- POR QUE NOMBRES NUEVOS
-- ----------------------
-- \`next.config.ts\` sirve \`/images/**\` con \`Cache-Control: immutable,
-- max-age=31536000\`: reutilizar la ruta vieja dejaría a los navegadores un
-- año con la imagen anterior. Todas viven en \`/images/products/ai/<slug>.webp\`.
--
-- QUE REEMPLAZA
-- -------------
-- Imágenes genéricas mal puestas, fotos de receta que no coinciden con el
-- producto, numeradas de Take.app compartidas entre SKUs distintos y fotos
-- Wikimedia reutilizadas. Incluye el aguacate chunky, cuya foto de 00194
-- contenía AJOS (descarga mal rotulada); su crédito Wikimedia se retiró de
-- src/content/image-credits.ts porque la imagen IA no requiere atribución.
--
-- Se mantienen intactas: fotos reales de resurte.com (Take.app), las demás
-- fotos de AB Foods con atribución y las fotos locales con nombre propio.
--
-- Idempotente: re-ejecutarla deja el mismo estado.
-- ============================================================

DO $$
DECLARE
  v_filas int;
BEGIN
  CREATE TEMP TABLE _img_ai (slug text PRIMARY KEY, image_url text NOT NULL) ON COMMIT DROP;

  INSERT INTO _img_ai (slug, image_url) VALUES
${values}
  ;

  UPDATE products p
  SET image_url  = f.image_url,
      images     = jsonb_build_array(f.image_url),
      updated_at = now()
  FROM _img_ai f
  WHERE p.slug = f.slug;

  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas <> ${rows.length} THEN
    RAISE WARNING '${numero}: se esperaban ${rows.length} productos y se actualizaron %.', v_filas;
  ELSE
    RAISE NOTICE '${numero}: ${rows.length} imágenes de catálogo IA aplicadas.';
  END IF;
END $$;
`

const out = join(ROOT, "supabase/migrations", `${numero}_${nombre}.sql`)
writeFileSync(out, sql)
console.log(`✓ ${out} (${rows.length} productos)`)
