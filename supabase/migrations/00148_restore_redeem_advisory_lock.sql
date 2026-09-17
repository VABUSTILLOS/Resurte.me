-- ============================================================
-- 00148_restore_redeem_advisory_lock.sql
--
-- Cierra el último drift de migración detectado en la auditoría.
--
-- HALLAZGO
--   supabase/migrations/00035_redeem_advisory_lock.sql figura como aplicada
--   en el historial, pero su efecto nunca llegó a producción. Comparando el
--   md5 del cuerpo desplegado contra el de cada migración que define la
--   función (normalizando comentarios y espacios):
--
--     cuerpo vivo en producción      d121efacf1f920bced1fc3ee6796cdd8
--     cuerpo de 00027                d121efacf1f920bced1fc3ee6796cdd8  <-- idénticos
--     cuerpo de 00035                c0c82cc600a60e9c8ea8aba85913b276  <-- nunca aplicado
--
--   Verificado contra la base viva: pg_advisory_xact_lock AUSENTE,
--   SELECT ... FOR UPDATE presente. Producción corría la versión de 00027.
--
-- ALCANCE REAL DEL PROBLEMA (sin exagerar)
--   La versión viva NO era incorrecta. El SELECT ... FOR UPDATE sobre la fila
--   del monedero ya serializa los canjes concurrentes del mismo usuario: bajo
--   READ COMMITTED, la segunda transacción queda bloqueada y al despertar
--   vuelve a leer el saldo ya debitado, por lo que el CHECK de saldo la ataja.
--   Lo que faltaba era la segunda capa que 00035 documenta: el advisory lock
--   por (user_id, service_id), que serializa el canje ANTES de tocar la fila
--   del monedero. En una ruta de dinero se prefiere la defensa en profundidad
--   y, sobre todo, que el historial de migraciones no mienta: dejar una
--   migración registrada cuyo efecto no existe hace que la próxima auditoría
--   vuelva a reportar el mismo hallazgo.
--
-- ESTA MIGRACIÓN
--   1. Re-aplica el cuerpo de 00035 verbatim.
--   2. Re-afirma el ACL (mitigación de IDOR de 00027): redeem_service() es
--      SECURITY DEFINER y no valida auth.uid() = p_user_id, así que EXECUTE
--      debe quedar restringido al service_role que usa /api/redeem.
--   3. Re-ejecuta el guard de search_path que impide que vuelva a colarse una
--      función con search_path='' que referencie tablas de public sin
--      calificar (el defecto que rompió process_cashback_for_order y
--      process_referral_reward, corregido en 00147).
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
    RETURN;
  END IF;
  IF p_service_id IS NULL OR p_service_name IS NULL OR p_cost <= 0 THEN
    error_msg := 'Datos del servicio inválidos';
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
