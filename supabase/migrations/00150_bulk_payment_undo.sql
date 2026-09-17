-- ============================================================
-- 00150_bulk_payment_undo.sql
--
-- Da marcha atrás a la confirmación masiva de pago.
--
-- HALLAZGO
--   La barra de acciones masivas del panel de pedidos
--   (src/app/admin/pedidos/page.tsx) tenía dos acciones sin ninguna
--   confirmación previa:
--
--     bulkConfirmPayment()  -> { payment_status: "paid" }
--     bulkAssignDriver()    -> { driver_id: N }
--
--   La primera es una acción de dinero: pasar un pedido a `paid` dispara
--   trg_credit_cashback_on_payment, que abona cashback REAL a la wallet del
--   cliente. Un clic accidental sobre una selección grande abonaba cashback
--   a todos los clientes de la selección, sin diálogo de confirmación y sin
--   forma de revertirlo desde la UI: `PATCH /api/orders/[id]/status` solo
--   acepta `payment_status: "paid"` (VALID_PAYMENT_STATUSES), nunca el
--   regreso a `pending`.
--
-- ESTA MIGRACIÓN
--   Añade la operación inversa, que la UI ofrece como «Deshacer» inmediato
--   tras una confirmación masiva de pago:
--
--     public.revert_payment_confirmation(p_order_id BIGINT) RETURNS BOOLEAN
--
--   Devuelve true solo si revirtió algo, para que el endpoint pueda reportar
--   cuántos pedidos se revirtieron de verdad.
--
-- POR QUÉ NO HACE FALTA TOCAR EL DINERO AQUÍ
--   El trigger trg_reverse_cashback (00146) ya cubre la transición
--   `paid -> pending` y llama a reverse_cashback_on_cancel(), que revierte el
--   neto pendiente exacto (lo abonado menos lo ya revertido) y no baja el
--   saldo de 0. Es idempotente y simétrico con credit_cashback_on_payment().
--   Esta función solo hace la transición de estado; el trigger hace el resto.
--   No se reimplementa la reversión para no tener dos fuentes de verdad sobre
--   el mismo dinero.
--
-- IDEMPOTENCIA
--   El `WHERE ... AND payment_status = 'paid'` hace que reintentar el deshacer
--   sea inofensivo: la segunda llamada no encuentra fila y devuelve false.
-- ============================================================

CREATE OR REPLACE FUNCTION public.revert_payment_confirmation(p_order_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_order_id IS NULL THEN
    RETURN false;
  END IF;

  -- Solo revierte una confirmación vigente. El trigger de reversión de
  -- cashback se encarga del dinero.
  UPDATE public.orders
  SET payment_status = 'pending',
      updated_at = now()
  WHERE id = p_order_id
    AND payment_status = 'paid';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.revert_payment_confirmation(BIGINT)
  IS 'Revierte una confirmación de pago (paid -> pending), deshaciendo la confirmación masiva de pago del panel admin. El trigger trg_reverse_cashback (00146) revierte el cashback abonado. Idempotente: devuelve false si el pedido ya no estaba en paid.';

-- ============================================================
-- ACL: es una operación de dinero. Solo el service_role que usa
-- /api/admin/orders/undo-bulk (que valida la sesión de admin antes de
-- llamarla) debe poder ejecutarla.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.revert_payment_confirmation(BIGINT)
  FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.revert_payment_confirmation(BIGINT)
  TO service_role;

-- ============================================================
-- Guard de regresión: la función debe quedar inaccesible para los roles de
-- cliente. Falla la migración en vez de dejar una vía de reversión de pagos
-- abierta a usuarios autenticados.
-- ============================================================
DO $guard_acl$
DECLARE
  v_oid OID;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'revert_payment_confirmation';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'revert_payment_confirmation no existe tras crearla';
  END IF;

  IF has_function_privilege('anon', v_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION
      'revert_payment_confirmation es ejecutable por anon o authenticated: la reversión de pagos debe quedar solo en service_role';
  END IF;

  IF NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role no puede ejecutar revert_payment_confirmation';
  END IF;
END
$guard_acl$;
