-- ============================================================
-- 00045_bump_rules.sql
--
-- Configuración de ORDER BUMPS condicionales (mecánica ThriveCart).
--
-- Reglas de negocio (diseñadas junto al checkout drawer):
--   1. perishables       → si el carrito lleva perecederos (frutas-verduras,
--                          lacteos-huevos, carnes-aves-pescados,
--                          panaderia-tortilleria) se sugiere empaque térmico.
--   2. snacks_drinks     → si el carrito lleva bebidas o botanas-dulces se
--                          sugiere un producto de impulso complementario.
--   3. subtotal_threshold → si el subtotal >= subtotal_min se sugiere bolsa
--                          reutilizable de alta resistencia.
--
-- Los bumps son productos REALES del catálogo (product_id → products.id) con
-- un descuento fijo (bonus de $, nunca cupones). El server deriva todo:
-- el cliente solo envía city_id + items del carrito.
--
-- Idempotente (estilo ESQUEMA.md / 00028): CREATE TABLE IF NOT EXISTS + seed
-- que no duplica filas activas (match por trigger_type + product_id).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bump_rules (
  id            BIGSERIAL PRIMARY KEY,
  trigger_type  TEXT NOT NULL,
  category_slugs TEXT[] NOT NULL DEFAULT '{}',
  subtotal_min  DECIMAL(10,2),
  product_id    BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  discount_pct  DECIMAL(5,4) NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bump_rules_trigger_type_check
    CHECK (trigger_type IN ('perishables', 'snacks_drinks', 'subtotal_threshold'))
);

COMMENT ON TABLE public.bump_rules IS
  'Reglas de order bumps condicionales del checkout drawer. Máx. 3 bumps simultáneos (1 por trigger_type). Los bumps son productos reales con descuento fijo.';

CREATE INDEX IF NOT EXISTS idx_bump_rules_active
  ON public.bump_rules (is_active, display_order)
  WHERE is_active = true;

-- ============================================================
-- SEED (idempotente por trigger_type + product_id)
-- ============================================================
-- Selecciona el primer producto visible de la categoría correspondiente.
-- Si el catálogo cambia, el admin puede desactivar la regla (is_active=false)
-- o apuntar a otro product_id sin volver a migrar.

INSERT INTO public.bump_rules
  (trigger_type, category_slugs, product_id, title, description, discount_pct, is_active, display_order)
SELECT
  'perishables',
  ARRAY['frutas-verduras', 'lacteos-huevos', 'carnes-aves-pescados', 'panaderia-tortilleria'],
  p.id,
  'Empaque térmico con hielera',
  'Mantén tus perecederos frescos durante la entrega. Hielera térmica reutilizable incluida con tu pedido de hoy.',
  0.10,
  true,
  1
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE c.slug = 'limpieza-cocina'
  AND p.is_visible = true
  AND p.stock_status <> 'out_of_stock'
  AND (p.name ILIKE '%térmico%' OR p.name ILIKE '%termico%' OR p.name ILIKE '%hielera%' OR p.name ILIKE '%bolsa%térmica%' OR p.name ILIKE '%bolsa%termica%')
  AND NOT EXISTS (
    SELECT 1 FROM public.bump_rules r
    WHERE r.trigger_type = 'perishables'
  )
ORDER BY p.id
LIMIT 1;

INSERT INTO public.bump_rules
  (trigger_type, category_slugs, product_id, title, description, discount_pct, is_active, display_order)
SELECT
  'snacks_drinks',
  ARRAY['bebidas', 'botanas-dulces'],
  p.id,
  'Complemento de impulso',
  'El complemento perfecto para tu momento de antojo. Agrégalo a este envío con descuento especial.',
  0.15,
  true,
  2
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE c.slug IN ('bebidas', 'botanas-dulces')
  AND p.is_visible = true
  AND p.stock_status <> 'out_of_stock'
  AND NOT EXISTS (
    SELECT 1 FROM public.bump_rules r
    WHERE r.trigger_type = 'snacks_drinks'
  )
ORDER BY p.id
LIMIT 1;

INSERT INTO public.bump_rules
  (trigger_type, category_slugs, subtotal_min, product_id, title, description, discount_pct, is_active, display_order)
SELECT
  'subtotal_threshold',
  ARRAY[]::TEXT[],
  500,
  p.id,
  'Bolsa reutilizable de alta resistencia',
  'Tu pedido superó el umbral de envío gratis. Añade una bolsa reutilizable de alta resistencia a un precio especial.',
  0.20,
  true,
  3
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE c.slug = 'limpieza-cocina'
  AND p.is_visible = true
  AND p.stock_status <> 'out_of_stock'
  AND (p.name ILIKE '%bolsa%reutilizab%' OR p.name ILIKE '%bolsa%ecológica%' OR p.name ILIKE '%bolsa%ecologica%' OR p.name ILIKE '%mandado%')
  AND NOT EXISTS (
    SELECT 1 FROM public.bump_rules r
    WHERE r.trigger_type = 'subtotal_threshold'
  )
ORDER BY p.id
LIMIT 1;
