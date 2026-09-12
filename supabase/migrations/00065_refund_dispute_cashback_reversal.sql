-- ============================================================
-- 00065: Reembolsos y disputas — enum payment_status + reversión
--        de cashback correcta
--
-- Contexto (auditoría checkout/Stripe, sep-2026):
--
-- 1. El webhook escribía payment_status = 'amount_mismatch', valor
--    que NO existía en el enum payment_status → el UPDATE fallaba en
--    Postgres y los pedidos con monto incorrecto quedaban 'pending'
--    en silencio. Se agregan 'amount_mismatch' y 'disputed' al enum.
--
-- 2. El trigger reverse_cashback_on_cancel() (00027) solo revertía
--    al cancelar o fallar el pago. Un pedido REEMBOLSADO o con
--    CONTRACARGO conservaba sus Créditos Resurte (vector de fraude:
--    comprar → pedir reembolso → quedarse con los créditos).
--    Ahora también revierte en 'refunded' y 'disputed'.
--
-- 3. Bug preexistente corregido de paso: la función revertía usando
--    orders.cashback_credits, que desde 00029 se llena al INSERT como
--    ESTIMADO (aunque el pago nunca se confirme). Cancelar una orden
--    pendiente restaba créditos que jamás se abonaron. Ahora solo se
--    revierte si existe la transacción de abono real ('Cashback%').
-- ============================================================

-- ── 1. Nuevos valores del enum ──
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'amount_mismatch';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'disputed';

-- ── 2. Reversión de cashback: cancelación, fallo, reembolso o disputa ──
CREATE OR REPLACE FUNCTION reverse_cashback_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wallet_id BIGINT;
  v_reversed  BOOLEAN;
  v_credited  NUMERIC(10,2);
  v_reason    TEXT;
BEGIN
  -- Solo procesar cuando la orden generó cashback
  IF NEW.cashback_credits IS NULL OR NEW.cashback_credits <= 0 THEN
    RETURN NEW;
  END IF;

  -- Solo cuando se cancela, el pago falla, se reembolsa o hay disputa
  IF NEW.status <> 'cancelled'
     AND NEW.payment_status NOT IN ('failed', 'refunded', 'disputed') THEN
    RETURN NEW;
  END IF;

  -- Evitar reversión doble (buscar transacción negativa ya registrada
  -- con el mismo order_id y concepto de reversión)
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

  -- Solo revertir lo que REALMENTE se abonó. Desde 00029,
  -- orders.cashback_credits se llena al INSERT como estimado para la UI
  -- (aunque el pago nunca se confirme); sin esta guarda, cancelar una
  -- orden pendiente restaba créditos que nunca existieron.
  SELECT wt.amount INTO v_credited
  FROM public.wallet_transactions wt
  WHERE wt.order_id = NEW.id
    AND wt.amount > 0
    AND wt.concept LIKE 'Cashback%'
  ORDER BY wt.created_at DESC
  LIMIT 1;

  IF v_credited IS NULL OR v_credited <= 0 THEN
    RETURN NEW;
  END IF;

  -- Localizar la wallet del usuario
  SELECT id INTO v_wallet_id FROM public.wallets WHERE user_id = NEW.user_id;
  IF v_wallet_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_reason := CASE
    WHEN NEW.payment_status = 'refunded' THEN 'Reversión cashback — pago reembolsado'
    WHEN NEW.payment_status = 'disputed' THEN 'Reversión cashback — contracargo (disputa)'
    WHEN NEW.payment_status = 'failed'   THEN 'Reversión cashback — pago fallido'
    ELSE 'Reversión cashback — orden cancelada'
  END;

  -- Registrar transacción de reversión (negativa) por el monto abonado real
  INSERT INTO public.wallet_transactions (wallet_id, amount, concept, order_id)
  VALUES (v_wallet_id, -v_credited, v_reason, NEW.id);

  -- Restar del saldo (sin bajar de 0)
  UPDATE public.wallets
  SET balance_credits = GREATEST(balance_credits - v_credited, 0),
      updated_at = now()
  WHERE id = v_wallet_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION reverse_cashback_on_cancel()
  IS 'Revierte el cashback abonado cuando la orden se cancela, el pago falla, se reembolsa o entra en disputa. Solo revierte si existe el abono real (transacción Cashback% positiva) y con guarda anti-doble-reversión.';
