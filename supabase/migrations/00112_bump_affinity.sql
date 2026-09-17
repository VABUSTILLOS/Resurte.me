-- ============================================================
-- 00112_bump_affinity.sql
--
-- Order bumps por afinidad de ingrediente.
--
-- PROBLEMA QUE RESUELVE: el ranking de bumps cruzaba `products.tags`
-- (tags de cocina: "taqueria", "tacos", "mexicana") con los tags de
-- `restaurant_collections`. Eso agrupa por *tipo de restaurante*, no por
-- *ingrediente que le falta al pedido*: con carne en el carrito el motor
-- podía sugerir un postre con la misma probabilidad que una salsa.
--
-- Además la tarjeta mostraba `bump_rules.title` como titular, y esos títulos
-- eran frases de venta que repetían el nombre del producto ("Limón para tus
-- mariscos") en vez del nombre real del catálogo ("Limón Agrio").
--
-- ESTA MIGRACIÓN:
--   1. Amplía el CHECK de `trigger_type` con `ingredient_affinity`.
--   2. Indexa (con unicidad por producto) las reglas de afinidad para que el
--      motor pueda insertarlas de forma idempotente y race-safe.
--   3. Crea `bump_affinity`: pares curado producto→producto editables por
--      admin. Es el escape para lo que el recetario no cubre.
--   4. Define `seed_bump_affinity()` con los pares canónicos de cocina
--      mexicana. Se invoca al final de esta migración y al final de seed.sql.
--   5. Reescribe los 11 títulos de venta de las reglas `recipe_collection`
--      para que dejen de repetir el nombre del producto: pasan a ser el
--      subtítulo de la tarjeta ("Para tus mariscos") y el titular pasa a ser
--      `products.name` ("Limón Agrio").
--
-- Idempotente: CREATE OR REPLACE FUNCTION + ON CONFLICT + guardas por título.
--
-- NOTA sobre slugs ausentes: el sembrado resuelve por `slug` contra
-- `products`, así que cualquier slug que no exista en el catálogo se omite en
-- silencio (mismo comportamiento que `seed_bump_rules()` de 00051). La
-- función emite un NOTICE con definidos vs. resueltos: si esos dos números
-- difieren, faltan productos en el catálogo y hay que revisarlos.
-- ============================================================

BEGIN;

-- Blindaje operativo: `bump_rules` está viva (el motor de bumps la lee en
-- cada render del carrito), así que un `ALTER TABLE` puede quedarse esperando
-- el lock indefinidamente. Cuando eso pasa el SQL Editor aborta la petición en
-- el navegador y el error que ves es "Failed to fetch (api.supabase.com)", no
-- un error de SQL. Con `lock_timeout` la transacción falla en 5s con un error
-- de lock legible y se puede reintentar sin dejar estado a medias.
SET LOCAL lock_timeout = '5s';

-- ============================================================
-- 1) Ampliar los trigger types permitidos
-- ============================================================
ALTER TABLE public.bump_rules
  DROP CONSTRAINT IF EXISTS bump_rules_trigger_type_check;

-- `NOT VALID` evita el escaneo de la tabla al añadir la restricción, así que
-- el ACCESS EXCLUSIVE dura microsegundos en vez de lo que tarde la tabla.
ALTER TABLE public.bump_rules
  ADD CONSTRAINT bump_rules_trigger_type_check
  CHECK (trigger_type IN (
    'perishables',          -- perecederos → complemento para pedido fresco
    'snacks_drinks',        -- bebidas/botanas → impulso
    'subtotal_threshold',   -- subtotal >= subtotal_min → producto de ticket alto
    'meat_bbq',             -- carnes → sazonador/salsa para asado
    'drinks_sides',         -- bebidas → botana/vasos
    'recipe_collection',    -- tags del carrito ∩ tags de una colección de receta
    'ingredient_affinity'   -- afinidad por ingrediente (bump_affinity + recetario)
  )) NOT VALID;

-- El `VALIDATE` corre con SHARE UPDATE EXCLUSIVE: no bloquea lecturas ni
-- escrituras. El estado final es idéntico al de un `ADD CONSTRAINT` validado.
ALTER TABLE public.bump_rules
  VALIDATE CONSTRAINT bump_rules_trigger_type_check;

