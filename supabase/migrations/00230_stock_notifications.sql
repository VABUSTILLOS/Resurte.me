-- ============================================================
-- Avisos de inventario (Ola 2): suscripciones «avísame cuando
-- haya» (back in stock) y estado de la alerta de inventario bajo.
--
-- stock_notifications: una fila por (producto, teléfono) con
-- aviso pendiente; `notified_at` se llena cuando el aviso de
-- reposición se envía. El índice único parcial permite volver a
-- suscribirse después de haber sido avisado.
--
-- low_stock_alert_state: la sola presencia de la fila significa
-- «ya se avisó de este producto»; se borra cuando el stock se
-- repone por encima del umbral (rearme). Así la alerta suena UNA
-- vez por cruce, sin spam.
--
-- Sin políticas: solo service role (rutas de servidor y cron).
-- El código degrada si esta migración aún no se aplica (42P01).
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS stock_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  user_id     UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_notifications_pending_unique
  ON stock_notifications (product_id, phone)
  WHERE notified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_notifications_product_pending
  ON stock_notifications (product_id)
  WHERE notified_at IS NULL;

ALTER TABLE stock_notifications ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo service role.

CREATE TABLE IF NOT EXISTS low_stock_alert_state (
  product_id     BIGINT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  alerted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  threshold      INTEGER NOT NULL,
  stock_quantity INTEGER
);

ALTER TABLE low_stock_alert_state ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo service role.
