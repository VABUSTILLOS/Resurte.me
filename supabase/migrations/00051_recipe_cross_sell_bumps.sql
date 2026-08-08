-- ============================================================
-- 00051_recipe_cross_sell_bumps.sql
--
-- Venta cruzada inteligente para el checkout drawer.
--
-- PROBLEMA QUE RESUELVE: los order bumps no se renderizaban porque
-- `bump_rules` quedaba vacía: los seeds de 00045 filtraban productos por
-- nombre ILIKE ('%térmico%', '%hielera%', '%bolsa%reutilizab%', '%mandado%')
-- sobre `limpieza-cocina`, y NINGÚN producto del catálogo coincide con esos
-- nombres. Resultado: `resolveBumps()` → [] → `BumpCards` → null.
--
-- ESTA MIGRACIÓN:
--   1. Amplía el CHECK de `trigger_type` con los nuevos tipos:
--      meat_bbq, drinks_sides y recipe_collection.
--   2. Agrega `collection_slug` para reglas de receta/colección.
--   3. Indexa (con unicidad) las reglas de colección para poder hacer
--      upserts idempotentes desde el fallback dinámico del motor.
--   4. Define `seed_bump_rules()`: reglas que apuntan a productos REALES
--      del catálogo (por slug), con guardas NOT EXISTS por trigger_type /
--      collection_slug. Se invoca al final de la migración (producción,
--      donde el catálogo ya existe) y también al final de seed.sql (reset
--      local, donde las migraciones corren ANTES que los productos).
--
-- Idempotente: CREATE OR REPLACE FUNCTION + guardas NOT EXISTS.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) Ampliar los trigger types permitidos
-- ============================================================
ALTER TABLE public.bump_rules
  DROP CONSTRAINT IF EXISTS bump_rules_trigger_type_check;

ALTER TABLE public.bump_rules
  ADD CONSTRAINT bump_rules_trigger_type_check
  CHECK (trigger_type IN (
    'perishables',          -- perecederos → complemento para pedido fresco
    'snacks_drinks',        -- bebidas/botanas → impulso
    'subtotal_threshold',   -- subtotal >= subtotal_min → producto de ticket alto
    'meat_bbq',             -- carnes → sazonador/salsa para asado
    'drinks_sides',         -- bebidas → botana/vasos
    'recipe_collection'     -- tags del carrito ∩ tags de una colección de receta
  ));

-- ============================================================
-- 2) collection_slug (solo para trigger_type = recipe_collection)
-- ============================================================
ALTER TABLE public.bump_rules ADD COLUMN IF NOT EXISTS collection_slug TEXT;

COMMENT ON COLUMN public.bump_rules.collection_slug IS
  'Slug de restaurant_collections para reglas trigger_type = recipe_collection. NULL para reglas por categoría/umbral.';

-- ============================================================
-- 3) Índices de colección (1 regla por colección)
-- ============================================================
-- Dedupe preventivo: si existieran reglas duplicadas de una misma colección,
-- conserva solo la de menor id antes de crear el índice único.
DELETE FROM public.bump_rules a
USING public.bump_rules b
WHERE a.trigger_type = 'recipe_collection'
  AND b.trigger_type = 'recipe_collection'
  AND a.collection_slug IS NOT NULL
  AND a.collection_slug = b.collection_slug
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bump_rules_recipe_collection
  ON public.bump_rules (collection_slug)
  WHERE trigger_type = 'recipe_collection' AND collection_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bump_rules_trigger_collection
  ON public.bump_rules (trigger_type, collection_slug);

