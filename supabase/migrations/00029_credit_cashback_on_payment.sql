-- ============================================================
-- Resurte.me — Cashback SOLO al confirmarse el pago
--
-- Corrige dos vulnerabilidades de 00026 (y un detalle de timezone):
--
--   1. ANTES (00026): el trigger process_cashback_for_order() era
--      BEFORE INSERT y abonaba la wallet en el momento de CREAR la
--      orden (payment_status = 'pending'), sin que existiera pago.
--      Vector de abuso: crear N órdenes sin pagar (abandonar el
--      modal de Stripe, o SPEI/OXXO/COD sin cobro real) acumulaba
--      créditos canjeables.
--      AHORA: al INSERT solo se calcula y guarda la metadata
--      (week_of_month, month_year, cashback_credits/tier estimados
--      para la UI de pedido-confirmado). El abono REAL a la wallet
--      ocurre en un nuevo trigger AFTER UPDATE cuando
--      payment_status pasa a 'paid'.
--
--   2. ANTES: el CTE weekly_spend filtraba solo o.status <> 'cancelled'
--      → contaba órdenes pending/failed NO pagadas para subir de nivel
--      (abuso a Diamante 20% sin pagar).
--      AHORA: filtra o.payment_status = 'paid' AND o.status <> 'cancelled'
--      → el nivel solo sube con compras realmente pagadas.
--
--   3. Timezone: semana/mes se calculan con America/Mexico_City.
--
-- Nota: órdenes pendientes creadas ANTES de esta migración ya tienen
-- cashback abonado bajo el comportamiento anterior. Este script NO los
-- revierte automáticamente (requiere decisión de negocio). Sí previene
-- el abuso para todas las órdenes nuevas.
-- ============================================================

-- ============================================================
-- 1. TRIGGER BEFORE INSERT: solo calcula metadata (NO abona wallet)
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

-- ============================================================
-- 2. TRIGGER AFTER UPDATE: abonar cashback REAL al confirmar pago
-- ============================================================
CREATE OR REPLACE FUNCTION public.credit_cashback_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_qualifying_weeks  INTEGER;
  v_cashback_pct      NUMERIC(5,2);
  v_cashback_amt      NUMERIC(10,2);
  v_tier_name         TEXT;
  v_wallet_id         BIGINT;
  v_ts_local          TIMESTAMP;
