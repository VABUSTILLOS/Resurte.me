-- ============================================================
-- Cantidad mínima y máxima por pedido, por producto (Ola 2:
-- paridad con Take App). NULL = sin límite.
--
-- Columnas PRIVADAS (solo service_role, como low_stock_threshold):
-- no entran al GRANT público de 00192 ni a PUBLIC_PRODUCT_COLUMNS.
-- Las fuerzan en servidor POST /api/orders y la conversión de
-- pedidos de WhatsApp (ambos leen con service role); la ficha del
-- producto lee el mínimo con el cliente de servicio al renderizar.
-- El código degrada si esta migración aún no se aplica (42703).
-- Idempotente.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS min_order_qty integer,
  ADD COLUMN IF NOT EXISTS max_order_qty integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_min_order_qty_check'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_min_order_qty_check
      CHECK (min_order_qty IS NULL OR min_order_qty >= 1);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_max_order_qty_check'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_max_order_qty_check
      CHECK (max_order_qty IS NULL OR max_order_qty >= 1);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_order_qty_range_check'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT products_order_qty_range_check
      CHECK (
        min_order_qty IS NULL
        OR max_order_qty IS NULL
        OR min_order_qty <= max_order_qty
      );
  END IF;
END $$;

COMMENT ON COLUMN products.min_order_qty IS
  'Cantidad mínima por pedido (null = sin mínimo). Privada: solo service_role.';
COMMENT ON COLUMN products.max_order_qty IS
  'Cantidad máxima por pedido (null = sin máximo). Privada: solo service_role.';
