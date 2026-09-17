-- ============================================================
-- 00146: Confirmar el pago es reversible (y el cashback también)
--
-- Contexto (Fase C — integridad de dinero):
--
-- 1. El panel tiene una acción masiva «Confirmar pago» que marca N pedidos
--    como `paid` y, con ello, abona cashback REAL a la wallet de N usuarios
--    (trg_credit_cashback_on_payment). No pedía confirmación y el endpoint
--    solo aceptaba `payment_status = 'paid'`, así que un clic equivocado
--    sobre una selección equivocada repartía dinero sin forma de deshacerlo.
--    Era la única acción masiva sin confirmación, y la más consecuente:
--    cancelar (que sí confirmaba) solo devuelve un cupón.
--
-- 2. Bug latente encontrado al implementar la reversión: el guard
--    anti-doble-abono de credit_cashback_on_payment() es
--    «si YA existe una transacción positiva Cashback% para esta orden,
--    no abonar». Combinado con cualquier reversión (cancelación, reembolso,
--    disputa, pago fallido), el ciclo
--        pending → paid → (reversión) → paid
--    dejaba la orden en `paid` con el cashback revertido y SIN volver a
--    abonarse nunca. El cliente perdía sus créditos en silencio, sin error.
--
-- 3. El guard anti-doble-reversión de reverse_cashback_on_cancel() era
--    `EXISTS(transacción negativa 'Reversión%')`, que bloqueaba la SEGUNDA
--    reversión legítima tras un reabono. Mismo patrón: divergencia silenciosa.
--
-- Corrección: en vez de «¿existe una transacción de tal tipo?», ambas
-- funciones calculan el NETO PENDIENTE de la orden:
--        pendiente = Σ(abonos 'Cashback%') − Σ(reversiones 'Reversión%')
--   - credit_cashback_on_payment() abona solo si pendiente <= 0.
--   - reverse_cashback_on_cancel()   revierte exactamente `pendiente`.
-- Las dos operaciones quedan idempotentes y simétricas, y el ciclo
-- pending → paid → pending → paid converge al valor correcto en cada paso.
--
-- 4. Se añade la transición `paid → pending` como causa de reversión, y se
--    sustituye el trigger sin WHEN (que disparaba en CADA update de orders)
--    por uno con WHEN, para no pagar dos agregados en updates irrelevantes.
-- ============================================================

-- ── 1. Abono de cashback: guard basado en el neto pendiente ──
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
  v_credited          NUMERIC(10,2);
  v_reversed          NUMERIC(10,2);
BEGIN
  -- Solo al pasar a 'paid' (transición pending|failed → paid)
  IF NEW.payment_status <> 'paid' OR OLD.payment_status = 'paid' THEN
    RETURN NEW;
  END IF;

  -- Órdenes anónimas o inválidas: sin cashback
  IF NEW.user_id IS NULL OR NEW.total IS NULL OR NEW.total <= 0 THEN
    RETURN NEW;
  END IF;

  -- Guard anti-doble-abono por NETO PENDIENTE (no por existencia).
  -- Si ya hay cashback vivo para esta orden, no volver a abonar; si una
  -- reversión anterior lo dejó en cero, sí hay que abonar de nuevo.
  SELECT COALESCE(SUM(amount), 0) INTO v_credited
  FROM public.wallet_transactions
  WHERE order_id = NEW.id AND amount > 0 AND concept LIKE 'Cashback%';

  SELECT COALESCE(SUM(-amount), 0) INTO v_reversed
  FROM public.wallet_transactions
  WHERE order_id = NEW.id AND amount < 0 AND concept LIKE 'Reversión%';

  IF v_credited - v_reversed > 0 THEN
    RETURN NEW;
  END IF;

  -- ── Recalcular nivel con órdenes PAGADAS (ya incluye esta orden, que
  -- acaba de pasar a paid) en hora local de México ──
  -- Nota: a diferencia del trigger BEFORE INSERT, aquí la orden actual
  -- YA está en orders con payment_status = 'paid', por lo que NO se
  -- agrega de nuevo su total.
  v_ts_local := NEW.created_at AT TIME ZONE 'America/Mexico_City';

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
    WHEN 3 THEN v_tier_name := 'Oro';      v_cashback_pct := 0.15;
    ELSE        v_tier_name := 'Diamante'; v_cashback_pct := 0.20;
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

