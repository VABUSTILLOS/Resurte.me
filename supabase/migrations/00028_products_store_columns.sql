-- Migration: Versiona en `products` las columnas de precio/stock que el código
-- ya consume en producción.
--
-- CONTEXTO: el esquema base (00001) definía price/sale_price/is_available/
-- stock_status solo en `product_stores` (por tienda). Sin embargo, el catálogo
-- público (catalog-cache), el panel (admin) y los tipos Product consultan esas
-- columnas directamente en `products`. En la BD remota esas columnas se
-- añadieron manualmente fuera de versionado. Esta migración las versiona para
-- que el repo pueda reproducir el esquema, y hace backfill desde la tienda
-- activa para alinear precios.
--
-- Es idempotente (ADD COLUMN IF NOT EXISTS): puede aplicarse incluso si las
-- columnas ya existen en la BD.

-- 1. Columnas en `products` (fuente de verdad de facto en producción)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS price        DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS sale_price   DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS is_visible   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stock_status stock_status NOT NULL DEFAULT 'in_stock';

-- 2. Backfill: sincronizar precios/stock desde la tienda activa.
--    (No pisa valores que ya existan en `products`.)
UPDATE products p
SET price        = COALESCE(p.price, ps.price),
    sale_price   = COALESCE(p.sale_price, ps.sale_price),
    stock_status = COALESCE(p.stock_status, ps.stock_status)
FROM product_stores ps
JOIN stores s ON s.id = ps.store_id
WHERE s.is_active = true
  AND ps.product_id = p.id
  AND (p.price IS NULL OR p.sale_price IS NULL OR p.stock_status IS NULL);

-- 3. Comentarios de documentación
COMMENT ON COLUMN products.price IS 'Precio de venta (fuente de verdad real en producción; se sincroniza desde product_stores de la tienda activa).';
COMMENT ON COLUMN products.sale_price IS 'Precio en oferta/descuento (nullable).';
COMMENT ON COLUMN products.is_visible IS 'Visibilidad en el catálogo público (filtrado por el frontend y el panel admin).';
COMMENT ON COLUMN products.stock_status IS 'Disponibilidad: in_stock | low_stock | out_of_stock (sin inventario numérico).';