-- ============================================================
-- 4) seed_bump_rules(): reglas con productos REALES del catálogo
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_bump_rules()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  -- ── (a) Reglas por categoría / umbral: UNA por trigger_type ──
  IF NOT EXISTS (SELECT 1 FROM public.bump_rules WHERE trigger_type = 'perishables') THEN
    INSERT INTO public.bump_rules
      (trigger_type, category_slugs, product_id, title, description, discount_pct, is_active, display_order)
    SELECT 'perishables',
           ARRAY['frutas-verduras', 'lacteos-huevos', 'carnes-aves-pescados', 'panaderia-tortilleria'],
           p.id, 'Salsa Maggi 200 ml',
           'Sazonador umami para tus preparaciones frescas. Agrégalo a este envío con descuento.',
           0.10, true, 1
    FROM public.products p
    WHERE p.slug = 'salsa-maggi-200ml'
      AND p.is_visible = true
      AND p.stock_status <> 'out_of_stock'
    LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.bump_rules WHERE trigger_type = 'snacks_drinks') THEN
    INSERT INTO public.bump_rules
      (trigger_type, category_slugs, product_id, title, description, discount_pct, is_active, display_order)
    SELECT 'snacks_drinks',
           ARRAY['bebidas', 'botanas-dulces'],
           p.id, 'Totopos de maíz',
           'El complemento perfecto para tu momento de antojo. Con descuento especial de hoy.',
           0.15, true, 2
    FROM public.products p
    WHERE p.slug = 'totopos-200g'
      AND p.is_visible = true
      AND p.stock_status <> 'out_of_stock'
    LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.bump_rules WHERE trigger_type = 'subtotal_threshold') THEN
    INSERT INTO public.bump_rules
      (trigger_type, category_slugs, subtotal_min, product_id, title, description, discount_pct, is_active, display_order)
    SELECT 'subtotal_threshold',
           ARRAY[]::TEXT[],
           500,
           p.id, 'Salsa Valentina 370 ml',
           'Tu pedido superó el umbral de envío gratis. Llévala a un precio especial.',
           0.20, true, 3
    FROM public.products p
    WHERE p.slug = 'salsa-valentina-370ml'
      AND p.is_visible = true
      AND p.stock_status <> 'out_of_stock'
    LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.bump_rules WHERE trigger_type = 'meat_bbq') THEN
    INSERT INTO public.bump_rules
      (trigger_type, category_slugs, product_id, title, description, discount_pct, is_active, display_order)
    SELECT 'meat_bbq',
           ARRAY['carnes-aves-pescados'],
           p.id, 'Salsa BBQ ahumada',
           'El toque ahumado perfecto para tus carnes y asados de hoy.',
           0.10, true, 4
    FROM public.products p
    WHERE p.slug = 'salsa-bbq'
      AND p.is_visible = true
      AND p.stock_status <> 'out_of_stock'
    LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.bump_rules WHERE trigger_type = 'drinks_sides') THEN
    INSERT INTO public.bump_rules
      (trigger_type, category_slugs, product_id, title, description, discount_pct, is_active, display_order)
    SELECT 'drinks_sides',
           ARRAY['bebidas'],
           p.id, 'Sabritas Clásicas 170 g',
           'La botana clásica para acompañar tus bebidas. Sin costo extra de envío.',
           0.15, true, 5
    FROM public.products p
    WHERE p.slug = 'sabritas-clasicas-170g'
      AND p.is_visible = true
      AND p.stock_status <> 'out_of_stock'
    LIMIT 1;
  END IF;

  -- ── (b) Reglas de colección de recetas: UNA por collection_slug ──
  -- Productos elegidos del catálogo real (slug) como complemento "key
  -- ingredient" de la colección. Si el catálogo de producción difiere, la
  -- regla simplemente no se inserta y el motor usa el fallback dinámico.
  FOR r IN
    SELECT slug, product_slug, title, description, discount, ord
    FROM (VALUES
      ('taquerias-antojitos',       'aguacate-hass',       'Guacamole para tus tacos',          'Aguacate Hass listo para guacamole. Completa tu noche de tacos.',       0.15, 6),
      ('cortes-carne-asaderos',     'cebolla-en-polvo',    'Sazonador para tu asado',           'Cebolla en polvo para el rub perfecto de tus cortes a la parrilla.',   0.10, 7),
      ('pollo-alitas',              'salsa-buffalo',       'Salsa Buffalo para alitas',         'La salsa clásica para tus alitas y boneless.',                         0.15, 8),
      ('bebidas-bares-botanas',     'cacahuate-salado-200g','Botana para el bar',               'Cacahuate salado para acompañar tus bebidas y micheladas.',            0.15, 9),
      ('sushi-comida-asiatica',     'salsa-de-anguila',    'Glaseado para tu sushi',            'Salsa de anguila (unagi) para el toque final de tu sushi.',            0.15, 10),
      ('hamburguesas-hot-dogs',     'tocino',              'Tocino para tus burgers',           'Tocino ahumado en rebanadas para tus hamburguesas y hot dogs.',        0.10, 11),
      ('mariscos-pescados',         'limon-agrio',         'Limón para tus mariscos',           'Limón agrio fresco, imprescindible con mariscos y ceviches.',          0.10, 12),
      ('comida-arabe-griega',       'jocoque',             'Jocoque para tus tacos árabes',     'Jocoque seco para aderezos y tacos árabes.',                           0.10, 13),
      ('comida-venezolana-latina',  'harina-pan',          'Harina PAN para tus arepas',        'Harina de maíz precocida para arepas auténticas.',                     0.10, 14),
      ('comida-mexicana-corrida',   'frijoles-refritos',   'Frijoles para la comida corrida',   'Frijoles refritos tradicionales listos para servir.',                  0.10, 15),
      ('postres-panaderia-helados', 'chispas-de-chocolate','Chispas para tu repostería',        'Chispas de chocolate semiamargo para galletas y postres.',             0.10, 16)
    ) AS v(slug, product_slug, title, description, discount, ord)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.bump_rules
      WHERE trigger_type = 'recipe_collection' AND collection_slug = r.slug
    ) THEN
      INSERT INTO public.bump_rules
        (trigger_type, category_slugs, product_id, title, description, discount_pct, is_active, display_order, collection_slug)
      SELECT 'recipe_collection',
             ARRAY[]::TEXT[],
             p.id, r.title, r.description, r.discount, true, r.ord, r.slug
      FROM public.products p
      WHERE p.slug = r.product_slug
        AND p.is_visible = true
        AND p.stock_status <> 'out_of_stock'
      LIMIT 1;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.seed_bump_rules() IS
  'Inserta (idempotente) las reglas de order bumps por defecto apuntando a productos reales del catálogo. Se llama al final de esta migración y al final de seed.sql para que funcione tanto en producción como en resets locales.';

-- ============================================================
-- 5) Seed en producción (el catálogo ya existe aquí).
--    En reset local los productos se insertan DESPUÉS de las migraciones,
--    así que seed.sql llama de nuevo a esta función al final.
-- ============================================================
SELECT public.seed_bump_rules();

COMMIT;
