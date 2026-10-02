-- ============================================================
-- 00211 — Distmar: alta del proveedor (Chihuahua) y su catálogo.
--
-- QUE HACE
-- --------
-- Da de alta el proveedor `distmar`, 18 productos nuevos (marisco:
-- tallas de camarón que la tienda no tenía, guitarra, mojarra, pulpos,
-- calamar, medallón de atún, salmón y atún saku) y 13
-- vínculos a productos que YA existen (camarón 41/50 y 16/20, tilapia 3-5,
-- papas y dedos de queso): en esos NO se duplica, Distmar compite por
-- `is_primary` (menor costo/kg = mejor precio). La marca no aparece en
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
    ('camaron-cabeza-2030', 'Camarón con cabeza 20/30', 'Camarón con cabeza talla 20/30, caja de 20 kg. Precio por kilo.', '/images/products/ai/camaron-cabeza-2030.webp', 4, 'kilo', 1, 180.00, false),
    ('camaron-2125', 'Camarón 21/25', 'Camarón crudo talla 21/25, caja de 20 kg. Precio por kilo.', '/images/products/ai/camaron-2125.webp', 4, 'kilo', 1, 174.00, false),
    ('camaron-2630', 'Camarón 26/30', 'Camarón crudo talla 26/30, caja de 20 kg. Precio por kilo.', '/images/products/ai/camaron-2630.webp', 4, 'kilo', 1, 155.00, false),
    ('camaron-3135', 'Camarón 31/35', 'Camarón crudo talla 31/35, caja de 20 kg. Precio por kilo.', '/images/products/ai/camaron-3135.webp', 4, 'kilo', 1, 145.00, false),
    ('camaron-3640', 'Camarón 36/40', 'Camarón crudo talla 36/40, caja de 20 kg. Precio por kilo.', '/images/products/ai/camaron-3640.webp', 4, 'kilo', 1, 142.00, false),
    ('camaron-5160', 'Camarón 51/60', 'Camarón crudo talla 51/60, caja de 20 kg. Precio por kilo.', '/images/products/ai/camaron-5160.webp', 4, 'kilo', 1, 124.00, false),
    ('camaron-6170', 'Camarón 61/70', 'Camarón crudo talla 61/70, caja de 20 kg. Precio por kilo.', '/images/products/ai/camaron-6170.webp', 4, 'kilo', 1, 115.00, false),
    ('camaron-7190', 'Camarón 71/90', 'Camarón crudo talla 71/90, caja de 20 kg. Precio por kilo.', '/images/products/ai/camaron-7190.webp', 4, 'kilo', 1, 107.00, false),
    ('filete-guitarra', 'Filete de guitarra', 'Filete de pescado guitarra, bulto de 20 kg. Precio por kilo.', '/images/products/ai/filete-guitarra.webp', 4, 'kilo', 1, 70.00, false),
    ('filete-tilapia-comercial-50', 'Filete de tilapia comercial 50%', 'Filete de tilapia comercial 50% glaseo, caja de 4.54 kg. Precio por kilo.', '/images/products/ai/filete-tilapia-comercial-50.webp', 4, 'kilo', 1, 44.99, false),
    ('mojarra-importada', 'Pescado mojarra importada', 'Mojarra importada entera, caja de 10 kg. Precio por kilo.', '/images/products/ai/mojarra-importada.webp', 4, 'kilo', 1, 60.00, false),
    ('pulpo-12', 'Pulpo 1-2', 'Pulpo talla 1-2, caja de 20 kg. Precio por kilo.', '/images/products/ai/pulpo-12.webp', 4, 'kilo', 1, 180.00, false),
    ('pulpo-24', 'Pulpo 2-4', 'Pulpo talla 2-4, caja de 20 kg. Precio por kilo.', '/images/products/ai/pulpo-24.webp', 4, 'kilo', 1, 200.00, false),
    ('pulpo-cocido-picado-500g', 'Pulpo cocido picado (500 g)', 'Pulpo cocido y picado, pieza de 500 g. Listo para coctel o tostadas.', '/images/products/ai/pulpo-cocido-picado-500g.webp', 4, 'pieza', 0.5, 214.99, false),
    ('calamar-lonja-filete', 'Calamar lonja o filete', 'Calamar en lonja o filete, bulto de 20 kg. Precio por kilo.', '/images/products/ai/calamar-lonja-filete.webp', 4, 'kilo', 1, 79.99, false),
    ('medallon-atun-mexicano', 'Medallón de atún mexicano rebanado', 'Medallón de atún mexicano rebanado, caja de 15 kg. Precio por kilo.', '/images/products/ai/medallon-atun-mexicano.webp', 4, 'kilo', 1, 165.00, false),
    ('filete-salmon-premium', 'Filete de salmón premium', 'Filete de salmón premium, caja de 10 kg. Precio por kilo.', '/images/products/ai/filete-salmon-premium.webp', 4, 'kilo', 1, 289.99, false),
    ('atun-saku', 'Atún saku', 'Atún saku en bloque (grado sashimi), caja de 4.54 kg. Precio por kilo.', '/images/products/ai/atun-saku.webp', 4, 'kilo', 1, 199.99, false);

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
    ('camaron-cabeza-2030', 'DIST_CAMARON_CABEZA_2030', 'Camarón con cabeza 20/30', 1, 180.00),
    ('camaron-1620-gigante', 'DIST_CAMARON_1620', 'Camarón 16/20', 1, 194.00),
    ('camaron-2125', 'DIST_CAMARON_2125', 'Camarón 21/25', 1, 174.00),
    ('camaron-2630', 'DIST_CAMARON_2630', 'Camarón 26/30', 1, 155.00),
    ('camaron-3135', 'DIST_CAMARON_3135', 'Camarón 31/35', 1, 145.00),
    ('camaron-3640', 'DIST_CAMARON_3640', 'Camarón 36/40', 1, 142.00),
    ('camaron-4150', 'DIST_CAMARON_4150_DISTMAR', 'Camarón 41/50 (Distmar)', 1, 130.00),
    ('camaron-5160', 'DIST_CAMARON_5160', 'Camarón 51/60', 1, 124.00),
    ('camaron-6170', 'DIST_CAMARON_6170', 'Camarón 61/70', 1, 115.00),
    ('camaron-7190', 'DIST_CAMARON_7190', 'Camarón 71/90', 1, 107.00),
    ('filete-tilapia-35', 'DIST_FILETE_TILAPIA_100_DIST', 'Filete tilapia 3-5 100%', 1, 80.00),
    ('filete-guitarra', 'DIST_FILETE_GUITARRA', 'Filete de guitarra', 1, 70.00),
    ('filete-tilapia-comercial-50', 'DIST_FILETE_TILAPIA_COMERCIA', 'Filete de tilapia comercial 50%', 1, 44.99),
    ('mojarra-importada', 'DIST_MOJARRA_IMPORTADA', 'Pescado mojarra importada', 1, 60.00),
    ('pulpo-12', 'DIST_PULPO_12', 'Pulpo 1-2', 1, 180.00),
    ('pulpo-24', 'DIST_PULPO_24', 'Pulpo 2-4', 1, 200.00),
    ('pulpo-cocido-picado-500g', 'DIST_PULPO_COCIDO_PICADO_500', 'Pulpo cocido picado (500 g)', 0.5, 214.99),
    ('calamar-lonja-filete', 'DIST_CALAMAR_LONJA_FILETE', 'Calamar lonja o filete', 1, 79.99),
    ('medallon-atun-mexicano', 'DIST_MEDALLON_ATUN_MEXICANO', 'Medallón de atún mexicano rebanado', 1, 165.00),
    ('filete-salmon-premium', 'DIST_FILETE_SALMON_PREMIUM', 'Filete de salmón premium', 1, 289.99),
    ('atun-saku', 'DIST_ATUN_SAKU', 'Atún saku', 1, 199.99),
    ('papa-gajo-10-cut-65-caja-1361kg', 'DIST_PAPA_GAJO_SAZONADA_CAJA', 'Papa gajo sazonada (caja 13.62 kg)', 13.62, 739.99),
    ('papa-ondulada-38-payette-caja-1361kg', 'DIST_PAPA_ONDULADA_CAJA_1362', 'Papa ondulada (caja 13.62 kg)', 13.62, 509.99),
    ('papa-select-516-sc-caja-1361kg', 'DIST_PAPA_RECTA_516_CAJA_136', 'Papa recta 5/16 (caja 13.62 kg)', 13.62, 617.99),
    ('papa-rejilla-savory-caja-1224kg', 'DIST_PAPA_REJILLA_45LB_CAJA', 'Papa rejilla 4.5 lb (caja)', 12.25, 679.99),
    ('papa-conquest-14-caja-1633kg', 'DIST_PAPA_RECTA_14_SURECRISP', 'Papa recta 1/4 SureCrisp (caja 13.62 kg)', 13.62, 635.94),
    ('papa-select-38-sc-caja-1361kg', 'DIST_PAPA_RECTA_38_CAJA_1362', 'Papa recta 3/8 (caja 13.62 kg)', 13.62, 509.99),
    ('papa-conquest-delivery-38-sc-caja-1361kg', 'DIST_PAPA_RECTA_38_MAX_SUCRI', 'Papa recta 3/8 MAX SureCrisp (caja 13.62 kg)', 13.62, 575.99),
    ('aros-cebolla-bolsa-907g', 'DIST_AROS_CEBOLLA_BREW_CITY_', 'Aros de cebolla Brew City (caja 12 pzs)', 10.89, 1043.98),
    ('dedos-queso-bolsa-181kg', 'DIST_DEDOS_QUESO_CAJA_1088KG', 'Dedos de queso (caja 6 pzs)', 10.88, 1499.94),
    ('papa-dulce-recta-38-caja-680kg', 'DIST_PAPA_CAMOTE_CAJA_68KG', 'Papa camote (caja 6.8 kg)', 6.8, 479.99);

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
    ('camaron-cabeza-2030', 1),
    ('camaron-1620-gigante', 1),
    ('camaron-2125', 1),
    ('camaron-2630', 1),
    ('camaron-3135', 1),
    ('camaron-3640', 1),
    ('camaron-4150', 1),
    ('camaron-5160', 1),
    ('camaron-6170', 1),
    ('camaron-7190', 1),
    ('filete-tilapia-35', 1),
    ('filete-guitarra', 1),
    ('filete-tilapia-comercial-50', 1),
    ('mojarra-importada', 1),
    ('pulpo-12', 1),
    ('pulpo-24', 1),
    ('pulpo-cocido-picado-500g', 0.5),
    ('calamar-lonja-filete', 1),
    ('medallon-atun-mexicano', 1),
    ('filete-salmon-premium', 1),
    ('atun-saku', 1),
    ('papa-gajo-10-cut-65-caja-1361kg', 13.62),
    ('papa-ondulada-38-payette-caja-1361kg', 13.62),
    ('papa-select-516-sc-caja-1361kg', 13.62),
    ('papa-rejilla-savory-caja-1224kg', 12.25),
    ('papa-conquest-14-caja-1633kg', 13.62),
    ('papa-select-38-sc-caja-1361kg', 13.62),
    ('papa-conquest-delivery-38-sc-caja-1361kg', 13.62),
    ('aros-cebolla-bolsa-907g', 10.89),
    ('dedos-queso-bolsa-181kg', 10.88),
    ('papa-dulce-recta-38-caja-680kg', 6.8),
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
    ('camaron-cabeza-2030', 385730, 'Camaron Fresco Con Cabeza   Kg', 'KG', 339.90, 339.90, 339.90),
    ('camaron-2125', 397785, 'Camaron Cocido Grande Con Cola   Kg', 'KG', 379.90, 379.90, 379.90),
    ('camaron-4150', 9167, 'Camarón Crudo Mediano   Por Kg', 'KG', 199.90, 259.90, 199.90),
    ('filete-tilapia-35', 413123, 'Filete De Tilapia Fresco   Kg', 'KG', 269.90, 269.90, 269.90),
    ('filete-tilapia-comercial-50', 413123, 'Filete De Tilapia Fresco   Kg', 'KG', 269.90, 269.90, 269.90),
    ('mojarra-importada', 308227, 'Filete Mojarra De Granja   Kg', 'KG', 109.90, 123.90, 109.90);

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
