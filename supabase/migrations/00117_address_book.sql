-- ============================================================
-- 00117_address_book.sql
--
-- Libro de direcciones del checkout: preselección por último uso y
-- papelera (soft delete).
--
-- Contexto: el servidor ya guarda cada dirección del checkout en
-- `addresses` (00033 invitados, 00050 logueados), pero nada distinguía
-- "la última que usé" de "una vieja", así que el checkout volvía a
-- pedir la dirección en cada compra. Además el borrado era físico:
-- `orders.address_id` es ON DELETE SET NULL, así que eliminar una
-- dirección dejaba los pedidos históricos sin dirección (el admin y el
-- ticket imprimen `addresses(...)`).
--
-- Nuevas columnas:
--   last_used_at TIMESTAMPTZ
--     → se toca en POST /api/orders cada vez que la dirección se usa.
--       Es la señal de preselección (después de is_default).
--   deleted_at TIMESTAMPTZ
--     → papelera: la fila sigue existiendo (los pedidos conservan su
--       dirección) pero desaparece de las listas del checkout y de
--       "Mis direcciones". Mismo patrón que products (00099).
--
-- Aditiva e idempotente (ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- Tabla viva con escrituras concurrentes del checkout: no esperar locks
-- indefinidamente si otra transacción la tiene tomada.
SET lock_timeout = '5s';

ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;

ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.addresses.last_used_at IS
  'Última vez que la dirección se usó en un pedido (preselección del checkout).';

COMMENT ON COLUMN public.addresses.deleted_at IS
  'Papelera: la dirección se oculta de las listas pero los pedidos históricos la conservan.';

-- Backfill: las direcciones existentes nunca registraron uso; created_at es
-- la mejor aproximación para que la preselección no devuelva NULL.
UPDATE public.addresses
SET last_used_at = created_at
WHERE last_used_at IS NULL;

-- Listado del libro anónimo: por token del navegador, más reciente primero.
CREATE INDEX IF NOT EXISTS idx_addresses_guest_recent
  ON public.addresses (guest_token, last_used_at DESC)
  WHERE user_id IS NULL AND deleted_at IS NULL;

-- Papelera (mismo patrón que idx_products_deleted_at de 00099).
CREATE INDEX IF NOT EXISTS idx_addresses_deleted_at
  ON public.addresses (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ============================================================
-- cleanup_orphan_guest_addresses(days)
--
-- Reescribe el RPC de 00042 para que la limpieza sea compatible con el
-- libro de direcciones:
--   · purga por COALESCE(deleted_at, last_used_at, created_at) — antes
--     usaba created_at, así que una dirección reutilizada durante meses
--     se borraba igual y el invitado recurrente la perdía;
--   · NO borra direcciones referenciadas por un pedido, para no vaciar
--     el historial (orders.address_id → ON DELETE SET NULL).
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_orphan_guest_addresses(
  p_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF p_days < 1 THEN
    RAISE EXCEPTION 'p_days must be >= 1';
  END IF;

  DELETE FROM public.addresses a
  WHERE a.guest_token IS NOT NULL
    AND a.user_id IS NULL
    AND COALESCE(a.deleted_at, a.last_used_at, a.created_at) < now() - make_interval(days => p_days)
    AND NOT EXISTS (
      SELECT 1 FROM public.orders o WHERE o.address_id = a.id
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Solo service_role puede invocarla (el cron usa service_role).
REVOKE ALL ON FUNCTION public.cleanup_orphan_guest_addresses(INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_orphan_guest_addresses(INTEGER)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_orphan_guest_addresses(INTEGER)
  TO service_role;

RESET lock_timeout;
