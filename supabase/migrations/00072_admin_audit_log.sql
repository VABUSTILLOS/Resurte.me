-- ============================================================
-- FASE 15 — BITÁCORA DE AUDITORÍA ADMIN
-- Registro append-only de acciones administrativas sensibles:
-- cambios de estado de pedido, precios/visibilidad de productos,
-- cupones y roles. Sin UPDATE/DELETE: la bitácora no se edita.
--
-- Renumerada desde `00078_admin_audit_log.sql`: existía OTRO archivo con la
-- versión `00078` (`00078_foodos_modifiers_dinein.sql`) y el CLI de Supabase
-- exige versiones únicas, así que esta migración se quedaba sin aplicar y la
-- bitácora no existía (el panel de historial de un producto respondía 500 y
-- `00118` fallaba con `42P01`). Idempotente: se puede reejecutar sin riesgo
-- sobre una base donde ya esté aplicada.
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action      TEXT NOT NULL, -- order_status, order_payment, product_update, coupon_create, coupon_update, coupon_delete, stock_adjust, user_role
  entity      TEXT NOT NULL, -- orders, products, coupons, profiles
  entity_id   TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb, -- p. ej. {"from":"pending","to":"confirmed"}
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_action ON admin_audit_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor ON admin_audit_log(actor_id, created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Solo admins leen la bitácora. La escritura se hace con service_role
-- (los server actions/rutas ya pasaron por requireAdmin), así que no hay
-- política de INSERT para usuarios: service_role la omite (bypass RLS).
DROP POLICY IF EXISTS "Admins can read audit log" ON admin_audit_log;
CREATE POLICY "Admins can read audit log" ON admin_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
