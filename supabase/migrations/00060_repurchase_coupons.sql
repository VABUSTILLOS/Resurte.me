-- ============================================================
-- 00060: Cupones personales de recompra
-- ------------------------------------------------------------
-- Cupones ligados a un usuario (user_id) con origen trazable:
--   post_purchase → emitido al confirmar un pedido (incentiva la
--                   siguiente compra en 7-14 días).
--   reactivation  → emitido por el cron a clientes inactivos.
-- user_id NULL = cupón público (comportamiento actual).
-- La validación de pertenencia se hace server-side en
-- /api/coupons/validate y /api/orders.
-- ============================================================

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS origin TEXT
  CHECK (origin IN ('post_purchase', 'reactivation'));

CREATE INDEX IF NOT EXISTS idx_coupons_user_active
  ON coupons (user_id)
  WHERE user_id IS NOT NULL;