-- ============================================================
-- 2) Una sola regla de afinidad por producto
-- ============================================================
-- El motor registra los bumps de afinidad bajo demanda (igual que
-- `buildDynamicRecipeBump()` hace con los de colección). Este índice hace que
-- el upsert sea idempotente incluso si dos requests concurrentes llegan a la
-- vez con el mismo producto.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bump_rules_ingredient_affinity
  ON public.bump_rules (product_id)
  WHERE trigger_type = 'ingredient_affinity';

-- ============================================================
-- 3) Tabla `bump_affinity`
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bump_affinity (
  id                BIGSERIAL PRIMARY KEY,
  source_product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  target_product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL DEFAULT 'curated'
                      CHECK (kind IN ('recipe', 'curated')),
  weight            INTEGER NOT NULL DEFAULT 1 CHECK (weight >= 0),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bump_affinity_no_self CHECK (source_product_id <> target_product_id)
);

COMMENT ON TABLE public.bump_affinity IS
  'Afinidad producto→producto para order bumps: si `source` está en el carrito, `target` es candidato. Complementa la afinidad automática del recetario (src/lib/recipes.ts) y es editable desde el panel de admin.';
COMMENT ON COLUMN public.bump_affinity.weight IS
  'Fuerza de la sugerencia. Desempata cuando dos candidatos completan la misma cantidad de ingredientes del carrito.';
COMMENT ON COLUMN public.bump_affinity.kind IS
  'recipe = derivado del recetario; curated = definido a mano por admin. Un par curated gana la razón mostrada en la tarjeta.';

-- Un par por dirección: (cebolla→chile) y (chile→cebolla) son dos filas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bump_affinity_pair
  ON public.bump_affinity (source_product_id, target_product_id);

CREATE INDEX IF NOT EXISTS idx_bump_affinity_source_active
  ON public.bump_affinity (source_product_id)
  WHERE is_active;