COMMENT ON FUNCTION public.credit_cashback_on_payment()
  IS 'Abona el cashback al confirmar el pago. El guard anti-doble-abono compara el neto pendiente (abonos − reversiones), de modo que un pedido reabierto tras una reversión vuelve a acreditarse correctamente.';

-- ── 2. Reversión: monto exacto pendiente + transición paid → pending ──
CREATE OR REPLACE FUNCTION public.reverse_cashback_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wallet_id   BIGINT;
  v_credited    NUMERIC(10,2);
  v_reversed    NUMERIC(10,2);
  v_outstanding NUMERIC(10,2);
  v_reason      TEXT;
BEGIN
  -- ¿Este estado debe revertir el cashback?
  -- (El trigger ya filtra por WHEN; se repite aquí para que la función sea
  --  correcta por sí sola si algún día se llama desde otro sitio.)
  IF NOT (
    NEW.status = 'cancelled'
    OR NEW.payment_status IN ('failed', 'refunded', 'disputed')
    OR (NEW.payment_status = 'pending' AND OLD.payment_status = 'paid')
  ) THEN
    RETURN NEW;
  END IF;

  -- Revertir exactamente lo que sigue vivo, no «lo que se abonó alguna vez».
  SELECT COALESCE(SUM(amount), 0) INTO v_credited
  FROM public.wallet_transactions
  WHERE order_id = NEW.id AND amount > 0 AND concept LIKE 'Cashback%';

  SELECT COALESCE(SUM(-amount), 0) INTO v_reversed
  FROM public.wallet_transactions
  WHERE order_id = NEW.id AND amount < 0 AND concept LIKE 'Reversión%';

  v_outstanding := v_credited - v_reversed;

  -- Nada vivo que revertir: cubre tanto «nunca se abonó» (el caso de una
  -- orden pendiente que se cancela) como «ya se revirtió» (idempotencia).
  IF v_outstanding <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = NEW.user_id;
  IF v_wallet_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_reason := CASE
    WHEN NEW.payment_status = 'refunded' THEN 'Reversión cashback — pago reembolsado'
    WHEN NEW.payment_status = 'disputed' THEN 'Reversión cashback — contracargo (disputa)'
    WHEN NEW.payment_status = 'failed'   THEN 'Reversión cashback — pago fallido'
    WHEN NEW.payment_status = 'pending'  THEN 'Reversión cashback — confirmación de pago revertida'
    ELSE 'Reversión cashback — orden cancelada'
  END;

  INSERT INTO public.wallet_transactions (wallet_id, amount, concept, order_id)
  VALUES (v_wallet_id, -v_outstanding, v_reason, NEW.id);

  -- Restar del saldo (sin bajar de 0)
  UPDATE public.wallets
  SET balance_credits = GREATEST(balance_credits - v_outstanding, 0),
      updated_at = now()
  WHERE id = v_wallet_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reverse_cashback_on_cancel()
  IS 'Revierte el cashback abonado cuando la orden se cancela, el pago falla, se reembolsa, entra en disputa o la confirmación de pago se revierte (paid → pending). Revierte el neto pendiente exacto, así que es idempotente y simétrico con credit_cashback_on_payment().';

-- ── 3. El trigger solo dispara en las transiciones que importan ──
-- Antes no tenía WHEN: corría dos agregados en CADA update de orders.
DROP TRIGGER IF EXISTS trg_reverse_cashback ON public.orders;
CREATE TRIGGER trg_reverse_cashback
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (
    new.status = 'cancelled'
    OR new.payment_status IN ('failed', 'refunded', 'disputed')
    OR (new.payment_status = 'pending' AND old.payment_status = 'paid')
  )
  EXECUTE FUNCTION public.reverse_cashback_on_cancel();
