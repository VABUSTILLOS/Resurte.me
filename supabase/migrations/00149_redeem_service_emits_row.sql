-- ============================================================
-- 00149_redeem_service_emits_row.sql
--
-- Arregla el canje de créditos: la función devolvía CERO filas.
--
-- HALLAZGO (encontrado al validar 00148 contra la base viva)
--   public.redeem_service() está declarada RETURNS TABLE, es decir
--   RETURNS SETOF record. En PL/pgSQL un `RETURN;` sin expresión en una
--   función SETOF NO emite ninguna fila: sólo termina la función. Para
--   emitir una fila hace falta `RETURN NEXT`.
--
--   El cuerpo (idéntico en este punto en 00027 y 00035) cerraba sus CUATRO
--   salidas con `RETURN;`. Consecuencia: la función debitaba el monedero,
--   insertaba la transacción y creaba la redención, y devolvía 0 filas.
--
--   El llamador src/lib/wallet-actions.ts (redeemCredits) hace:
--     const result = data?.[0]
--     if (!result?.success) return { success: false, error: ... }
--   Con 0 filas, `result` es undefined, así que el usuario recibía
--   "No se pudo completar el canje" DESPUÉS de que se le hubieran debitado
--   los créditos. Pérdida silenciosa de saldo desde la perspectiva del
--   usuario: el error invita a reintentar, y el reintento cae en la
--   deduplicación de 5 minutos o debita un servicio distinto.
--
--   Verificado contra la base viva:
--     SELECT count(*) FROM public.redeem_service(...) -> 0  (saldo 500 -> 200)
--     pg_temp.t_ret()  (RETURN;)      -> 0 filas
--     pg_temp.t_next() (RETURN NEXT;) -> 1 fila
--
--   Nunca se disparó en producción: redemptions = 0, wallet_transactions
--   con concept 'Canje:%' = 0, wallets con saldo > 0 = 0. El primer canje
--   real habría fallado.
--
--   Alcance: es la ÚNICA de las 800 funciones de public con este defecto
--   (RETURNS TABLE + `RETURN;` y sin `RETURN NEXT`/`RETURN QUERY`).
--
-- ESTA MIGRACIÓN
--   1. Recrea redeem_service() conservando íntegro el cuerpo de 00148
--      (advisory lock por user_id+service_id y SELECT ... FOR UPDATE) y
--      cambiando cada `RETURN;` terminal por `RETURN NEXT;` + `RETURN;`.
--      En las salidas tempranas hacen falta las DOS: `RETURN NEXT` emite la
--      fila pero NO corta la ejecución, así que sin el `RETURN` siguiente el
--      flujo continuaría hacia el débito del monedero.
--   2. Re-afirma el ACL de 00027 (sólo service_role).
--   3. Guards de regresión: search_path sin calificar (00147) y funciones
--      RETURNS TABLE que nunca emiten fila (nuevo en esta migración).
-- ============================================================