BEGIN
  -- Solo al pasar a 'paid' (transición pending|failed → paid)
  IF NEW.payment_status <> 'paid' OR OLD.payment_status = 'paid' THEN
    RETURN NEW;
  END IF;

  -- Órdenes anónimas o inválidas: sin cashback
  IF NEW.user_id IS NULL OR NEW.total IS NULL OR NEW.total <= 0 THEN
    RETURN NEW;
  END IF;

  -- Guard anti-doble-abono: si ya existe una transacción POSITIVA de
  -- cashback para esta orden, no abonar de nuevo.
  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    WHERE wt.order_id = NEW.id
      AND wt.amount > 0
      AND wt.concept LIKE 'Cashback%'
  ) THEN
    RETURN NEW;
  END IF;

  -- ── Recalcular nivel con órdenes PAGADAS (ya incluye esta orden, que
  -- acaba de pasar a paid) en hora local de México ──
  -- Nota: a diferencia del trigger BEFORE INSERT, aquí la orden actual
  -- YA está en orders con payment_status = 'paid', por lo que NO se
  -- agrega de nuevo su total.
  v_ts_local     := NEW.created_at AT TIME ZONE 'America/Mexico_City';

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
  )
  SELECT COUNT(*) INTO v_qualifying_weeks
  FROM weekly_spend
  WHERE spend >= 2500;

  CASE v_qualifying_weeks
    WHEN 0 THEN v_tier_name := 'Verde';    v_cashback_pct := 0.05;
    WHEN 1 THEN v_tier_name := 'Verde';    v_cashback_pct := 0.05;
    WHEN 2 THEN v_tier_name := 'Plata';    v_cashback_pct := 0.10;
    WHEN 3 THEN v_tier_name := 'Oro';       v_cashback_pct := 0.15;
    ELSE        v_tier_name := 'Diamante';  v_cashback_pct := 0.20;
  END CASE;

  v_cashback_amt := ROUND(NEW.total * v_cashback_pct, 2);

  -- ── Actualizar la metadata de la orden al valor REAL abonado ──
  UPDATE public.orders
  SET cashback_credits = v_cashback_amt,
      cashback_tier    = v_tier_name
  WHERE id = NEW.id;

  -- ── Asegurar que el monedero existe ──
  INSERT INTO public.wallets (user_id, balance_credits)
  VALUES (NEW.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = NEW.user_id;

  -- ── Registrar transacción de abono ──
  INSERT INTO public.wallet_transactions (wallet_id, amount, concept, order_id)
  VALUES (
    v_wallet_id,
    v_cashback_amt,
    'Cashback Nivel ' || v_tier_name || ' (' || (v_cashback_pct * 100)::INTEGER || '%)',
    NEW.id
  );

  -- ── Actualizar saldo del monedero ──
  UPDATE public.wallets
  SET balance_credits = balance_credits + v_cashback_amt,
      updated_at = now()
  WHERE id = v_wallet_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_cashback_on_payment ON orders;

CREATE TRIGGER trg_credit_cashback_on_payment
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION credit_cashback_on_payment();

COMMENT ON TRIGGER trg_credit_cashback_on_payment ON orders
  IS 'Abona los Créditos Resurte a la wallet SOLO cuando el pago de la orden se confirma (payment_status pasa a paid). Nivel por semanas calificadas con compras PAGADAS (>= $2,500 MXN por semana ISO del mes en America/Mexico_City).';

COMMENT ON FUNCTION public.credit_cashback_on_payment()
  IS 'Abona el cashback a la wallet del usuario cuando el pago de la orden se confirma. Incluye guard anti-doble-abono y recalcula el nivel solo con órdenes pagadas.';

-- ============================================================
-- 3. REVERSIÓN: solo revierte si el cashback REALMENTE se abonó
-- ============================================================
-- Con el nuevo flujo, una orden puede tener cashback_credits calculados
-- (estimados) pero nunca abonados (pago no confirmado). La reversión
-- debe exigir que exista una transacción POSITIVA de cashback para esa
-- orden; si el pago nunca se confirmó, no hay nada que revertir.
CREATE OR REPLACE FUNCTION public.reverse_cashback_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wallet_id BIGINT;
  v_reversed  BOOLEAN;
  v_credited  BOOLEAN;
BEGIN
  -- Solo procesar cuando la orden generó cashback
  IF NEW.cashback_credits IS NULL OR NEW.cashback_credits <= 0 THEN
    RETURN NEW;
  END IF;

  -- Solo cuando se cancela o el pago falla
  IF NEW.status <> 'cancelled' AND NEW.payment_status <> 'failed' THEN
    RETURN NEW;
  END IF;

  -- El cashback debe haberse abonado REALMENTE (transacción positiva).
  -- Si el pago nunca se confirmó, no hay créditos que revertir.
  SELECT EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    WHERE wt.order_id = NEW.id
      AND wt.amount > 0
      AND wt.concept LIKE 'Cashback%'
  ) INTO v_credited;

  IF NOT v_credited THEN
    RETURN NEW;
  END IF;

  -- Evitar reversión doble (buscar transacción negativa ya registrada)
  SELECT EXISTS (
    SELECT 1
    FROM public.wallet_transactions wt
    WHERE wt.order_id = NEW.id
      AND wt.amount < 0
      AND wt.concept LIKE 'Reversión%'
  ) INTO v_reversed;

  IF v_reversed THEN
    RETURN NEW;
  END IF;

  -- Localizar la wallet del usuario
  SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = NEW.user_id;
  IF v_wallet_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Registrar transacción de reversión (negativa)
  INSERT INTO public.wallet_transactions (wallet_id, amount, concept, order_id)
  VALUES (
    v_wallet_id,
    -NEW.cashback_credits,
    'Reversión cashback — orden cancelada o pago fallido',
    NEW.id
  );

  -- Restar del saldo (sin bajar de 0)
  UPDATE public.wallets
  SET balance_credits = GREATEST(balance_credits - NEW.cashback_credits, 0),
      updated_at = now()
  WHERE id = v_wallet_id;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 4. COMENTARIOS ACTUALIZADOS
-- ============================================================
COMMENT ON TRIGGER trg_cashback_on_order ON orders
  IS 'Calcula y guarda la metadata de cashback estimada al crear la orden. El abono real a la wallet ocurre en trg_credit_cashback_on_payment cuando el pago se confirma.';

COMMENT ON COLUMN orders.cashback_credits
  IS 'Créditos Resurte de esta orden. Estimados al crear la orden; el valor REAL (con nivel final) se fija al confirmarse el pago.';

COMMENT ON COLUMN orders.week_of_month
  IS 'Semana ISO del mes en que se realizó la compra (America/Mexico_City).';

COMMENT ON COLUMN orders.month_year
  IS 'Mes/año de la compra en formato YYYY-MM (America/Mexico_City).';
