-- ============================================================
-- Resurte.me — Restauración de los triggers de dinero rotos
-- ============================================================
-- MOTIVO (auditoría de drift migración-vs-producción):
--
-- 1) public.process_cashback_for_order()  (BEFORE INSERT ON orders)
--    Producción ejecutaba la versión de 00010/00026, NO la de 00029,
--    pese a que 00029 figura como aplicada en schema_migrations.
--    Esa versión declara `SET search_path = ''` pero referencia
--    `orders`, `wallets` y `wallet_transactions` SIN calificar. Con
--    search_path vacío Postgres resuelve contra un esquema vacío:
--        ERROR: 42P01: relation "orders" does not exist
--    Consecuencia: todo INSERT en orders con total >= 2500 devolvía
--    HTTP 500 — el checkout estaba roto para carritos >= $2,500 MXN.
--    Además abonaba cashback REAL al crear la orden (antes de cobrar),
--    que es exactamente el vector de abuso que 00029 vino a cerrar, y
--    calculaba el nivel contando órdenes NO pagadas (inflando el nivel).
--
-- 2) public.process_referral_reward()  (AFTER UPDATE ON orders)
--    Declara `SET search_path = ''` y referencia `profiles`, `orders`,
--    `wallets` y `wallet_transactions` SIN calificar. Como
--    trg_referral_reward no tenía cláusula WHEN, se ejecutaba en TODA
--    actualización de orders y reventaba en su primera consulta:
--        ERROR: 42P01: relation "profiles" does not exist
--    Consecuencia: la transición a 'confirmed' (confirmar pedido)
--    devolvía HTTP 500.
--
-- 3) Doble recompensa por referido. El guard `v_order_count` sólo
--    cuenta órdenes en estados "vivos", así que cancelar y volver a
--    confirmar la misma orden — o confirmar una segunda orden tras
--    cancelar la primera — volvía a pagar $100. Se hace la recompensa
--    única por usuario referido.
--
-- NO se toca credit_cashback_on_payment() ni reverse_cashback_on_cancel():
-- se definieron en 00146 y ya coinciden con producción.
-- ============================================================

-- ============================================================
-- 1. BEFORE INSERT: sólo calcula metadata (NO abona wallet)
--    Restaura el cuerpo de 00029 (calificado + sólo órdenes pagadas).
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_cashback_for_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_week      INTEGER;
  v_qualifying_weeks  INTEGER;
  v_cashback_pct      NUMERIC(5,2);
  v_cashback_amt      NUMERIC(10,2);
  v_tier_name         TEXT;
  v_ts_local          TIMESTAMP;
BEGIN
  -- ── Metadata de semana/mes en hora local de México ──
  v_ts_local     := NEW.created_at AT TIME ZONE 'America/Mexico_City';
  v_current_week := EXTRACT(WEEK FROM v_ts_local)::INTEGER;
  NEW.week_of_month := v_current_week;
  NEW.month_year    := TO_CHAR(v_ts_local, 'YYYY-MM');

  -- ── Evitar doble procesamiento ──
  IF NEW.cashback_credits IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- ── Órdenes anónimas o inválidas: sin cashback ni wallet ──
  IF NEW.user_id IS NULL OR NEW.total IS NULL OR NEW.total <= 0 THEN
    RETURN NEW;
  END IF;

  -- ── Semanas calificadas del mes (solo órdenes PAGADAS + la actual) ──
  -- El nivel se estima aquí para mostrarlo en pedido-confirmado; el
  -- abono real se decide en credit_cashback_on_payment() al confirmarse
  -- el pago, que recalcula con la misma lógica.
  WITH weekly_spend AS (
    SELECT
      EXTRACT(WEEK FROM (o.created_at AT TIME ZONE 'America/Mexico_City'))::INTEGER AS week_num,
      SUM(o.total) AS spend
    FROM public.orders o
    WHERE o.user_id = NEW.user_id
      AND DATE_TRUNC('month', o.created_at AT TIME ZONE 'America/Mexico_City')
          = DATE_TRUNC('month', v_ts_local)
      AND o.payment_status = 'paid'
      AND o.status <> 'cancelled'
    GROUP BY EXTRACT(WEEK FROM (o.created_at AT TIME ZONE 'America/Mexico_City'))::INTEGER
  ),
  with_current AS (
    SELECT
      week_num,
      CASE WHEN week_num = v_current_week THEN spend + NEW.total ELSE spend END AS spend
    FROM weekly_spend
    UNION ALL
    SELECT v_current_week, NEW.total
    WHERE NOT EXISTS (SELECT 1 FROM weekly_spend WHERE week_num = v_current_week)
  )
  SELECT COUNT(*) INTO v_qualifying_weeks
  FROM with_current
  WHERE spend >= 2500;

  -- ── Asignar nivel según semanas calificadas ──
  CASE v_qualifying_weeks
    WHEN 0 THEN v_tier_name := 'Verde';    v_cashback_pct := 0.05;
    WHEN 1 THEN v_tier_name := 'Verde';    v_cashback_pct := 0.05;
    WHEN 2 THEN v_tier_name := 'Plata';    v_cashback_pct := 0.10;
    WHEN 3 THEN v_tier_name := 'Oro';       v_cashback_pct := 0.15;
    ELSE        v_tier_name := 'Diamante';  v_cashback_pct := 0.20;
  END CASE;

  -- ── Calcular créditos estimados (todas las compras generan cashback) ──
  v_cashback_amt := ROUND(NEW.total * v_cashback_pct, 2);

  -- ── Grabar metadata en la orden (sin tocar wallets) ──
  NEW.cashback_credits := v_cashback_amt;
  NEW.cashback_tier    := v_tier_name;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.process_cashback_for_order() IS
  'BEFORE INSERT en orders. Sólo calcula metadata de cashback (estimado de créditos, nivel, semana y mes en hora de México). NO abona wallet: el abono real ocurre en credit_cashback_on_payment() al confirmarse el pago. Todas las tablas deben ir calificadas con public. porque la función corre con search_path vacío.';

