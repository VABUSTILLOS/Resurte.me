-- ============================================================
-- Umbral de stock bajo por producto (ronda 7): la cantidad desde
-- la que el producto se considera "stock bajo" al derivar
-- stock_status desde stock_quantity. Antes estaba fijo en 5 en el
-- panel. NULL = usar el valor por defecto de la aplicación (5).
-- Aditiva, idempotente.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER
    CHECK (low_stock_threshold IS NULL OR low_stock_threshold >= 0);

COMMENT ON COLUMN products.low_stock_threshold IS
  'Cantidad a partir de la cual el producto se marca como stock bajo (NULL = 5 por defecto).';

-- Backfill: recalcula stock_status de los productos con inventario
-- controlado para que la columna (la que lee la tienda) coincida con el
-- umbral efectivo. Los productos sin stock_quantity quedan intactos
-- (null = sin control de inventario).
-- `stock_status` es un ENUM (00001), no TEXT: un CASE cuyas ramas son
-- literales sin tipo se resuelve a TEXT, y TEXT -> enum no tiene cast
-- implícito. Sin el cast explícito Postgres responde:
--   column "stock_status" is of type stock_status but expression is of type text
UPDATE products
   SET stock_status = (
         CASE
           WHEN stock_quantity <= 0 THEN 'out_of_stock'
           WHEN stock_quantity <= COALESCE(low_stock_threshold, 5) THEN 'low_stock'
           ELSE 'in_stock'
         END
       )::stock_status
 WHERE stock_quantity IS NOT NULL;

