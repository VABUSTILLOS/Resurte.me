-- ============================================================
-- 00036_cashback_wallet_lock.sql
--
-- Defense-in-depth: toma FOR UPDATE en la fila del monedero dentro
-- del trigger de abono de cashback.
--
-- Contexto: el UPDATE de saldo ya es atómico (balance_credits + x)
-- y el row lock de `orders` serializa triggers del mismo pedido,
-- así que no hay corrupción de saldo. Pero dos pagos de PEDIDOS
-- DISTINTOS del mismo usuario pueden leerse la misma fila de wallet
-- a la vez; FOR UPDATE las serializa y protege ante futuros
-- refactors no-atómicos (read-modify-write).
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

  -- FOR UPDATE: serializa abonos concurrentes al mismo monedero.
  SELECT id INTO v_wallet_id FROM public.wallets
  WHERE user_id = NEW.user_id
  FOR UPDATE;

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
