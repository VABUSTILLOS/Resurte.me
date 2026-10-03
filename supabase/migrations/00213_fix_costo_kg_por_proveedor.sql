-- ============================================================
-- 00213 — Corrección integral de costos/kg y primarios (Weber + Distmar).
--
-- DOS BUGS QUE DEJARON PRECIOS MAL
-- --------------------------------
-- 1. 00212 arregló 3 papas Weber pero faltó papa-ondulada (mismo error:
--    costo por kilo $36.90 guardado con kg=15 de la caja). Weber "ganó"
--    is_primary con un costo/kg fantasma de $2.46 y el precio quedó en
--    $45 la caja de 13.61 kg — por debajo del costo real ($553.50).
-- 2. La comparación de is_primary en 00209/00211 dividía el costo de TODOS
--    los proveedores por el kg del renglón nuevo (ON CONFLICT DO NOTHING se
--    quedaba el primero). En dedos-queso, la bolsa AB de $369.90/1.81 kg se
--    dividió por los 10.88 kg de la caja Distmar → $34/kg fantasma y AB
--    conservó el primario con precio viejo, aunque Distmar ($137.81/kg) sí
--    es más barato que AB ($204.37/kg).
--
-- LA CORRECCIÓN
-- -------------
-- Costo/kg por FILA de proveedor, no por producto: cada proveedor declara
-- el kg de SU presentación y se compara cost/costo_kg fila por fila.
--
-- Costos corregidos de Weber (costo_kg_lista × kg_caja):
--   papa-ondulada (traslape)  13.61 × $36.90 = $502.21
--   papa-hashbrown (traslape)  8.16 × $59.90 = $488.78
--   aros-cebolla (traslape)    0.907 × $85.90 = $77.89  (Weber vende por kg;
--     la tienda vende la bolsa de 907 g: el costo por bolsa es ese)
--
-- Primarios correctos (costo/kg por fila):
--   papa-ondulada : Distmar $37.44 < AB $40.40 < Weber $36.90... Weber es
--     $36.90/kg × 13.61 = $502.21 caja → $36.90/kg GANA Weber.
--   hashbrown     : Weber $59.90/kg < AB $77.19/kg → Weber.
--   aros          : Weber $85.90/kg < Distmar $95.87/kg < AB $115.66/kg → Weber.
--   dedos-queso   : Distmar $137.81/kg < AB $204.37/kg → Distmar.
--   papa-gajo     : Weber $48.90/kg < Distmar $54.33/kg → Weber (ya corregido
--     en 00212, aquí solo se recalcula el primario por fila).
--   select-516    : Distmar $45.37/kg < AB (549.90/13.61=$40.40) → AB gana.
--   select-38     : Distmar $37.44/kg < AB $40.40/kg → Distmar.
--   recta-14      : Distmar $46.69/kg < AB $36.68/kg (499.90/12.24 no — 12.24
--     es de Payette 1/4; Conquest es 16.33 kg a $499.90 → $30.61) → AB.
--   delivery-38   : Distmar $42.29/kg vs AB Conquest delivery ($499.90/13.61
--     = $36.73) → AB.
--   rejilla       : Distmar $55.49/kg vs AB Savory ($499.90/12.24 = $40.84) → AB.
--   camote        : Distmar $70.59/kg < AB $110.28/kg → Distmar (ya aplicado).
--
-- Idempotente: fija costos, kg y primarios a su valor correcto.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_weber bigint;
  v_dist bigint;
