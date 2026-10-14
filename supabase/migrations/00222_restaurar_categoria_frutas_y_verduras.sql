-- ============================================================================
-- 00222 — Restaurar la categoría "Frutas y Verduras" que se borró por error
--
-- QUÉ PASÓ
--   El 13-oct-2026 a las 23:57:56 UTC alguien borró desde el panel del catálogo
--   la categoría original "Frutas y Verduras" (la primera del seed, id=1) en vez
--   de uno de los tres duplicados vacíos que dejó el bug del alta repetida.
--
--   Como `products.category_id` es `ON DELETE SET NULL` (00001), el borrado dejó
--   **109 productos sin categoría** — no se perdieron ni se despublicaron, pero
--   salieron del agrupamiento por categoría y de las secciones del mensaje de
--   WhatsApp. Es exactamente la consecuencia que el panel advierte antes de
--   borrar.
--
-- CÓMO SE IDENTIFICARON LOS 109
--   No hay respaldo previo al borrado (el respaldo se tomó después), pero las
--   109 filas quedaron con el MISMO `updated_at`, `2026-10-13T23:57:56.416082Z`:
--   `products_touch_updated_at` (00119) lo escribe en cada UPDATE y el `SET NULL`
--   de la clave foránea tocó todas las filas en una sola sentencia, así que
--   comparten el instante de la transacción. Los ids de abajo son esa lista
--   exacta, y sus nombres son todos frutas y verduras.
--
-- POR QUÉ ES SEGURA
--   - Idempotente: sólo reasigna filas con `category_id IS NULL`, así que
--     re-ejecutarla no hace nada y **nunca pisa** una reclasificación hecha a
--     mano después.
--   - No crea una cuarta "Frutas y Verduras": reusa un duplicado vacío si lo hay.
--   - No borra ni despublica nada.
-- ============================================================================

DO $$
DECLARE
  v_id BIGINT;
BEGIN
  -- 1. La categoría: la original por slug; si no, un duplicado VACÍO; si no, se crea.
  SELECT id INTO v_id FROM categories WHERE slug = 'frutas-verduras' LIMIT 1;

  IF v_id IS NULL THEN
    SELECT c.id INTO v_id
      FROM categories c
     WHERE c.name = 'Frutas y Verduras'
       AND NOT EXISTS (SELECT 1 FROM products p WHERE p.category_id = c.id)
     ORDER BY c.id
     LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO categories (name, slug)
    VALUES ('Frutas y Verduras', 'frutas-verduras')
    RETURNING id INTO v_id;
  ELSE
    UPDATE categories SET name = 'Frutas y Verduras' WHERE id = v_id;
    -- Devolver el slug original del seed, si nadie más lo tiene.
    IF NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'frutas-verduras' AND id <> v_id) THEN
      UPDATE categories SET slug = 'frutas-verduras' WHERE id = v_id;
    END IF;
  END IF;

  -- 2. Devolver sus 109 productos. Sólo los que están sin categoría.
  UPDATE products
     SET category_id = v_id
   WHERE category_id IS NULL
     AND id IN (
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
    25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
    37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48,
    49, 50, 205, 210, 219, 252, 291, 310, 312, 313, 325, 329,
    335, 337, 338, 341, 345, 348, 349, 364, 365, 366, 376, 379,
    397, 399, 402, 413, 419, 427, 587, 588, 589, 590, 591, 592,
    593, 594, 595, 596, 597, 598, 599, 600, 601, 602, 603, 604,
    605, 606, 607, 608, 609, 610, 611, 612, 613, 614, 615, 616,
    617
  );

  RAISE NOTICE 'Frutas y Verduras restaurada con id %', v_id;
END $$;