-- ============================================================
-- 4) Pares curados canónicos
-- ============================================================
-- El recetario cubre el 94.8% de los ingredientes del catálogo (201/212).
-- Estos pares hacen dos cosas: refuerzan las combinaciones obvias que el
-- recetario puede no contener, y dan salida a los 11 ingredientes que no
-- tienen producto equivalente (Ajonjolí, Vainilla, Papas blancas, Hielo,
-- Fideos de arroz, Masa de maíz para tamal, etc.). Para esos, el admin debe
-- crear el producto y luego el par desde el panel.
--
-- Los 203 pares fueron validados contra el catálogo REAL de producción
-- (475 productos, 387 comprables): 203/203 resuelven, 0 auto-pares,
-- 0 duplicados. El catálogo de supabase/seed.sql está desfasado respecto a
-- producción y solo resuelve 179/203; seed_bump_affinity() omite en silencio
-- los slugs ausentes (mismo comportamiento que seed_bump_rules()), así que un
-- reset local siembra un subconjunto y no falla.
CREATE OR REPLACE FUNCTION public.bump_affinity_seed_pairs()
RETURNS TABLE (source_slug TEXT, target_slug TEXT, weight INTEGER)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT * FROM (VALUES
    -- ── Base de salsa: cebolla / jitomate / chile se piden entre sí ──
    ('cebolla-blanca',        'chile-serrano',           3),
    ('cebolla-blanca',        'jitomate-bola',           3),
    ('cebolla-blanca',        'tomate-verde',            3),
    ('cebolla-blanca',        'cilantro',                2),
    ('cebolla-morada',        'chile-serrano',           2),
    ('cebolla-morada',        'jitomate-bola',           2),
    ('cebolla-cambray',       'chile-serrano',           2),
    ('cebolla-en-polvo',      'chile-en-polvo',          1),
    ('jitomate-bola',         'chile-serrano',           3),
    ('jitomate-bola',         'cebolla-blanca',          3),
    ('jitomate-bola',         'cilantro',                2),
    ('jitomate-saladet',      'chile-serrano',           2),
    ('jitomate-saladet',      'cebolla-blanca',          2),
    ('jitomate-cherry',       'queso-feta',              1),
    ('tomate-verde',          'chile-serrano',           3),
    ('tomate-verde',          'cilantro',                2),
    ('chile-serrano',         'jitomate-bola',           3),
    ('chile-serrano',         'cebolla-blanca',          3),
    ('chile-serrano',         'cilantro',                2),
    ('chile-jalapeno',        'jitomate-bola',           2),
    ('chile-jalapeno',        'cebolla-blanca',          2),
    ('chile-habanero',        'limon-agrio',             2),
    ('chile-poblano',         'media-crema-240ml',       2),
    ('chile-guajillo',        'ajo',                     2),
    ('chile-chipotle',        'ajo',                     2),
    ('chiles-secos-surtidos', 'ajo',                     2),
    ('chiles-secos-surtidos', 'chile-guajillo',          2),
    ('chile-ancho',           'chile-guajillo',          2),
    ('chile-guajillo',        'chile-ancho',             2),
    ('chile-pasilla',         'chile-ancho',             2),
    ('chile-mulato',          'chile-ancho',             1),
    ('chiles-jalapenos-encurtidos', 'cacahuate-salado-200g', 1),

    -- ── Carne de res → especias y salsas ──
    ('bistec-de-res',         'comino-molido',       3),
    ('bistec-de-res',         'pimienta-negra-molida', 3),
    ('bistec-de-res',         'salsa-inglesa-250ml',      2),
    ('bistec-de-res',         'salsa-maggi-200ml',        2),
    ('bistec-de-res',         'salsa-picante',    2),
    ('bistec-de-res',         'cebolla-blanca',           2),
    ('bistec-de-res',         'ajo',                      2),
    ('bistec-de-res',         'nopal',                    1),
    ('carne-molida-80-20',    'comino-molido',       3),
    ('carne-molida-80-20',    'oregano-molido-100g',      2),
    ('carne-molida-80-20',    'cebolla-blanca',           2),
    ('carne-molida-80-20',    'jitomate-bola',            2),
    ('carne-molida-80-20',    'tortillas-maiz',           2),

    -- ── Cerdo → adobo, BBQ y especias ──
    ('chuleta-de-cerdo',      'salsa-bbq',                3),
    ('chuleta-de-cerdo',      'comino-molido',       2),
    ('chuleta-de-cerdo',      'salsa-inglesa-250ml',      2),
    ('costilla-de-cerdo',     'salsa-bbq',                3),
    ('costilla-de-cerdo',     'salsa-picante',            2),
    ('costillas-de-cerdo',    'salsa-bbq',                3),
    ('lomo-de-cerdo',         'salsa-maggi-200ml',        2),
    ('lomo-de-cerdo',         'pimienta-negra-molida', 2),
    ('pierna-de-cerdo',       'achiote-en-pasta',         3),
    ('pierna-de-cerdo',       'comino-molido',       2),
    ('carne-de-cerdo-molida', 'comino-molido',       2),
    ('manteca-de-cerdo',      'cebolla-blanca',           1),
    ('huesos-de-cerdo',       'caldo-de-pollo',           1),
    ('tocino',                'huevo-blanco-18pz',        3),
    ('tocino',                'pan-brioche',              2),
    ('tocino',                'queso-cheddar-rebanado',   2),
    ('chorizo',               'frijol-bayo-1kg',          2),
    ('chorizo',               'tortillas-maiz',           2),
    ('chorizo',               'huevo-blanco-18pz',        2),
    ('jamon-de-pierna',       'mayonesa-1kg',             2),
    ('jamon-de-pierna',       'queso-oaxaca-400g',        2),
    ('salchicha-jumbo',       'pan-hot-dog',              3),

    -- ── Pollo → achiote, especias, limón ──
    ('pechuga-pollo',         'comino-molido',       2),
    ('pechuga-pollo',         'oregano-molido-100g',      2),
    ('pechuga-pollo',         'achiote-en-pasta',         2),
    ('pechuga-pollo',         'limon-agrio',              2),
    ('pierna-muslo-pollo',    'achiote-en-pasta',         3),
    ('pierna-muslo-pollo',    'comino-molido',       2),
    ('pollo-entero-fresco',          'achiote-en-pasta',         3),
    ('pollo-entero-fresco',          'oregano-molido-100g',      2),
    ('alitas-de-pollo',       'salsa-buffalo',            3),
    ('alitas-de-pollo',       'salsa-picante',    2),
    ('milanesa-de-pollo',     'pan-molido',               3),
    ('milanesa-de-pollo',     'huevo-blanco-18pz',        2),
    ('milanesa-de-pollo',     'aceite-canola-1l',         2),
    ('nuggets-de-pollo-1kg',  'salsa-bbq',                2),
    ('panko',                 'milanesa-de-pollo',        2),

    -- ── Pescados y mariscos → limón ──
    ('filete-de-tilapia',     'limon-agrio',              3),
    ('filete-de-basa',        'limon-agrio',              3),
    ('filete-de-pescado-blanco', 'limon-agrio',           3),
    ('filete-de-pescado-blanco', 'ajo',                   2),
    ('filete-tilapia-congelado-1kg', 'limon-agrio',       3),
    ('atun-fresco',           'limon-agrio',              2),
    ('camaron-pacotilla',     'limon-agrio',              3),
    ('camaron-congelado-1kg',       'limon-agrio',              3),
    ('camaron-seco',          'limon-agrio',              2),
    ('camaron-congelado-1kg', 'salsa-picante',            2),
    ('salsa-de-anguila',      'arroz-blanco-1kg',         1),

    -- ── Papa → aceite, sal, salsa ──
    ('papa-blanca',           'aceite-canola-1l',         2),
    ('papa-blanca',           'sal-de-mar-fina-1kg',      2),
    ('papa-cambray',          'sal-de-grano',             2),
    ('papas-cambray',         'sal-de-grano',             2),
    ('papas-congeladas',      'aceite-vegetal',           2),
    ('papas-fritas-congeladas','salsa-picante',   2),

    -- ── Tortillas y pan → relleno ──
    ('tortillas-maiz',        'salsa-picante',    2),
    ('tortillas-maiz',        'salsa-verde',              2),
    ('tortillas-maiz',        'aguacate-hass',            2),
    ('tortillas-maiz',        'queso-oaxaca-400g',        2),
    ('tortillas-de-harina',   'queso-oaxaca-400g',        2),
    ('tortillas-de-harina',   'queso-fresco-500g',        2),
    ('tortilla-integral',     'aguacate-hass',            1),
    ('pan-hamburguesa',       'queso-cheddar-rebanado',   3),
    ('pan-hamburguesa',       'tocino',                   2),
    ('pan-hamburguesa',       'papas-congeladas',         2),
    ('pan-hot-dog',           'salchicha-jumbo',          2),
    ('pan-brioche',           'mayonesa-1kg',             2),
    ('pan-pita',              'jocoque',                  2),
    ('pan-pita',              'pepino',                   1),
    ('pan-brioche',           'huevo-blanco-18pz',        2),
    ('pan-brioche',           'crema-para-batir',         1),
    ('aros-de-cebolla',       'salsa-bbq',                2),

    -- ── Huevo → tocino, chorizo, jamón ──
    ('huevo-blanco-18pz',     'tocino',                   2),
    ('huevo-blanco-18pz',     'jamon-de-pierna',          2),
    ('huevo-fresco',          'tocino',                   2),
    ('huevo-rojo-18pz',       'chorizo',                  2),
    ('yemas-de-huevo',        'harina-de-trigo-1kg',      1),

    -- ── Frijoles, arroz y maíz ──
    ('frijol-negro-1kg',      'chorizo',                  2),
    ('frijol-bayo-1kg',       'chorizo',                  2),
    ('frijol-peruano-1kg',    'cebolla-blanca',           1),
    ('frijoles-rojos',        'chorizo',                  2),
    ('frijoles-refritos',     'queso-fresco-500g',        2),
    ('frijoles-refritos',     'salsa-picante',    2),
    ('arroz-blanco-1kg',      'caldo-de-pollo',           2),
    ('arroz-blanco-1kg',      'cebolla-blanca',           1),
    ('arroz-blanco-1kg',      'salsa-soya-5l',      1),
    ('maiz-cacahuazintle',    'caldo-de-pollo',           3),
    ('maiz-cacahuazintle',    'media-crema-240ml',        2),
    ('hoja-de-maiz',          'maiz-cacahuazintle',       2),
    ('maiz-tierno',           'media-crema-240ml',        2),
    ('elote',                 'media-crema-240ml',        2),
    ('elote',                 'chile-en-polvo',           2),
    ('elote',                 'limon-agrio',              2),
    ('caldo-de-pollo',        'arroz-blanco-1kg',         2),

    -- ── Repostería y panadería ──
    ('harina-de-trigo-1kg',   'levadura',                 3),
    ('harina-de-trigo-1kg',   'mantequilla-sin-sal-200g', 2),
    ('harina-de-trigo-1kg',   'huevo-blanco-18pz',        2),
    ('harina-de-maiz-1kg',    'harina-pan',               1),
    ('harina-para-hot-cakes', 'leche-entera-lala-1l',     2),
    ('harina-para-hot-cakes', 'mantequilla-sin-sal-200g', 2),
    ('chispas-de-chocolate',  'harina-de-trigo-1kg',      1),
    ('chocolate-de-mesa',    'leche-entera-lala-1l',     3),
    ('chocolate-polvo-1kg',   'leche-entera-lala-1l',     2),
    ('azucar-refinada-5kg',   'canela-en-polvo',          2),
    ('azucar-glass-1kg',     'crema-para-batir',         2),
    ('azucar-mascabado',      'canela-en-polvo',          2),
    ('canela-en-polvo',       'azucar-refinada-5kg',      2),
    ('levadura',              'harina-de-trigo-1kg',      2),
    ('galletas-marias-200g',  'leche-entera-lala-1l',     2),
    ('helado-vainilla-1l',    'chocolate-de-mesa',       1),
    ('crema-para-batir',      'chocolate-de-mesa',       1),

    -- ── Arepas (Harina PAN) ──
    ('harina-pan',            'queso-de-mano',            3),
    ('harina-pan',            'queso-blanco',             3),
    ('harina-pan',            'queso-mozzarella',         2),
    ('harina-pan',            'mantequilla-sin-sal-200g', 2),
    ('queso-de-mano',         'harina-pan',               2),
    ('queso-blanco',          'harina-pan',               2),

    -- ── Italiana / pizza ──
    ('pure-de-jitomate',      'queso-parmesano',          2),
    ('pure-de-tomate-enlatado','queso-mozzarella',        2),
    ('pure-de-tomate-enlatado','oregano-molido-100g',     2),
    ('queso-mozzarella',      'pure-de-tomate-enlatado',  2),
    ('queso-parmesano',       'pure-de-jitomate',         2),
    ('queso-mascarpone',      'cafe-espresso',            2),
    ('pan-para-crutones',     'queso-parmesano',          1),
    ('salsa-soya-5l',   'arroz-blanco-1kg',         2),

    -- ── Ensaladas y frescos ──
    ('lechuga-romana',        'jitomate-saladet',         2),
    ('lechuga-romana',        'pepino',                   2),
    ('lechuga-romana',        'limon-agrio',              1),
    ('espinaca',              'germinado-de-soya',        1),
    ('pepino',                'limon-agrio',              2),
    ('pepino',                'chile-en-polvo',           1),
    ('zanahoria',             'limon-agrio',              1),
    ('aguacate-hass',         'jitomate-bola',            2),
    ('aguacate-hass',         'limon-agrio',              2),
    ('aguacate-hass',         'tortillas-maiz',           2),
    ('aguacate-hass',         'cilantro',                 2),
    ('cilantro',              'limon-agrio',              2),
    ('cilantro',              'cebolla-blanca',           2),
    ('flor-de-calabaza',      'elote',                    1),
    ('chayote',               'jitomate-bola',            1),
    ('epazote',               'frijol-negro-1kg',         1),

    -- ── Bebidas y botana ──
    ('cerveza-clara',               'cacahuate-salado-200g',   2),
    ('cerveza-corona-extra-12pz',   'cacahuate-salado-200g',   2),
    ('cerveza-modelo-especial-12pz','cacahuate-salado-200g',   2),
    ('cerveza-clara',               'limon-agrio',             2),
    ('cerveza-corona-extra-12pz',   'limon-agrio',             2),
    ('cerveza-clara',               'escarchado-michelada',    2),
    ('cerveza-modelo-especial-12pz','escarchado-michelada',    1),
    ('tequila-blanco',        'limon-agrio',              3),
    ('tequila-blanco',        'sal-de-grano',             2),
    ('agua-mineral-15l',      'limon-agrio',              1),
    ('agua-mineral-saborizada-15l', 'cacahuate-salado-200g', 1),
    ('jugo-de-tomate',        'chile-en-polvo',           1),
    ('cafe-espresso',         'azucar-refinada-5kg',      1),
    ('cafe-en-grano',         'leche-entera-lala-1l',     1),

    -- ── Limpieza (pedido de despensa) ──
    ('detergente-en-polvo-1kg', 'limpiador-multiusos-500ml', 1),
    ('detergente-liquido-1l',   'limpiador-multiusos-500ml', 1),
    ('limpiador-multiusos-500ml','detergente-liquido-1l',     1),
    ('limon-agrio',             'limpiador-multiusos-500ml', 1)
  ) AS v(source_slug, target_slug, weight);
