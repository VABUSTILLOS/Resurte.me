-- ============================================================
-- Pedidos recurrentes y precios por cliente (Ola 5).
--
-- recurring_orders: la PLANTILLA de un pedido que se repite
-- (el caso de uso son los restaurantes con pedido fijo semanal).
-- Cada fila es la definición: cliente, artículos (JSONB con
-- product_id, variant_id opcional y cantidad), frecuencia
-- (weekly = semanal con día de la semana, biweekly = cada dos
-- semanas anclada a next_run_on, monthly = día fijo del mes),
-- dirección y método de pago habituales. El barrido del cron
-- diario (src/lib/recurring-orders.ts) genera el pedido REAL en
-- `orders` con source 'recurring' cuando llega la fecha:
-- precios recalculados de la BD en ese momento (incluido el
-- precio especial del cliente si lo tiene), existencia y
-- cantidades mín/máx validadas, mínimo de $500 forzado (si no
-- se alcanza, NO se crea y se avisa al staff: nunca se ajusta
-- en silencio). Nada se cobra solo: el pedido nace pendiente y
-- se paga por los canales de siempre (SPEI, link de Stripe,
-- contra entrega, crédito registrado como método habitual).
--
-- last_result guarda el desenlace del último ciclo ('created',
-- 'below_minimum', 'insufficient_stock', 'quantity_violation',
-- 'inactive_items', 'error') para que el panel lo muestre sin
-- tener que reconstruirlo.
--
-- customer_product_prices: precio especial de UN producto para
-- UN cliente (la lista de precios por cliente). Una sola vía, a
-- propósito: precio fijo por (cliente, producto), auditable fila
-- a fila; nada de porcentajes por categoría. Se aplica SOLO en
-- la web con la sesión de ese cliente (ficha, carrito y
-- checkout lo respetan; el servidor lo recalcula desde esta
-- tabla en POST /api/orders). En WhatsApp NO aplica: el
-- catálogo de Meta tiene un solo precio público. El alta desde
-- el panel valida contra products.cost cuando el costo existe:
-- un precio especial nunca nace por debajo del costo.
--
-- Sin políticas: solo service role (panel, checkout y cron).
-- El código degrada si esta migración aún no se aplica
-- (42P01 en las tablas): sin ella no hay recurrencias ni
-- precios especiales y la tienda vende como siempre.
-- Idempotente.
-- ============================================================

-- El valor nuevo del ENUM solo se AÑADE: usarlo en la misma
-- transacción no está permitido, y aquí ningún otro statement
-- lo referencia (lo usa el código de la app al insertar).
ALTER TYPE order_source ADD VALUE IF NOT EXISTS 'recurring';

CREATE TABLE IF NOT EXISTS recurring_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          TEXT,
  items         JSONB NOT NULL DEFAULT '[]'::jsonb,
  frequency     TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  weekday       SMALLINT CHECK (weekday BETWEEN 0 AND 6),
  day_of_month  SMALLINT CHECK (day_of_month BETWEEN 1 AND 28),
  address_id    BIGINT REFERENCES addresses(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash_on_delivery',
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'paused', 'cancelled')),
  next_run_on   DATE NOT NULL,
  last_run_on   DATE,
  last_order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  last_result   TEXT,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_orders_due
  ON recurring_orders (next_run_on)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_recurring_orders_user
  ON recurring_orders (user_id, created_at DESC);

ALTER TABLE recurring_orders ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE recurring_orders IS
  'Plantillas de pedidos recurrentes (Ola 5, 00234): el cron diario genera el pedido real en orders con source ''recurring''. Acceso solo con service_role (src/lib/recurring-orders.ts).';

CREATE TABLE IF NOT EXISTS customer_product_prices (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price      NUMERIC(12, 2) NOT NULL CHECK (price > 0),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_product_prices_user
  ON customer_product_prices (user_id);

ALTER TABLE customer_product_prices ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE customer_product_prices IS
  'Precio especial por (cliente, producto) (Ola 5, 00234): solo aplica en la web con sesión de ese cliente; el servidor lo recalcula en POST /api/orders. Acceso solo con service_role (src/lib/customer-prices.ts).';
