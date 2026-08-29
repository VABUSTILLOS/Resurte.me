-- ============================================================
-- 00062: Origin 'abandoned_cart' para cupones personales
--
-- La secuencia de recuperación de carrito abandonado (2º y 3er toque)
-- emite cupones personales de un solo uso con vigencia corta. La 00060
-- restringía origin a ('post_purchase', 'reactivation'); aquí se amplía.
-- ============================================================

ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_origin_check;

ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_origin_check
  CHECK (origin IN ('post_purchase', 'reactivation', 'abandoned_cart'));