CREATE OR REPLACE FUNCTION public.redeem_service(
  p_user_id UUID,
  p_service_id TEXT,
  p_service_name TEXT,
  p_cost DECIMAL(10,2)
)
RETURNS TABLE (
  success BOOLEAN,
  new_balance DECIMAL(10,2),
  redemption_id BIGINT,
  error_msg TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wallet_id  BIGINT;
  v_balance    DECIMAL(10,2);
  v_redemption BIGINT;
  v_lock_key   BIGINT;
BEGIN
  success := false;
  new_balance := 0;
  redemption_id := NULL;
  error_msg := NULL;

  -- Validar inputs
  IF p_user_id IS NULL THEN
    error_msg := 'Usuario no autenticado';
    RETURN NEXT;
    RETURN;
  END IF;
  IF p_service_id IS NULL OR p_service_name IS NULL OR p_cost <= 0 THEN
    error_msg := 'Datos del servicio inválidos';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Lock advisory de transacción por (user_id, service_id):
  -- serializa canjes concurrentes del mismo usuario+servicio.
  -- hashtextextended(service_id, 0) como parte baja de la clave.
  v_lock_key := hashtextextended(p_user_id::TEXT || ':' || p_service_id, 0);
  PERFORM pg_advisory_xact_lock(v_lock_key);

  -- Asegurar que existe el monedero
  INSERT INTO public.wallets (user_id, balance_credits)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- FOR UPDATE: bloquea la fila para evitar dobles débitos concurrentes
  -- de DISTINTOS servicios. Sin el lock, dos canjes simultáneos pueden
  -- pasar el check de saldo y el segundo UPDATE violaría el CHECK.
  SELECT id, balance_credits INTO v_wallet_id, v_balance
  FROM public.wallets WHERE user_id = p_user_id
  FOR UPDATE;

  -- Validar saldo suficiente
  IF v_balance IS NULL OR v_balance < p_cost THEN
    error_msg := 'Saldo insuficiente';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Registrar la transacción de débito (negativa)
  INSERT INTO public.wallet_transactions (wallet_id, amount, concept, order_id)
  VALUES (v_wallet_id, -p_cost, 'Canje: ' || p_service_name, NULL);

  -- Actualizar saldo
  UPDATE public.wallets
  SET balance_credits = balance_credits - p_cost,
      updated_at = now()
  WHERE id = v_wallet_id;

  -- Registrar el servicio canjeado
  INSERT INTO public.redemptions (user_id, service_id, service_name, cost_credits, concept)
  VALUES (p_user_id, p_service_id, p_service_name, p_cost, 'Canje: ' || p_service_name)
  RETURNING id INTO v_redemption;

  success := true;
  new_balance := v_balance - p_cost;
  redemption_id := v_redemption;
  RETURN NEXT;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.redeem_service(UUID, TEXT, TEXT, DECIMAL)
  IS 'Canjea créditos Resurte por un servicio de la Tienda de Crecimiento. Debita el monedero, registra la transacción y crea el registro en redemptions. Usa pg_advisory_xact_lock (user_id+service_id) y FOR UPDATE para serializar débitos concurrentes.';

-- ============================================================
-- 2. ACL: re-afirmar la mitigación de IDOR de 00027.
--    redeem_service() es SECURITY DEFINER y NO valida auth.uid() = p_user_id,
--    así que sólo el service_role (el cliente que usa /api/redeem, que sí
--    valida la sesión real) debe poder ejecutarla.
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.redeem_service(UUID, TEXT, TEXT, DECIMAL)
  FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.redeem_service(UUID, TEXT, TEXT, DECIMAL)
  TO service_role;

-- ============================================================
-- 3. Guard de regresión: ninguna función con search_path vacío puede
--    referenciar una tabla de public sin calificar. Falla la migración
--    en vez de dejar el bug latente en producción.
-- ============================================================
DO $guard$
DECLARE
  v_offenders TEXT;
BEGIN
  WITH fns AS (
    SELECT p.proname, p.prosrc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c
        WHERE replace(c, ' ', '') IN ('search_path=', 'search_path=""')
      )
  ),
  hits AS (
    SELECT DISTINCT f.proname, m[1] AS target
    FROM fns f
    CROSS JOIN LATERAL regexp_matches(
      regexp_replace(
        regexp_replace(f.prosrc, '''[^'']*''', '', 'gn'),
        '--.*', '', 'gn'
      ),
      '(?i)(?:from|join|into|update)[[:space:]]+(?!public\.)([a-z_][a-z0-9_]*)',
      'g'
    ) AS m
  )
  SELECT string_agg(DISTINCT h.proname || ' -> ' || h.target, ', ')
  INTO v_offenders
  FROM hits h
  JOIN pg_tables t ON t.schemaname = 'public' AND t.tablename = h.target;

  IF v_offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'Funciones con search_path vacío que referencian tablas public sin calificar: %',
      v_offenders;
  END IF;
END
$guard$;

-- ============================================================
-- 4. Guard de regresión: ninguna función RETURNS TABLE puede quedarse sin
--    emitir filas. Si usa `RETURN;` y no tiene ningún `RETURN NEXT` ni
--    `RETURN QUERY`, siempre devuelve 0 filas. Falla la migración en vez de
--    dejar el bug latente en producción.
-- ============================================================
DO $guard_rows$
DECLARE
  v_offenders TEXT;
BEGIN
  SELECT string_agg(DISTINCT p.proname, ', ')
  INTO v_offenders
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  CROSS JOIN LATERAL (
    SELECT regexp_replace(
             regexp_replace(p.prosrc, '''[^'']*''', '', 'gn'),
             '--.*', '', 'gn'
           ) AS body
  ) s
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_function_result(p.oid) LIKE 'TABLE%'
    AND s.body ~ '\mRETURN\s*;'
    AND s.body !~* '\mRETURN\s+NEXT\M'
    AND s.body !~* '\mRETURN\s+QUERY\M';

  IF v_offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'Funciones RETURNS TABLE que nunca emiten fila (RETURN; sin RETURN NEXT/QUERY): %',
      v_offenders;
  END IF;
END
$guard_rows$;
