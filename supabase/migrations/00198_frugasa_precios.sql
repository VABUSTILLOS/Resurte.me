-- ============================================================
-- 00198 — FRUGASA: precio de venta = costo x 1.20, con tope de la competencia
--
-- LA REGLA, EN UNA LINEA
-- ----------------------
--     precio = LEAST( CEIL(costo_frugasa * factor * 1.20),
--                     tope_por_kilo * factor )
--
-- donde `factor` es el peso de UNA unidad de venta de la tienda
-- (`500 g` -> 0.5, `5 kg` -> 5, `por kilo` -> 1) y el tope sale de
-- `public.competitor_prices.unit_price`, que ya viene normalizado a kilo
-- por `scripts/alsuper-prices-sync.mjs`.
--
-- DECISIONES DE NEGOCIO QUE ESTA MIGRACION APLICA
-- -----------------------------------------------
--  1. El 20 % es un MARGEN SOBRE COSTO, no "20 % del precio": vender al
--     20 % del costo seria vender a perdida. Es el mismo criterio que el
--     1.18 que `00191` usa para AB Foods.
--  2. El tope de la competencia MANDA aunque quede por debajo del costo.
--     Fue una decision explicita del dueno: se asume el margen negativo
--     como precio de entrada. Los articulos afectados quedan listados en
--     `RAISE NOTICE` y en `docs/frugasa-comparativa.md`, para que no se
--     confundan con un error de calculo.
--  3. `sale_price` se limpia: con el precio nuevo, una oferta vieja puede
--     quedar por debajo del costo (la Manzana Roja conservaba una oferta
--     de $32 contra un costo de $57.55). Es lo mismo que hizo `00191`.
--  4. Los productos que la tienda vendia por pieza, manojo o charola
--     PASAN A VENDERSE POR KILO. Es la unica forma de comparar contra una
--     lista que es por kilo sin inventar el peso de una pieza, cosa que
--     `src/lib/unit-price.ts` prohibe. El `slug` no cambia: las URLs
--     quedan estables.
--
-- POR QUE EL JOIN ES POR SLUG Y NO POR ID
-- ---------------------------------------
-- Es la guarda de `00191`: un slug sin costo de FRUGASA no se toca, asi
-- que la migracion no puede pisar por accidente el precio de un producto
-- que le compramos a otro proveedor.
--
-- ORDEN DE EJECUCION
-- ------------------
-- Esta migracion cubre TODO producto con costo de FRUGASA, incluidos los
-- 61 que da de alta `00199`. Como los topes viven en `competitor_prices`,
-- el ciclo para refrescar precios es:
--
--     npx supabase db push
--     node scripts/alsuper-prices-sync.mjs
--     npx supabase db push   # (re-aplica 00198 con los topes frescos)
--
-- Idempotente: re-ejecutarla recalcula todo desde el costo y el tope.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_supplier bigint;
  v_filas int;
  v_cap int;
  v_bajo int;
