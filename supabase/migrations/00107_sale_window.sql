-- ============================================================
-- Vigencia de la oferta (ronda 7): ventana temporal opcional para
-- sale_price. La oferta está activa cuando now() cae dentro de la
-- ventana; fuera de ella el precio de oferta se ignora en tienda y
-- panel (fuente única: src/lib/sale-window.ts). NULL = sin límite.
-- Aditiva, idempotente.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sale_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sale_ends_at TIMESTAMPTZ;

-- Índice parcial para el filtro "ofertas vencidas" del panel.
CREATE INDEX IF NOT EXISTS idx_products_sale_ends_at
  ON products (sale_ends_at)
  WHERE sale_ends_at IS NOT NULL;

COMMENT ON COLUMN products.sale_starts_at IS
  'Inicio de la oferta; NULL = vigente de inmediato.';
COMMENT ON COLUMN products.sale_ends_at IS
  'Fin de la oferta; NULL = sin fecha de término.';
