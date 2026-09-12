-- ============================================================
-- 00065: Reversión de cashback en reembolsos y contracargos
--
-- Amplía reverse_cashback_on_cancel() (migración 00027): además de
-- orden cancelada / pago fallido, revierte el cashback cuando el
-- pago queda en 'refunded' (charge.refunded) o 'disputed'
-- (charge.dispute.created / funds_withdrawn).
--
-- Sin esto, un cliente podía comprar, pedir un reembolso (o ganar
-- un contracargo) y conservar los Créditos Resurte canjeables.
-- La deduplicación por transacción 'Reversión%' ya existente evita
-- reversiones dobles cuando varios eventos golpean la misma orden.
-- ============================================================

CREATE OR REPLACE FUNCTION reverse_cashback_on_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wallet_id BIGINT;
  v_reversed  BOOLEAN;
BEGIN
  -- Solo procesar cuando la orden generó cashback
  IF NEW.cashback_credits IS NULL OR NEW.cashback_credits <= 0 THEN
    RETURN NEW;
  END IF;

  -- Solo cuando se cancela, el pago falla, se reembolsa o entra en disputa
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
    'Reversión cashback — orden cancelada, pago fallido, reembolso o disputa',
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

COMMENT ON FUNCTION reverse_cashback_on_cancel()
  IS 'Revierte el cashback generado por una orden cuando esta se cancela o su pago falla, se reembolsa o entra en disputa (00027 + 00065).';
