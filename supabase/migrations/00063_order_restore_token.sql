-- ============================================================
-- 00063: Token público de restauración de carrito en orders
--
-- El enlace de recuperación de carrito abandonado debe funcionar
-- también para invitados (sin sesión → RLS bloquea la lectura).
-- Se añade restore_token (UUID aleatorio por pedido) que actúa como
-- capability URL: solo quien recibió el email puede restaurar ese
-- carrito vía /api/cart/restore?order=<id>&t=<token>.
-- El DEFAULT aplica también a filas existentes (PG >= 11).
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS restore_token UUID DEFAULT gen_random_uuid();

COMMENT ON COLUMN public.orders.restore_token IS
  'Token opaco para restaurar el carrito de un pedido pendiente sin sesión (enlace de email de carrito abandonado).';
