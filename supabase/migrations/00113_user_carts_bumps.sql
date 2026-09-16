-- ============================================================
-- 00113: user_carts.bumps — order bumps seleccionados persistentes
--
-- Los bumps viven solo en sessionStorage (resurte:selected-bumps): al
-- cerrar la pestaña o salir del checkout el usuario los pierde, aunque
-- su carrito sí sobreviva. Con el encadenado sin tope esto se vuelve
-- más costoso: el usuario puede llevar muchas ofertas armadas.
--
-- `bumps` guarda la selección completa del carrito activo, con la
-- misma semántica replace-all que `items` (PUT /api/cart/bumps/selection):
-- el arreglo que llega ES la selección completa, `[]` significa "el
-- usuario quitó todas las ofertas" (no "no toques nada").
--
-- `bumps_updated_at` es el timestamp PROPIO de los bumps, deliberadamente
-- separado de `updated_at`: los dos syncs son independientes y comparten
-- fila. Si un push de bumps moviera `updated_at`, el merge del carrito
-- (last-write-wins) creería que el servidor es más reciente y pisaría un
-- cambio de carrito local que aún no se había subido (y viceversa).
--
-- RLS: heredada de la fila de user_carts (no hay políticas nuevas).
--
-- NOTA OPERATIVA: esta migración es aditiva e idempotente. Mientras no
-- esté aplicada, PUT /api/cart/bumps/selection y POST /api/cart/bumps/hydrate
-- devuelven 500; el cliente lo tolera y la selección sigue funcionando,
-- pero solo en el dispositivo (localStorage). Aplicarla habilita la
-- persistencia entre dispositivos para usuarios con sesión.
-- ============================================================

ALTER TABLE public.user_carts
  ADD COLUMN IF NOT EXISTS bumps JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.user_carts
  ADD COLUMN IF NOT EXISTS bumps_updated_at TIMESTAMPTZ;

ALTER TABLE public.user_carts
  DROP CONSTRAINT IF EXISTS user_carts_bumps_array;

ALTER TABLE public.user_carts
  ADD CONSTRAINT user_carts_bumps_array CHECK (jsonb_typeof(bumps) = 'array');

COMMENT ON COLUMN public.user_carts.bumps IS
  'Order bumps seleccionados por el usuario (SelectedBump[]); replace-all vía PUT /api/cart/bumps/selection, [] = selección vacía.';

COMMENT ON COLUMN public.user_carts.bumps_updated_at IS
  'Último cambio de bumps; timestamp propio para no interferir con el merge last-write-wins del carrito (updated_at).';
