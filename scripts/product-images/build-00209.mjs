#!/usr/bin/env node
// Emite supabase/migrations/00209_carnes_weber_alta.sql desde
// weber-items.mjs + weber-topes.json + manifest.json.
//
// Patrón de 00200/00202, idempotente, en transacción:
//   1. supplier carnes-weber
//   2. products nuevos (sin marca; visible solo si cumple reglas)
//   3. product_suppliers para nuevos Y traslapes; is_primary al menor costo/kg
//   4. competitor_prices con los topes curados
//   5. product_city_availability: nuevos solo Chihuahua (16)
//   6. precio = LEAST(CEIL(costo_kg*kg*1.20), cap_kg*kg); ocultar si cap<costo
//   7. guardas: 0 visibles bajo costo, 0 visibles sobre tope

import fs from "node:fs"
import { WEBER_ITEMS } from "./weber-items.mjs"

const topes = JSON.parse(fs.readFileSync("scripts/product-images/weber-topes.json", "utf8"))
const manifest = JSON.parse(fs.readFileSync("scripts/product-images/manifest.json", "utf8"))

const esc = (s) => s.replace(/'/g, "''")
const num = (n) => Number(n).toFixed(2)

// ── tablas temp ─────────────────────────────────────────────────────────────
const altaRows = WEBER_ITEMS.filter((i) => !i.overlap).map((i) => {
  const img = manifest[i.slug] ? `'${manifest[i.slug]}'` : "NULL"
  const t = topes[i.slug]
  const costoKg = i.cost / i.kg
  const oculto = (t?.cap_kg != null && t.cap_kg < costoKg) || i.hidden ? "true" : "false"
  return `    ('${i.slug}', '${esc(i.name)}', '${esc(i.description)}', ${img}, ${i.category}, '${i.unit}', ${i.kg}, ${num(i.cost)}, ${oculto})`
})

const linkRows = WEBER_ITEMS.map((i) => {
  const target = i.overlap || i.slug
  return `    ('${target}', '${i.slug.toUpperCase().replace(/-/g, "_").slice(0, 24)}', '${esc(i.name)}', ${i.kg}, ${num(i.cost)})`
})

const topeRows = Object.entries(topes)
  .filter(([, t]) => t.cap_kg != null)
  .map(([slug, t]) => {
    const item = WEBER_ITEMS.find((i) => i.slug === slug)
    const target = item.overlap || slug
    return `    ('${target}', ${t.al_id}, '${esc(t.al_name)}', '${esc(t.format || "")}', ${num(t.price)}, ${num(t.regular ?? t.price)}, ${num(t.cap_kg)})`
  })
// Dos renglones de la lista pueden apuntar al mismo producto (p. ej. las dos
// presentaciones de al pastor): nos quedamos con el primero por slug.
  .filter((row, i, arr) => arr.findIndex((r) => r.startsWith(row.slice(0, row.indexOf(",")))) === i)

const sql = `-- ============================================================
-- 00209 — Carnes Weber: alta del proveedor (Chihuahua) y su catálogo.
--
-- QUE HACE
-- --------
-- Da de alta el proveedor \`carnes-weber\` y ${altaRows.length} productos nuevos,
-- más ${WEBER_ITEMS.filter((i) => i.overlap).length} vínculos a productos que YA existen (AB
-- Foods / tienda): en esos NO se duplica el producto, solo se agrega Weber
-- como proveedor alterno y compite por \`is_primary\` (menor costo/kg = más
-- margen). En la tienda NO aparece la marca: el nombre y la descripción no
-- dicen "Weber"; el proveedor solo se ve en el panel admin.
--
-- CIUDAD
-- ------
-- Los productos nuevos nacen con \`product_city_availability\`:
-- is_available = true SOLO en Chihuahua (city_id 16) y false en el resto,
-- así no se publican fuera de su plaza (semántica de 00065). Los traslapes
-- conservan sus filas actuales; solo se agrega la de Chihuahua si falta.
--
-- PRECIOS
-- -------
-- Mismas reglas de 00202 (docs/precios-reglas.md):
--   A) precio >= costo        B) precio <= competencia (Alsuper branch 6)
--   precio = LEAST(CEIL(costo_kg*kg*1.20), cap_kg*kg); cap<costo -> OCULTAR.
-- Costo = mejor volumen de la lista (tarima/+100kg/+3 cajas), list_date
-- 2026-10-01. Margen Weber: 1.20 (como FRUGASA; AB Foods sigue en 1.18).
--
-- SE QUEDAN FUERA A PROPÓSITO
--   * "Ruedo tripas" (renglón ilegible: solo 2 columnas de precio).
--   * Los que chocan A vs B entran OCULTOS (se activan desde /admin/productos
--     cuando cambie el costo o el precio del rival).
--
-- Idempotente: NOT EXISTS / ON CONFLICT en todo; re-ejecutar no cambia nada.
-- ============================================================

BEGIN;

INSERT INTO public.suppliers (name, slug, status, city, state, notes)
VALUES (
  'Carnes Weber', 'carnes-weber', 'activo', 'Chihuahua', 'Chihuahua',
  'Lista de precios mayoreo vigente al 01-oct-2026 (carnesweber.com). '
  || 'Carnes de res, cerdo, pollo, pescado y camarón. Costos por kilo al '
  || 'mejor volumen (tarima/+100kg/+3 cajas). La marca no se muestra en tienda.'
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      status = EXCLUDED.status,
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      notes = EXCLUDED.notes,
      updated_at = now();

DO $$
DECLARE
  v_supplier bigint;
  v_altas int;
  v_links int;
  v_topes int;
  v_ciudades int;
  v_ocultos int;
  v_precios int;
  v_bajo_costo int;
  v_mas_caros int;
BEGIN
  SELECT id INTO v_supplier FROM public.suppliers WHERE slug = 'carnes-weber';
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION '00209: no se pudo dar de alta el proveedor carnes-weber';
  END IF;

  -- ── Productos NUEVOS (no traslapes) ──────────────────────────────────
  CREATE TEMP TABLE _weber_alta (
    slug        text PRIMARY KEY,
    name        text NOT NULL,
    description text NOT NULL,
    image_url   text,
    category_id bigint NOT NULL,
    unit        text NOT NULL,
    kg          numeric(12,4) NOT NULL,
    cost        numeric(12,2) NOT NULL,
    hidden      boolean NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _weber_alta
    (slug, name, description, image_url, category_id, unit, kg, cost, hidden)
  VALUES
${altaRows.join(",\n")};

  INSERT INTO public.products (
    name, slug, description, image_url, images, brand, category_id,
    price, sale_price, stock_status, is_visible, show_in_whatsapp,
    unit, tags
  )
  SELECT
    a.name, a.slug, a.description, a.image_url,
    CASE WHEN a.image_url IS NULL THEN NULL ELSE jsonb_build_array(a.image_url) END,
    'Local', a.category_id,
    -- Precio provisional = costo*margen; abajo se recalcula con el tope.
    CEIL(a.cost * 1.20), NULL, 'in_stock', NOT a.hidden, false,
    a.unit, '[]'::jsonb
  FROM _weber_alta a
  WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.slug = a.slug);

  GET DIAGNOSTICS v_altas = ROW_COUNT;

  -- ── Vínculos proveedor (nuevos + traslapes) ──────────────────────────
  CREATE TEMP TABLE _weber_link (
    slug         text NOT NULL,
    supplier_sku text NOT NULL,
    item_name    text NOT NULL,
    kg           numeric(12,4) NOT NULL,
    cost         numeric(12,2) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _weber_link (slug, supplier_sku, item_name, kg, cost) VALUES
${linkRows.join(",\n")};

  INSERT INTO public.product_suppliers
    (product_id, supplier_id, supplier_sku, presentation, cost, list_date, is_primary, notes)
  SELECT p.id, v_supplier, l.supplier_sku, l.item_name, l.cost,
         DATE '2026-10-01', false,
         'Lista Carnes Weber 01-oct-2026. Costo a mejor volumen; la marca no se muestra en tienda.'
  FROM _weber_link l
  JOIN public.products p ON p.slug = l.slug
  ON CONFLICT (product_id, supplier_id, supplier_sku) DO UPDATE
    SET cost = EXCLUDED.cost,
        presentation = EXCLUDED.presentation,
        list_date = EXCLUDED.list_date,
        notes = EXCLUDED.notes;

  GET DIAGNOSTICS v_links = ROW_COUNT;

  -- is_primary: gana el proveedor de MENOR costo/kg por producto (más margen).
  -- El kg por slug replica el criterio de 00202 (tabla _unidad_kg): caja o
  -- presentación cerrada en kg; por kilo = 1.
  CREATE TEMP TABLE _slug_kg (slug text PRIMARY KEY, kg numeric(12,4) NOT NULL) ON COMMIT DROP;
  INSERT INTO _slug_kg (slug, kg)
  SELECT DISTINCT slug, kg FROM _weber_link
  UNION ALL
  VALUES
    ('aguacate-chunky-caja-7264kg', 7.2640),
    ('aros-cebolla-bolsa-907g', 0.9070),
    ('dedos-queso-bolsa-181kg', 1.8100),
    ('hamburguesa-bm-arrachera-caja-30pzs', 4.5000),
    ('hamburguesa-bm-mezquite-caja-30pzs', 4.5000),
    ('hamburguesa-bm-sirloin-caja-30pzs', 4.5000),
    ('papa-conquest-delivery-teja-65-caja-1361kg', 13.6100),
    ('papa-curly-savory-caja-1361kg', 13.6100),
    ('papa-dulce-recta-38-caja-680kg', 6.8000),
    ('papa-gajo-10-cut-65-caja-1361kg', 13.6100),
    ('papa-hash-brown-patty-caja-952kg', 9.5200),
    ('papa-ondulada-38-payette-caja-1361kg', 13.6100),
    ('papa-rallada-hash-brown-caja-816kg', 8.1600),
    ('papa-rejilla-savory-caja-1224kg', 12.2400)
  ON CONFLICT (slug) DO NOTHING;

  WITH costos AS (
    SELECT ps.product_id, ps.id,
           ps.cost / COALESCE(k.kg, 1) AS costo_kg,
           ROW_NUMBER() OVER (
             PARTITION BY ps.product_id
             ORDER BY ps.cost / COALESCE(k.kg, 1) ASC, ps.id ASC
           ) AS rnk
    FROM public.product_suppliers ps
    JOIN public.products p ON p.id = ps.product_id
    LEFT JOIN _slug_kg k ON k.slug = p.slug
    WHERE ps.product_id IN (SELECT product_id FROM public.product_suppliers WHERE supplier_id = v_supplier)
  )
  UPDATE public.product_suppliers ps
  SET is_primary = (c.rnk = 1)
  FROM costos c
  WHERE ps.id = c.id
    AND ps.is_primary IS DISTINCT FROM (c.rnk = 1);

  -- ── Topes Alsuper (solo donde hay comparable por kilo) ───────────────
  CREATE TEMP TABLE _weber_tope (
    slug       text PRIMARY KEY,
    al_id      bigint NOT NULL,
    al_name    text NOT NULL,
    al_format  text NOT NULL,
    al_price   numeric(12,2) NOT NULL,
    al_regular numeric(12,2) NOT NULL,
    cap_kg     numeric(12,2) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _weber_tope
    (slug, al_id, al_name, al_format, al_price, al_regular, cap_kg)
  VALUES
${topeRows.join(",\n")};

  INSERT INTO public.competitor_prices
    (product_id, supplier_slug, branch_id, external_id, external_name,
     format, price, regular_price, unit_price, captured_at)
  SELECT p.id, 'alsuper', 6, t.al_id, t.al_name, t.al_format,
         t.al_price, t.al_regular, t.cap_kg, TIMESTAMPTZ '2026-10-01'
  FROM _weber_tope t
  JOIN public.products p ON p.slug = t.slug
  ON CONFLICT (product_id, supplier_slug, branch_id, external_id) DO UPDATE
    SET external_name = EXCLUDED.external_name,
        format = EXCLUDED.format,
        price = EXCLUDED.price,
        regular_price = EXCLUDED.regular_price,
        unit_price = EXCLUDED.unit_price,
        captured_at = EXCLUDED.captured_at;

  GET DIAGNOSTICS v_topes = ROW_COUNT;

  -- ── Disponibilidad: productos NUEVOS solo en Chihuahua (16) ─────────
  INSERT INTO public.product_city_availability (product_id, city_id, is_available)
  SELECT p.id, c.id, (c.id = 16)
  FROM public.products p
  CROSS JOIN public.cities c
  WHERE p.slug IN (SELECT slug FROM _weber_alta)
    AND c.is_active
  ON CONFLICT (product_id, city_id) DO UPDATE
    SET is_available = EXCLUDED.is_available;

  GET DIAGNOSTICS v_ciudades = ROW_COUNT;

  -- ── Recálculo de precio (00202) para todo lo tocado por Weber ────────
  CREATE TEMP TABLE _calc ON COMMIT DROP AS
  SELECT p.id,
         p.slug,
         ps.cost AS costo_lista,
         COALESCE(k.kg, 1) AS kg,
         ps.cost / COALESCE(k.kg, 1) AS costo_kg,
         t.cap_kg
  FROM public.products p
  JOIN public.product_suppliers ps
    ON ps.product_id = p.id AND ps.supplier_id = v_supplier AND ps.is_primary
  LEFT JOIN _slug_kg k ON k.slug = p.slug
  LEFT JOIN _weber_tope t ON t.slug = p.slug;

  -- REGLA A vs B: el rival lo vende más barato de lo que nos cuesta -> ocultar.
  UPDATE public.products p
  SET is_visible = false,
      updated_at = now()
  FROM _calc c
  WHERE p.id = c.id
    AND c.cap_kg IS NOT NULL
    AND c.cap_kg < c.costo_kg
    AND p.is_visible = true;

  GET DIAGNOSTICS v_ocultos = ROW_COUNT;

  -- Precio: margen 1.20 sobre costo Weber, topado por la competencia.
  -- Solo toca productos donde Weber quedó como is_primary; si otro
  -- proveedor (AB Foods) tiene menor costo/kg, ese producto conserva el
  -- precio que ya calculó 00202 con su propio margen.
  UPDATE public.products p
  SET price = LEAST(
        CEIL(c.costo_kg * c.kg * 1.20),
        COALESCE(c.cap_kg * c.kg, CEIL(c.costo_kg * c.kg * 1.20))
      ),
      sale_price = NULL,
      updated_at = now()
  FROM _calc c
  WHERE p.id = c.id
    AND NOT (c.cap_kg IS NOT NULL AND c.cap_kg < c.costo_kg)
    AND p.is_visible = true
    AND EXISTS (
      SELECT 1 FROM public.product_suppliers ps
      WHERE ps.product_id = p.id AND ps.supplier_id = v_supplier AND ps.is_primary
    );

  GET DIAGNOSTICS v_precios = ROW_COUNT;

  -- Disponibilidad en Chihuahua para traslapes VISIBLES que quedaron con
  -- Weber como proveedor primario (p. ej. carne al pastor): se agrega la
  -- fila de Chihuahua si falta; fuera de Chihuahua no se toca nada.
  INSERT INTO public.product_city_availability (product_id, city_id, is_available)
  SELECT p.id, 16, true
  FROM public.products p
  WHERE p.is_visible
    AND EXISTS (
      SELECT 1 FROM public.product_suppliers ps
      WHERE ps.product_id = p.id AND ps.supplier_id = v_supplier AND ps.is_primary
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.product_city_availability pca
      WHERE pca.product_id = p.id AND pca.city_id = 16
    )
  ON CONFLICT (product_id, city_id) DO NOTHING;

  -- ── Guardas en positivo ──────────────────────────────────────────────
  SELECT count(*) INTO v_bajo_costo
  FROM public.products p
  JOIN _calc c ON c.id = p.id
  WHERE p.is_visible
    AND p.price < c.costo_kg * c.kg;

  SELECT count(*) INTO v_mas_caros
  FROM public.products p
  JOIN _calc c ON c.id = p.id
  WHERE p.is_visible
    AND c.cap_kg IS NOT NULL
    AND p.price > c.cap_kg * c.kg;

  IF v_bajo_costo > 0 OR v_mas_caros > 0 THEN
    RAISE EXCEPTION '00209: guarda rota (% visibles bajo costo, % sobre tope)',
      v_bajo_costo, v_mas_caros;
  END IF;

  RAISE NOTICE '00209: % productos nuevos, % vínculos, % topes, % filas ciudad, % ocultos por regla, % precios calculados. Guardas OK.',
    v_altas, v_links, v_topes, v_ciudades, v_ocultos, v_precios;
END $$;

COMMIT;
`

fs.writeFileSync("supabase/migrations/00209_carnes_weber_alta.sql", sql)
console.log("✓ 00209:", altaRows.length, "nuevos,", linkRows.length, "vínculos,", topeRows.length, "topes")
