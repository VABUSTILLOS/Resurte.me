-- ============================================================
-- 00214 — Primarios y precios con los costos REALES de AB Foods.
--
-- POR QUE EXISTE
-- --------------
-- 00213 se aplicó en una primera versión que aún traía costos de AB Foods
-- supuestos (549.90/499.90 genéricos). Los reales del seed
-- (supabase/seed_ab_foods.sql, lista 10-sep-2026) son:
--   Select 5/16 y 3/8 ....... $579.90/caja 13.61 kg
--   Conquest 1/4 ............ $819.90/caja 16.33 kg
--   Conquest Delivery 3/8 ... $799.90/caja 13.61 kg
--   Rejilla Savory .......... $699.90/caja 12.24 kg
--   Papa gajo 10 cut ........ $549.90/caja 13.61 kg
--   Dedos de queso .......... $369.90/bolsa 1.81 kg
--
-- Con los costos reales, los primarios correctos (menor costo/kg) son:
--   papa-gajo        Weber 48.90 < AB 53.63 ($729.90) < Distmar 54.33
--   select-516       AB 42.61  < Distmar 45.37
--   select-38        Distmar 37.44 < AB 42.61
--   conquest-14      Distmar 46.69 < AB 50.21
--   delivery-38      Distmar 42.29 < AB 58.77
--   rejilla          Distmar 55.49 < AB 57.18
--   camote           Distmar 70.59 < AB 110.28
--   dedos            Distmar 137.86 < AB 204.37
--   ondulada         Weber 36.90 < Distmar 37.44 < AB 40.40
--   hashbrown        Weber 59.90 < AB 77.19
--   aros             Weber 85.90 < Distmar 95.87 < AB 115.66
--
-- NOTA: las columnas `cost` de AB Foods en la tabla _prov_kg son de
-- REFERENCIA para el kg; el ranking usa siempre `product_suppliers.cost`
-- (fuente única), así que aunque una referencia difiera, el primario sale
-- del costo real almacenado.
--
-- Idempotente: fija is_primary y precio a su valor correcto; re-ejecutar
-- deja el mismo estado.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_bajo int;
BEGIN
  -- kg de la presentación DE CADA PROVEEDOR (para costo/kg comparable) y
  -- kg de la presentación DE VENTA de la tienda (para el precio final).
  CREATE TEMP TABLE _prov_kg (
    slug        text NOT NULL,
    proveedor   text NOT NULL,
    kg          numeric(12,4) NOT NULL,
    cost        numeric(12,2) NOT NULL,
    kg_tienda   numeric(12,4) NOT NULL,
    PRIMARY KEY (slug, proveedor)
  ) ON COMMIT DROP;

  INSERT INTO _prov_kg (slug, proveedor, kg, cost, kg_tienda) VALUES
    ('papa-gajo-10-cut-65-caja-1361kg',      'carnes-weber', 13.6100, 665.53, 13.6100),
    ('papa-gajo-10-cut-65-caja-1361kg',      'distmar',      13.6200, 739.99, 13.6100),
    ('papa-gajo-10-cut-65-caja-1361kg',      'ab-foods',     13.6100, 729.90, 13.6100),
    ('papa-select-516-sc-caja-1361kg',       'distmar',      13.6200, 617.99, 13.6100),
    ('papa-select-516-sc-caja-1361kg',       'ab-foods',     13.6100, 579.90, 13.6100),
    ('papa-select-38-sc-caja-1361kg',        'distmar',      13.6200, 509.99, 13.6100),
    ('papa-select-38-sc-caja-1361kg',        'ab-foods',     13.6100, 579.90, 13.6100),
    ('papa-conquest-14-caja-1633kg',         'distmar',      13.6200, 635.94, 16.3300),
    ('papa-conquest-14-caja-1633kg',         'ab-foods',     16.3300, 819.90, 16.3300),
    ('papa-conquest-delivery-38-sc-caja-1361kg', 'distmar',  13.6200, 575.99, 13.6100),
    ('papa-conquest-delivery-38-sc-caja-1361kg', 'ab-foods', 13.6100, 799.90, 13.6100),
    ('papa-rejilla-savory-caja-1224kg',      'distmar',      12.2500, 679.99, 12.2400),
    ('papa-rejilla-savory-caja-1224kg',      'ab-foods',     12.2400, 699.90, 12.2400),
    ('papa-dulce-recta-38-caja-680kg',       'distmar',       6.8000, 479.99,  6.8000),
    ('papa-dulce-recta-38-caja-680kg',       'ab-foods',      6.8000, 749.90,  6.8000),
    ('dedos-queso-bolsa-181kg',              'distmar',      10.8800, 1499.94, 1.8100),
    ('dedos-queso-bolsa-181kg',              'ab-foods',      1.8100, 369.90,  1.8100),
    ('papa-ondulada-38-payette-caja-1361kg', 'carnes-weber', 13.6100, 502.21, 13.6100),
    ('papa-ondulada-38-payette-caja-1361kg', 'distmar',      13.6200, 509.99, 13.6100),
    ('papa-ondulada-38-payette-caja-1361kg', 'ab-foods',     13.6100, 549.90, 13.6100),
    ('papa-rallada-hash-brown-caja-816kg',   'carnes-weber',  8.1600, 488.78,  8.1600),
    ('papa-rallada-hash-brown-caja-816kg',   'ab-foods',      8.1600, 629.90,  8.1600),
    ('aros-cebolla-bolsa-907g',              'carnes-weber',  0.9070,  77.89,  0.9070),
    ('aros-cebolla-bolsa-907g',              'distmar',      10.8900, 1043.98, 0.9070),
    ('aros-cebolla-bolsa-907g',              'ab-foods',      0.9070, 104.90,  0.9070);

  -- 1) Costo Weber de la ondulada por si 00213 no la corrigió.
  UPDATE public.product_suppliers ps
  SET cost = 502.21, updated_at = now()
  FROM public.products p
  WHERE ps.product_id = p.id
    AND p.slug = 'papa-ondulada-38-payette-caja-1361kg'
    AND ps.supplier_id = (SELECT id FROM public.suppliers WHERE slug = 'carnes-weber')
    AND ps.cost <> 502.21;

  -- 2) is_primary por fila con los costos reales.
  WITH costos AS (
    SELECT ps.id,
           ROW_NUMBER() OVER (
             PARTITION BY ps.product_id
             ORDER BY ps.cost / k.kg ASC, ps.id ASC
           ) AS rnk
    FROM public.product_suppliers ps
    JOIN public.products p ON p.id = ps.product_id
    JOIN public.suppliers s ON s.id = ps.supplier_id
    JOIN _prov_kg k ON k.slug = p.slug AND k.proveedor = s.slug
  )
  UPDATE public.product_suppliers ps
  SET is_primary = (c.rnk = 1)
  FROM costos c
  WHERE ps.id = c.id
    AND ps.is_primary IS DISTINCT FROM (c.rnk = 1);

  -- 3) Precio = costo/kg del ganador × kg de la presentación de la tienda
  --    × 1.20. Sin tope Alsuper en estos productos (curación 00209/00211).
  WITH ganador AS (
    SELECT p.id AS product_id,
           ps.cost / k.kg AS costo_kg,
           k.kg_tienda
    FROM public.products p
    JOIN public.product_suppliers ps ON ps.product_id = p.id AND ps.is_primary
    JOIN public.suppliers s ON s.id = ps.supplier_id
    JOIN _prov_kg k ON k.slug = p.slug AND k.proveedor = s.slug
  )
  UPDATE public.products p
  SET price = CEIL(g.costo_kg * g.kg_tienda * 1.20),
      updated_at = now()
  FROM ganador g
  WHERE p.id = g.product_id
    AND p.price IS DISTINCT FROM CEIL(g.costo_kg * g.kg_tienda * 1.20);

  -- 4) Guarda: ningún visible bajo el costo del primario por presentación.
  SELECT count(*) INTO v_bajo
  FROM public.products p
  JOIN public.product_suppliers ps ON ps.product_id = p.id AND ps.is_primary
  JOIN public.suppliers s ON s.id = ps.supplier_id
  JOIN _prov_kg k ON k.slug = p.slug AND k.proveedor = s.slug
  WHERE p.is_visible
    AND p.price < (ps.cost / k.kg) * k.kg_tienda;

  IF v_bajo > 0 THEN
    RAISE EXCEPTION '00214: guarda rota, % visibles bajo costo', v_bajo;
  END IF;

  RAISE NOTICE '00214: primarios y precios con costos reales de AB Foods aplicados.';
END $$;

COMMIT;