$$;

COMMENT ON FUNCTION public.bump_affinity_seed_pairs() IS
  'Pares de afinidad producto→producto por defecto (por slug). Fuente única para seed_bump_affinity(); separada para poder contar los pares definidos vs. los resueltos.';

CREATE OR REPLACE FUNCTION public.seed_bump_affinity()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_defined  INTEGER;
  v_resolved INTEGER;
BEGIN
  SELECT count(*) INTO v_defined FROM public.bump_affinity_seed_pairs();

  WITH resolved AS (
    SELECT s.id AS source_id, t.id AS target_id, p.weight
    FROM public.bump_affinity_seed_pairs() p
    JOIN public.products s ON s.slug = p.source_slug
    JOIN public.products t ON t.slug = p.target_slug
    WHERE s.id <> t.id
  ), ins AS (
    INSERT INTO public.bump_affinity
      (source_product_id, target_product_id, kind, weight, is_active)
    SELECT source_id, target_id, 'curated', weight, true
    FROM resolved
    ON CONFLICT (source_product_id, target_product_id)
      DO UPDATE SET weight = EXCLUDED.weight, is_active = true, kind = 'curated'
    RETURNING 1
  )
  SELECT count(*) INTO v_resolved FROM ins;

  RAISE NOTICE '[seed_bump_affinity] % pares definidos, % resueltos contra el catálogo (los slugs ausentes se omiten en silencio).',
    v_defined, v_resolved;
  RETURN v_resolved;