BEGIN
  SELECT id INTO v_supplier FROM public.suppliers WHERE slug = 'frugasa';
  IF v_supplier IS NULL THEN
    RAISE EXCEPTION '00198: falta el proveedor frugasa; corre 00196 primero';
  END IF;

  -- Peso de una unidad de venta de la tienda, por slug.
  CREATE TEMP TABLE _frugasa_factor (
    slug   text PRIMARY KEY,
    factor numeric(12,4) NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _frugasa_factor (slug, factor) VALUES
    ('aguacate-hass', 1.0000),
    ('betabel', 1.0000),
    ('cebolla-blanca', 1.0000),
    ('cebolla-morada', 1.0000),
    ('champinon', 1.0000),
    ('guayaba', 1.0000),
    ('chile-jalapeno', 1.0000),
    ('mandarina', 1.0000),
    ('manzana-roja', 1.0000),
    ('pimiento-morron', 1.0000),
    ('naranja-valencia', 1.0000),
    ('nopal', 1.0000),
    ('papa-blanca', 1.0000),
    ('pepino', 1.0000),
    ('pera', 1.0000),
    ('platano-macho', 1.0000),
    ('sandia', 1.0000),
    ('jitomate-bola', 1.0000),
    ('jitomate-saladet', 1.0000),
    ('tomate-verde', 1.0000),
    ('toronja', 1.0000),
    ('uvas-rojas', 1.0000),
    ('uvas-verdes', 1.0000),
    ('zanahoria', 1.0000),
    ('chile-poblano', 1.0000),
    ('chile-serrano', 1.0000),
    ('chile-habanero', 0.1000),
    ('jengibre-fresco', 0.1000),
    ('limon-agrio', 1.0000),
    ('kale-organico-1kg', 1.0000),
    ('frijol-negro-1kg', 1.0000),
    ('arroz-blanco-1kg', 1.0000),
    ('lenteja-1kg', 1.0000),
    ('quinoa-1kg', 1.0000),
    ('semilla-chia-1kg', 1.0000),
    ('consome-de-pollo-1kg', 1.0000),
    ('sal-de-mar-fina-1kg', 1.0000),
    ('azucar-refinada-5kg', 5.0000),
    ('cocoa-polvo-1kg', 1.0000),
    ('pimenton', 0.1000),
    ('hoja-de-laurel', 0.0200),
    ('comino-molido', 0.5000),
    ('oregano-molido-100g', 0.1000),
    ('canela-en-polvo', 0.1000),
    ('pimienta-negra-molida', 0.5000),
    ('pasas', 0.2000),
    ('almendras-500g', 0.5000),
    ('nuez-de-castilla', 0.2000),
    ('achiote', 0.0500),
    ('ajo', 1.0000),
    ('apio', 1.0000),
    ('brocoli', 1.0000),
    ('chayote', 1.0000),
    ('cilantro', 1.0000),
    ('col-blanca', 1.0000),
    ('coliflor', 1.0000),
    ('elote', 1.0000),
    ('epazote', 1.0000),
    ('espinaca', 1.0000),
    ('fresa', 1.0000),
    ('hierbabuena-fresca', 1.0000),
    ('lechuga-romana', 1.0000),
    ('mango-ataulfo', 1.0000),
    ('melon-chino', 1.0000),
    ('papaya-maradol', 1.0000),
    ('perejil', 1.0000),
    ('pina-miel', 1.0000),
    ('rabano', 1.0000),
    ('romero-fresco', 1.0000),
    ('tomillo-fresco', 1.0000),
    ('zarzamora', 1.0000),
    ('germinado-de-soya', 1.0000),
    ('cebolla-cambray', 1.0000),
    ('jitomate-cherry', 1.0000);

  -- Productos que pasan de pieza/manojo/charola a venta por kilo.
  CREATE TEMP TABLE _frugasa_a_kilo (slug text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _frugasa_a_kilo (slug) VALUES
    ('ajo'),
    ('apio'),
    ('brocoli'),
    ('chayote'),
    ('cilantro'),
    ('col-blanca'),
    ('coliflor'),
    ('elote'),
    ('epazote'),
    ('espinaca'),
    ('fresa'),
    ('hierbabuena-fresca'),
    ('lechuga-romana'),
    ('mango-ataulfo'),
    ('melon-chino'),
    ('papaya-maradol'),
    ('perejil'),
    ('pina-miel'),
    ('rabano'),
    ('romero-fresco'),
    ('tomillo-fresco'),
    ('zarzamora'),
    ('germinado-de-soya'),
    ('cebolla-cambray'),
    ('jitomate-cherry');

  -- 1) Cambio de unidad ANTES de preciar: si el precio se calculara
  --    contra la unidad vieja, el factor quedaria mal aplicado.
  UPDATE public.products p
  SET unit = 'por kilo',
      updated_at = now()
  FROM _frugasa_a_kilo k
  WHERE p.slug = k.slug
    AND p.unit IS DISTINCT FROM 'por kilo';

  -- 2) La aritmetica, en una sola tabla temporal para poder auditar
  --    cuantas filas topan y cuantas quedan bajo costo SIN repetir la
  --    formula en tres consultas distintas.
  --
  --    `factor` cae a 1 cuando el producto no esta en la tabla: son los
  --    61 articulos que da de alta 00200, todos a venta por kilo.
  --    `cap` se agrega con MIN porque un producto podria tener precios
  --    de referencia de varias sucursales y el tope debe ser el mas
  --    exigente, no uno al azar.
  CREATE TEMP TABLE _frugasa_precio ON COMMIT DROP AS
  SELECT p.id,
         ps.cost,
         COALESCE(f.factor, 1)                        AS factor,
         CEIL(ps.cost * COALESCE(f.factor, 1) * 1.20) AS target,
         cap.unit_price * COALESCE(f.factor, 1)       AS cap
  FROM public.products p
  JOIN public.product_suppliers ps
    ON ps.product_id = p.id
   AND ps.supplier_id = v_supplier
   AND ps.cost IS NOT NULL
  LEFT JOIN _frugasa_factor f ON f.slug = p.slug
  LEFT JOIN (
    SELECT product_id, MIN(unit_price) AS unit_price
    FROM public.competitor_prices
    WHERE unit_price IS NOT NULL
    GROUP BY product_id
  ) cap ON cap.product_id = p.id;

  -- 3) El precio. `COALESCE` en el tope porque `LEAST(x, NULL)` es NULL
  --    en Postgres: un producto sin comparable valido quedaria sin precio.
  UPDATE public.products p
  SET price = LEAST(t.target, COALESCE(t.cap, t.target)),
      sale_price = NULL,
      updated_at = now()
  FROM _frugasa_precio t
  WHERE p.id = t.id;

  GET DIAGNOSTICS v_filas = ROW_COUNT;

  SELECT count(*) INTO v_cap FROM _frugasa_precio WHERE cap IS NOT NULL AND target > cap;
  -- La comparacion es contra el costo DE LA MISMA UNIDAD DE VENTA
  -- (costo por kilo x factor), no contra el costo por kilo a secas.
  SELECT count(*) INTO v_bajo
  FROM _frugasa_precio
  WHERE LEAST(target, COALESCE(cap, target)) < cost * factor;

  RAISE NOTICE '00198: % productos preciados con costo FRUGASA x 1.20.', v_filas;
  RAISE NOTICE '00198: % quedaron topados por la competencia.', v_cap;
  IF v_bajo > 0 THEN
    RAISE WARNING
      '00198: % productos quedaron POR DEBAJO del costo de FRUGASA. Es el tope de la competencia, no un error: la lista esta en docs/frugasa-comparativa.md.',
      v_bajo;
  END IF;
END $$;

COMMIT;
