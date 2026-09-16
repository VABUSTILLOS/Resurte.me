-- ============================================================
-- Identidad del producto (ronda 7): SKU propio y código de barras
-- para cruzar el catálogo con proveedores, facturas y etiquetas
-- físicas. El SKU es único entre productos vivos (los eliminados
-- no bloquean el valor); el código de barras se indexa sin
-- restricción porque un mismo empaque puede repetirse.
-- Aditiva, idempotente.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS barcode TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku_unique
  ON products (sku)
  WHERE sku IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_barcode
  ON products (barcode)
  WHERE barcode IS NOT NULL;

COMMENT ON COLUMN products.sku IS
  'SKU interno del producto (único entre productos vivos).';
COMMENT ON COLUMN products.barcode IS
  'Código de barras EAN/UPC del empaque (puede repetirse entre presentaciones).';