-- ============================================================
-- 2. AFTER UPDATE: recompensa por referido
--    Califica todas las tablas y hace la recompensa única por referido.
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_referral_reward()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referrer_id UUID;
  v_order_count INTEGER;
  v_wallet_id   BIGINT;
  v_reward_amount NUMERIC(10,2) := 100.00;
  v_concept     TEXT;
BEGIN
  -- Solo procesar cuando status cambia a 'confirmed'
  IF NEW.status <> 'confirmed' OR OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Verificar que el usuario fue referido
  SELECT referred_by INTO v_referrer_id FROM public.profiles WHERE id = NEW.user_id;
  IF v_referrer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Verificar que sea la primera compra del referido
  SELECT COUNT(*) INTO v_order_count FROM public.orders
  WHERE user_id = NEW.user_id
    AND id <> NEW.id
    AND status IN ('confirmed', 'preparing', 'out_for_delivery', 'delivered');

  IF v_order_count > 0 THEN
    RETURN NEW; -- No es primera compra, no premiar
  END IF;

  -- La recompensa se paga UNA sola vez por usuario referido: si la orden
  -- se cancela y se vuelve a confirmar (o si el referido confirma otra
  -- orden tras cancelar la primera), v_order_count vuelve a dar 0 y se
  -- pagaría de nuevo. El concepto identifica de forma única al referido.
  v_concept := 'Recompensa por referido — Usuario #' || NEW.user_id::TEXT;

  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    JOIN public.wallets w ON w.id = wt.wallet_id
    WHERE w.user_id = v_referrer_id
      AND wt.concept = v_concept
  ) THEN
    RETURN NEW; -- Ya se pagó esta recompensa
  END IF;

  -- Asegurar que el monedero del referidor existe
  INSERT INTO public.wallets (user_id, balance_credits)
  VALUES (v_referrer_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = v_referrer_id;

  -- Registrar transacción de recompensa
  INSERT INTO public.wallet_transactions (wallet_id, amount, concept, order_id)
  VALUES (v_wallet_id, v_reward_amount, v_concept, NEW.id);

  -- Actualizar saldo
  UPDATE public.wallets
  SET balance_credits = balance_credits + v_reward_amount,
      updated_at = now()
  WHERE id = v_wallet_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.process_referral_reward() IS
  'AFTER UPDATE en orders. Paga $100 MXN de créditos al referidor en la primera compra confirmada del referido. Idempotente: una recompensa por usuario referido (identificada por el concepto). Todas las tablas deben ir calificadas con public. porque la función corre con search_path vacío.';

-- Índice de apoyo para el guard de idempotencia (lookup por concepto).
CREATE INDEX IF NOT EXISTS idx_wallet_tx_referral_reward
  ON public.wallet_transactions (wallet_id, concept);

-- ============================================================
-- 3. El trigger sólo necesita dispararse en la transición a 'confirmed'.
--    Antes se ejecutaba en TODA actualización de orders (sin WHEN).
-- ============================================================
DROP TRIGGER IF EXISTS trg_referral_reward ON public.orders;

CREATE TRIGGER trg_referral_reward
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (new.status = 'confirmed' AND old.status IS DISTINCT FROM 'confirmed')
  EXECUTE FUNCTION public.process_referral_reward();

COMMENT ON TRIGGER trg_referral_reward ON public.orders IS
  'Paga la recompensa por referido cuando la orden pasa a confirmed. El WHEN evita ejecutar la función en cada UPDATE de orders.';

-- ============================================================
-- 4. Guard de regresión: ninguna función con search_path vacío puede
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
