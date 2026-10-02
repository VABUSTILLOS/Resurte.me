#!/usr/bin/env node
// Emite supabase/migrations/00211_distmar_alta.sql desde distmar-items.mjs +
// distmar-topes.json + manifest.json. Mismo patrón que 00209 (Weber).

import fs from "node:fs"
import { DISTMAR_ITEMS } from "./distmar-items.mjs"

const topes = JSON.parse(fs.readFileSync("scripts/product-images/distmar-topes.json", "utf8"))
const manifest = JSON.parse(fs.readFileSync("scripts/product-images/manifest.json", "utf8"))

const esc = (s) => s.replace(/'/g, "''")
const num = (n) => Number(n).toFixed(2)

const nuevos = DISTMAR_ITEMS.filter((i) => !i.overlap)
const altaRows = nuevos.map((i) => {
  const img = manifest[i.slug] ? `'${manifest[i.slug]}'` : "NULL"
  const t = topes[i.slug]
  const oculto = (t?.cap_kg != null && t.cap_kg < i.cost / i.kg) || i.hidden ? "true" : "false"
  return `    ('${i.slug}', '${esc(i.name)}', '${esc(i.description)}', ${img}, ${i.category}, '${i.unit}', ${i.kg}, ${num(i.cost)}, ${oculto})`
})

const linkRows = DISTMAR_ITEMS.map((i) => {
  const target = i.overlap || i.slug
  return `    ('${target}', '${("DIST_" + i.slug).toUpperCase().replace(/-/g, "_").slice(0, 28)}', '${esc(i.name)}', ${i.kg}, ${num(i.cost)})`
})

const topeRows = Object.entries(topes)
  .filter(([, t]) => t.cap_kg != null)
  .map(([slug, t]) => {
    const item = DISTMAR_ITEMS.find((i) => i.slug === slug)
    const target = item.overlap || slug
    return `    ('${target}', ${t.al_id}, '${esc(t.al_name)}', '${esc(t.format || "")}', ${num(t.price)}, ${num(t.regular ?? t.price)}, ${num(t.cap_kg)})`
  })
  .filter((row, i, arr) => arr.findIndex((r) => r.startsWith(row.slice(0, row.indexOf(",")))) === i)

// kg por slug para comparar costo/kg entre proveedores (traslapes Distmar
// contra Weber/AB Foods). Une los kg de los renglones Distmar con los kg de
// las presentaciones que ya existían (00202/00209).
const kgRows = [
  ...new Map(DISTMAR_ITEMS.map((i) => [i.overlap || i.slug, i.kg])).entries(),
].map(([slug, kg]) => `    ('${slug}', ${kg})`)

const sql = `-- ============================================================
-- 00211 — Distmar: alta del proveedor (Chihuahua) y su catálogo.
--
-- QUE HACE
-- --------
-- Da de alta el proveedor \`distmar\`, ${nuevos.length} productos nuevos (marisco:
-- tallas de camarón que la tienda no tenía, guitarra, mojarra, pulpos,
-- calamar, medallón de atún, salmón y atún saku) y ${DISTMAR_ITEMS.length - nuevos.length}
-- vínculos a productos que YA existen (camarón 41/50 y 16/20, tilapia 3-5,
-- papas y dedos de queso): en esos NO se duplica, Distmar compite por
-- \`is_primary\` (menor costo/kg = mejor precio). La marca no aparece en
-- tienda; el proveedor solo se ve en el panel admin.
--
-- LECTURA DE LA LISTA
-- -------------------
-- Marisco: "precio venta" es POR KILO (cajas/bultos de 4.54–20 kg).
-- Papas y complementos: "precio venta" es POR CAJA (6 pzs × 2.27 kg =
-- 13.62 kg; rejilla 4.5 lb = 12.25 kg; camote 2.5 lb = 6.80 kg; aros Brew
-- City 12 pzs × 2 lb = 10.89 kg; dedos de queso 6 × 1.814 kg = 10.88 kg).
-- El costo se guarda por presentación de venta y el kg en _slug_kg, como
-- 00202/00209.
--
-- PRECIOS
-- -------
-- Reglas de 00202: A) precio >= costo, B) precio <= Alsuper (branch 6).
-- precio = LEAST(CEIL(costo_kg*kg*1.20), cap_kg*kg); cap<costo -> OCULTAR.
-- Margen Distmar: 1.20. list_date 2026-10-02.
--
-- CIUDAD: productos nuevos solo Chihuahua (16), semántica de 00065.
--
-- Idempotente: NOT EXISTS / ON CONFLICT en todo.
-- ============================================================

BEGIN;

INSERT INTO public.suppliers (name, slug, status, city, state, notes)
VALUES (
  'Distmar', 'distmar', 'activo', 'Chihuahua', 'Chihuahua',
  'Lista de precios vigente oct-2026. Marisco por kilo (camarón en tallas, '
  || 'pescados, pulpo, calamar, atún, salmón) y papas/complementos por caja. '
  || 'La marca no se muestra en tienda.'
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
  SELECT id INTO v_supplier FROM public.suppliers WHERE slug = 'distmar';
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION '00211: no se pudo dar de alta el proveedor distmar';
  END IF;

  -- ── Productos NUEVOS ────────────────────────────────────────────────
  CREATE TEMP TABLE _dist_alta (
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

  INSERT INTO _dist_alta
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
    CEIL(a.cost * 1.20), NULL, 'in_stock', NOT a.hidden, false,
    a.unit, '[]'::jsonb
  FROM _dist_alta a
  WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.slug = a.slug);

  GET DIAGNOSTICS v_altas = ROW_COUNT;

  -- ── Vínculos proveedor (nuevos + traslapes) ──────────────────────────
  CREATE TEMP TABLE _dist_link (
    slug         text NOT NULL,
    supplier_sku text NOT NULL,
    item_name    text NOT NULL,
    kg           numeric(12,4) NOT NULL,
    cost         numeric(12,2) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _dist_link (slug, supplier_sku, item_name, kg, cost) VALUES
${linkRows.join(",\n")};

  INSERT INTO public.product_suppliers
    (product_id, supplier_id, supplier_sku, presentation, cost, list_date, is_primary, notes)
  SELECT p.id, v_supplier, l.supplier_sku, l.item_name, l.cost,
         DATE '2026-10-02', false,
         'Lista Distmar oct-2026. La marca no se muestra en tienda.'
  FROM _dist_link l
  JOIN public.products p ON p.slug = l.slug
  ON CONFLICT (product_id, supplier_id, supplier_sku) DO UPDATE
    SET cost = EXCLUDED.cost,
        presentation = EXCLUDED.presentation,
        list_date = EXCLUDED.list_date,
        notes = EXCLUDED.notes;

  GET DIAGNOSTICS v_links = ROW_COUNT;

  -- kg por slug (presentación de venta) para comparar costo/kg.
  CREATE TEMP TABLE _slug_kg (slug text PRIMARY KEY, kg numeric(12,4) NOT NULL) ON COMMIT DROP;
  INSERT INTO _slug_kg (slug, kg) VALUES
${kgRows.join(",\n")},
    ('filete-tilapia-35', 1.0000),
    ('camaron-4150', 1.0000),
    ('camaron-1620-gigante', 1.0000),
    ('aros-cebolla-bolsa-907g', 0.9070),
    ('dedos-queso-bolsa-181kg', 1.8100),
    ('papa-conquest-14-caja-1633kg', 16.3300),
    ('papa-conquest-delivery-38-sc-caja-1361kg', 13.6100),
    ('papa-dulce-recta-38-caja-680kg', 6.8000),
    ('papa-gajo-10-cut-65-caja-1361kg', 13.6100),
    ('papa-ondulada-38-payette-caja-1361kg', 13.6100),
    ('papa-rejilla-savory-caja-1224kg', 12.2400),
    ('papa-select-38-sc-caja-1361kg', 13.6100),
    ('papa-select-516-sc-caja-1361kg', 13.6100)
  ON CONFLICT (slug) DO NOTHING;

  -- is_primary: menor costo/kg gana, entre TODOS los proveedores del
  -- producto (Distmar vs Weber vs AB Foods).
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

  -- ── Topes Alsuper (curados: solo comparables confiables por kilo) ────
  CREATE TEMP TABLE _dist_tope (
    slug       text PRIMARY KEY,
    al_id      bigint NOT NULL,
    al_name    text NOT NULL,
    al_format  text NOT NULL,
    al_price   numeric(12,2) NOT NULL,
    al_regular numeric(12,2) NOT NULL,
    cap_kg     numeric(12,2) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _dist_tope
    (slug, al_id, al_name, al_format, al_price, al_regular, cap_kg)
  VALUES
${topeRows.join(",\n")};

  INSERT INTO public.competitor_prices
    (product_id, supplier_slug, branch_id, external_id, external_name,
     format, price, regular_price, unit_price, captured_at)
  SELECT p.id, 'alsuper', 6, t.al_id, t.al_name, t.al_format,
         t.al_price, t.al_regular, t.cap_kg, TIMESTAMPTZ '2026-10-02'
  FROM _dist_tope t
  JOIN public.products p ON p.slug = t.slug
  ON CONFLICT (product_id, supplier_slug, branch_id, external_id) DO UPDATE
    SET external_name = EXCLUDED.external_name,
        format = EXCLUDED.format,
        price = EXCLUDED.price,
        regular_price = EXCLUDED.regular_price,
        unit_price = EXCLUDED.unit_price,
        captured_at = EXCLUDED.captured_at;

  GET DIAGNOSTICS v_topes = ROW_COUNT;

  -- ── Disponibilidad: nuevos solo en Chihuahua (16) ────────────────────
  INSERT INTO public.product_city_availability (product_id, city_id, is_available)
  SELECT p.id, c.id, (c.id = 16)
  FROM public.products p
  CROSS JOIN public.cities c
  WHERE p.slug IN (SELECT slug FROM _dist_alta)
    AND c.is_active
  ON CONFLICT (product_id, city_id) DO UPDATE
    SET is_available = EXCLUDED.is_available;

  GET DIAGNOSTICS v_ciudades = ROW_COUNT;

  -- Traslapes VISIBLES donde Distmar quedó primario: fila de Chihuahua si
  -- falta (fuera de Chihuahua no se toca nada).
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

  -- ── Recálculo de precio (00202) donde Distmar quedó primario ─────────
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
  LEFT JOIN _dist_tope t ON t.slug = p.slug;

  UPDATE public.products p
  SET is_visible = false,
      updated_at = now()
  FROM _calc c
  WHERE p.id = c.id
    AND c.cap_kg IS NOT NULL
    AND c.cap_kg < c.costo_kg
    AND p.is_visible = true;

  GET DIAGNOSTICS v_ocultos = ROW_COUNT;

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
    AND p.is_visible = true;

  GET DIAGNOSTICS v_precios = ROW_COUNT;

  -- ── Guardas ──────────────────────────────────────────────────────────
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
    RAISE EXCEPTION '00211: guarda rota (% visibles bajo costo, % sobre tope)',
      v_bajo_costo, v_mas_caros;
  END IF;

  RAISE NOTICE '00211: % productos nuevos, % vínculos, % topes, % filas ciudad, % ocultos, % precios. Guardas OK.',
    v_altas, v_links, v_topes, v_ciudades, v_ocultos, v_precios;
END $$;

COMMIT;
`

fs.writeFileSync("supabase/migrations/00211_distmar_alta.sql", sql)
console.log("✓ 00211:", nuevos.length, "nuevos,", linkRows.length, "vínculos,", topeRows.length, "topes")