BEGIN
  SELECT id INTO v_weber FROM public.suppliers WHERE slug = 'carnes-weber';
  SELECT id INTO v_dist  FROM public.suppliers WHERE slug = 'distmar';
  IF v_weber IS NULL OR v_dist IS NULL THEN
    RAISE EXCEPTION '00213: faltan proveedores (corre 00209 y 00211 primero)';
  END IF;

  -- kg de la presentación DE CADA PROVEEDOR por producto (no por producto).
  CREATE TEMP TABLE _prov_kg (
    slug        text NOT NULL,
    supplier_id bigint NOT NULL,
    kg          numeric(12,4) NOT NULL,
    cost        numeric(12,2) NOT NULL,
    PRIMARY KEY (slug, supplier_id)
  ) ON COMMIT DROP;

  INSERT INTO _prov_kg (slug, supplier_id, kg, cost) VALUES
    -- Weber: costo CORRECTO por presentación de venta de la tienda.
    ('papa-ondulada-38-payette-caja-1361kg', v_weber, 13.6100, 502.21),
    ('papa-rallada-hash-brown-caja-816kg',   v_weber,  8.1600, 488.78),
    ('aros-cebolla-bolsa-907g',              v_weber,  0.9070,  77.89),
    ('papa-gajo-10-cut-65-caja-1361kg',      v_weber, 13.6100, 665.53),
    -- AB Foods (seed_ab_foods.sql).
    ('papa-ondulada-38-payette-caja-1361kg', (SELECT id FROM public.suppliers WHERE slug='ab-foods'), 13.6100, 549.90),
    ('papa-rallada-hash-brown-caja-816kg',   (SELECT id FROM public.suppliers WHERE slug='ab-foods'),  8.1600, 629.90),
    ('aros-cebolla-bolsa-907g',              (SELECT id FROM public.suppliers WHERE slug='ab-foods'),  0.9070, 104.90),
    ('dedos-queso-bolsa-181kg',              (SELECT id FROM public.suppliers WHERE slug='ab-foods'),  1.8100, 369.90),
    ('papa-gajo-10-cut-65-caja-1361kg',      (SELECT id FROM public.suppliers WHERE slug='ab-foods'), 13.6100, 549.90),
    ('papa-select-516-sc-caja-1361kg',       (SELECT id FROM public.suppliers WHERE slug='ab-foods'), 13.6100, 579.90),
    ('papa-select-38-sc-caja-1361kg',        (SELECT id FROM public.suppliers WHERE slug='ab-foods'), 13.6100, 579.90),
    ('papa-conquest-14-caja-1633kg',         (SELECT id FROM public.suppliers WHERE slug='ab-foods'), 16.3300, 819.90),
    ('papa-conquest-delivery-38-sc-caja-1361kg', (SELECT id FROM public.suppliers WHERE slug='ab-foods'), 13.6100, 799.90),
    ('papa-rejilla-savory-caja-1224kg',      (SELECT id FROM public.suppliers WHERE slug='ab-foods'), 12.2400, 699.90),
    ('papa-dulce-recta-38-caja-680kg',       (SELECT id FROM public.suppliers WHERE slug='ab-foods'),  6.8000, 749.90),
    -- Distmar (00211): costo por SU caja/presentación.
    ('papa-ondulada-38-payette-caja-1361kg', v_dist, 13.6200, 509.99),
    ('aros-cebolla-bolsa-907g',              v_dist, 10.8900, 1043.98),
    ('dedos-queso-bolsa-181kg',              v_dist, 10.8800, 1499.94),
    ('papa-gajo-10-cut-65-caja-1361kg',      v_dist, 13.6200, 739.99),
    ('papa-select-516-sc-caja-1361kg',       v_dist, 13.6200, 617.99),
    ('papa-select-38-sc-caja-1361kg',        v_dist, 13.6200, 509.99),
    ('papa-conquest-14-caja-1633kg',         v_dist, 13.6200, 635.94),
    ('papa-conquest-delivery-38-sc-caja-1361kg', v_dist, 13.6200, 575.99),
    ('papa-rejilla-savory-caja-1224kg',      v_dist, 12.2500, 679.99),
    ('papa-dulce-recta-38-caja-680kg',       v_dist,  6.8000, 479.99);

  -- kg de la presentación DE VENTA en la tienda por producto (00202).
  CREATE TEMP TABLE _slug_kg (slug text PRIMARY KEY, kg numeric(12,4) NOT NULL) ON COMMIT DROP;
  INSERT INTO _slug_kg (slug, kg) VALUES
    ('papa-ondulada-38-payette-caja-1361kg', 13.6100),
    ('papa-rallada-hash-brown-caja-816kg',    8.1600),
    ('aros-cebolla-bolsa-907g',               0.9070),
    ('dedos-queso-bolsa-181kg',               1.8100),
    ('papa-gajo-10-cut-65-caja-1361kg',      13.6100),
    ('papa-select-516-sc-caja-1361kg',       13.6100),
    ('papa-select-38-sc-caja-1361kg',        13.6100),
    ('papa-conquest-14-caja-1633kg',         16.3300),
    ('papa-conquest-delivery-38-sc-caja-1361kg', 13.6100),
    ('papa-rejilla-savory-caja-1224kg',      12.2400),
    ('papa-dulce-recta-38-caja-680kg',        6.8000);

  -- 1) Costos Weber corregidos (los que seguían mal).
  UPDATE public.product_suppliers ps
  SET cost = k.cost,
      notes = 'Lista Carnes Weber 01-oct-2026. Costo por presentación corregido en 00213 (costo/kg de la lista × kg de la presentación). La marca no se muestra en tienda.',
      updated_at = now()
  FROM _prov_kg k
  JOIN public.products p ON p.slug = k.slug
  WHERE ps.product_id = p.id
    AND ps.supplier_id = v_weber
    AND k.supplier_id = v_weber
    AND ps.cost <> k.cost;

  -- 2) is_primary por FILA: menor costo/kg real entre proveedores.
  WITH costos AS (
    SELECT ps.id, ps.product_id,
           ROW_NUMBER() OVER (
             PARTITION BY ps.product_id
             ORDER BY ps.cost / k.kg ASC, ps.id ASC
           ) AS rnk
    FROM public.product_suppliers ps
    JOIN public.products p ON p.id = ps.product_id
    JOIN _prov_kg k ON k.slug = p.slug AND k.supplier_id = ps.supplier_id
  )
  UPDATE public.product_suppliers ps
  SET is_primary = (c.rnk = 1)
  FROM costos c
  WHERE ps.id = c.id
    AND ps.is_primary IS DISTINCT FROM (c.rnk = 1);

  -- 3) Recalcular precio de venta donde cambió (o se corrigió) el primario.
  --    Tope Alsuper por kilo solo donde existe (00202): papa-ondulada no
  --    tiene (falso positivo descartado), dedos-queso tampoco (Tastiez no
  --    es comparable de mayoreo); los demás tampoco. Regla A solamente.
  WITH ganador AS (
    SELECT p.id AS product_id, p.slug,
           ps.cost AS costo_pres,
           pk.kg AS kg_pres,
           ps.cost / pk.kg AS costo_kg,
           COALESCE(sk.kg, pk.kg) AS kg_tienda
    FROM public.products p
    JOIN public.product_suppliers ps ON ps.product_id = p.id AND ps.is_primary
    JOIN _prov_kg pk ON pk.slug = p.slug AND pk.supplier_id = ps.supplier_id
    LEFT JOIN _slug_kg sk ON sk.slug = p.slug
  )
  UPDATE public.products p
  SET price = CEIL(g.costo_kg * g.kg_tienda * 1.20),
      updated_at = now()
  FROM ganador g
  WHERE p.id = g.product_id
    AND p.price IS DISTINCT FROM CEIL(g.costo_kg * g.kg_tienda * 1.20);

  -- 4) Guarda: ningún visible de los productos tocados bajo el costo/kg
  --    del primario por la presentación de venta de la tienda.
  IF EXISTS (
    SELECT 1
    FROM public.products p
    JOIN public.product_suppliers ps ON ps.product_id = p.id AND ps.is_primary
    JOIN _prov_kg pk ON pk.slug = p.slug AND pk.supplier_id = ps.supplier_id
    LEFT JOIN _slug_kg sk ON sk.slug = p.slug
    WHERE p.is_visible
      AND p.price < (ps.cost / pk.kg) * COALESCE(sk.kg, pk.kg)
  ) THEN
    RAISE EXCEPTION '00213: guarda rota, hay visibles bajo costo';
  END IF;

  RAISE NOTICE '00213: costos/kg por proveedor corregidos y primarios recalculados.';
END $$;

COMMIT;
