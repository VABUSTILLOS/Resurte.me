-- ============================================================
-- 00114: orders.coupon_code — versiona el cupón aplicado al pedido
--
-- El código de cupón se guardaba SOLO en memoria durante el checkout:
-- POST /api/orders lo escribe, el ticket imprimible y el panel de admin
-- lo leen, y PATCH /api/orders/[id]/status lo usa para liberar la reserva
-- al cancelar. La columna nunca se versionó (00049 la añadió a `leads` y
-- 00080 a `foodos_restaurants`, pero no a `orders`), así que en el
-- esquema desplegado el INSERT/UPDATE fallaba con 42703
-- (`column orders.coupon_code does not exist`).
--
-- Efectos del drift hasta ahora:
--   · Panel de admin: GET /admin/pedidos devolvía 42703 y la UI mostraba
--     "Error al cargar los pedidos" (toda la consulta se caía, no solo
--     la columna).
--   · Checkout con cupón: POST /api/orders respondía 500.
--   · Confirmación de pago Stripe: el webhook no podía liberar el cupón.
--   · PATCH /api/orders/[id]/status: TODA actualización de estado
--     respondía 404 (el error de lectura se confundía con "no existe").
--
-- El código de la app ya reintenta sin la columna (ver
-- src/lib/admin/order-selects.ts), así que la migración es aditiva y
-- puede aplicarse sin desplegar código primero. Aplicarla restaura el
-- cupón en admin/ticket y desbloquea el checkout con cupón.
--
-- `coupon_code` referencia `coupons.code` de forma lógica (TEXT), NO con
-- FK: la columna se llena antes de validar el cupón y el código debe
-- sobrevivir al borrado del cupón para que el pedido conserve su
-- histórico de descuento.
--
-- NOTA OPERATIVA: idempotente y aditiva. Aplicar con
-- `npx supabase db push` (no requiere downtime ni backfill).
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS coupon_code TEXT;

COMMENT ON COLUMN public.orders.coupon_code IS
  'Código del cupón aplicado al pedido (referencia lógica a coupons.code, sin FK: el histórico del descuento sobrevive al borrado del cupón).';
