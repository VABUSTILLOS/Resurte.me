-- ============================================================
-- FASE 15 — BITÁCORA DE AUDITORÍA ADMIN
-- Registro append-only de acciones administrativas sensibles:
-- cambios de estado de pedido, precios/visibilidad de productos,
-- cupones y roles. Sin UPDATE/DELETE: la bitácora no se edita.
-- ============================================================

CREATE TABLE admin_audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action      TEXT NOT NULL, -- order_status, order_payment, product_update, coupon_create, coupon_update, coupon_delete, stock_adjust, user_role
  entity      TEXT NOT NULL, -- orders, products, coupons, profiles
  entity_id   TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb, -- p. ej. {"from":"pending","to":"confirmed"}
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_audit_log_created ON admin_audit_log(created_at DESC);
CREATE INDEX idx_admin_audit_log_action ON admin_audit_log(action, created_at DESC);
CREATE INDEX idx_admin_audit_log_actor ON admin_audit_log(actor_id, created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Solo admins leen la bitácora. La escritura se hace con service_role
-- (los server actions/rutas ya pasaron por requireAdmin), así que no hay
-- política de INSERT para usuarios: service_role la omite (bypass RLS).
CREATE POLICY "Admins can read audit log" ON admin_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
