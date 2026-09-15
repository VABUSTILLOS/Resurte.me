-- ============================================================
-- 00084 · foodos_orders.updated_at
-- ============================================================
-- `orders` (marketplace) tiene `updated_at` desde 00001, pero
-- `foodos_orders` se creó en 00023 sin esa columna.
--
-- Consecuencia real: los handlers de Stripe escribían
-- `{ payment_status, updated_at }` sobre `foodos_orders`. PostgREST
-- rechaza la escritura completa con PGRST204 ("Could not find the
-- 'updated_at' column"), y como el error no se inspeccionaba, TODO
-- cambio de `payment_status` de un pedido FoodOS se perdía en
-- silencio: un cobro con tarjeta acreditado dejaba el pedido en
-- `pending` y nunca aparecía en las ventas del panel.
--
-- El código ya no escribe `updated_at` en `foodos_orders` (no depende
-- de esta migración), pero la columna se agrega igual para que el
-- esquema sea consistente con `orders` y para que el sello de tiempo
-- lo mantenga un trigger en vez de cada llamador.
-- ============================================================

ALTER TABLE public.foodos_orders
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- `touch_updated_at()` se define en 00066 y es genérica.
DROP TRIGGER IF EXISTS trg_touch_foodos_orders ON public.foodos_orders;
CREATE TRIGGER trg_touch_foodos_orders
  BEFORE UPDATE ON public.foodos_orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- El barrido de pagos y el de recordatorios filtran por
-- (payment_status, created_at); este índice los mantiene baratos
-- cuando la tabla crezca.
CREATE INDEX IF NOT EXISTS idx_foodos_orders_payment_created
  ON public.foodos_orders (payment_status, created_at);

COMMENT ON COLUMN public.foodos_orders.updated_at IS
  'Mantenido por trg_touch_foodos_orders. No escribir a mano desde el cliente.';