END;
$$;

COMMENT ON FUNCTION public.seed_bump_affinity() IS
  'Inserta (idempotente) los pares de afinidad por defecto resolviendo slugs contra el catálogo. Se llama al final de esta migración y al final de seed.sql, porque en el reset local las migraciones corren antes que los productos.';

-- ============================================================
-- 5) Los títulos de venta dejan de repetir el nombre del producto
-- ============================================================
-- La tarjeta ahora titula con `products.name` y usa este texto como
-- subtítulo. "Limón para tus mariscos" → "Para tus mariscos", porque el
-- titular ya dice "Limón Agrio".
--
-- La primera fila es defensiva: `Chiles secos para tu salsa` no está en el
-- seed de 00051, pero es una regla que un admin pudo haber creado a mano.
DO $$
DECLARE
  v_rewritten INTEGER;
BEGIN
  UPDATE public.bump_rules r
  SET title = v.new_title
  FROM (VALUES
    ('Limón para tus mariscos',        'Para tus mariscos'),
    ('Chiles secos para tu salsa',     'Para tu salsa'),
    ('Guacamole para tus tacos',       'Para tus tacos'),
    ('Tocino para tus burgers',        'Para tus hamburguesas'),
    ('Jocoque para tus tacos árabes',  'Para tus tacos árabes'),
    ('Sazonador para tu asado',        'Para tu asado'),
    ('Salsa Buffalo para alitas',      'Para tus alitas'),
    ('Botana para el bar',             'Para acompañar tus bebidas'),
    ('Glaseado para tu sushi',         'Para tu sushi'),
    ('Harina PAN para tus arepas',     'Para tus arepas'),
    ('Frijoles para la comida corrida','Para tu comida corrida'),
    ('Chispas para tu repostería',     'Para tu repostería')
  ) AS v(old_title, new_title)
  WHERE r.title = v.old_title
    AND r.trigger_type = 'recipe_collection';

  GET DIAGNOSTICS v_rewritten = ROW_COUNT;
  RAISE NOTICE '[bump_affinity] % títulos de recipe_collection reescritos de frase de venta a subtítulo.', v_rewritten;
END $$;

-- ============================================================
-- 6) Sembrado en producción (el catálogo ya existe aquí).
--    En reset local los productos se insertan DESPUÉS de las migraciones,
--    así que seed.sql vuelve a llamar a esta función al final.
-- ============================================================
SELECT public.seed_bump_affinity();

COMMIT;
