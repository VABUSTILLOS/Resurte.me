-- ============================================================
-- Resurte.me — Reversión de cashback + canje de créditos real
--
-- 1. Reversión de cashback: si una orden se CANCELA o su pago
--    FALLA después de haber generado cashback, los créditos se
--    revierten (transacción negativa + resta de saldo).
-- 2. Tabla redemptions: registro real de servicios canjeados
--    con créditos del monedero (débito real).
-- ============================================================

-- ============================================================
-- 1. REVERSIÓN DE CASHBACK AL CANCELAR / PAGO FALLIDO
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

  -- Solo cuando se cancela o el pago falla
  IF NEW.status <> 'cancelled' AND NEW.payment_status <> 'failed' THEN
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

DROP TRIGGER IF EXISTS trg_reverse_cashback ON orders;

CREATE TRIGGER trg_reverse_cashback
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION reverse_cashback_on_cancel();

COMMENT ON TRIGGER trg_reverse_cashback ON orders
  IS 'Revierte el cashback generado por una orden cuando esta se cancela o su pago falla.';

-- ============================================================
-- 2. TABLA REDEMPTIONS — registro de servicios canjeados
-- ============================================================

CREATE TABLE IF NOT EXISTS redemptions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_id    TEXT NOT NULL,
  service_name  TEXT NOT NULL,
  cost_credits  DECIMAL(10,2) NOT NULL CHECK (cost_credits > 0),
  concept       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE redemptions
  IS 'Servicios de la Tienda de Crecimiento canjeados con Créditos Resurte.';

CREATE INDEX IF NOT EXISTS idx_redemptions_user ON redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_redemptions_created ON redemptions(created_at DESC);

-- ============================================================
-- 3. RLS PARA redemptions
-- ============================================================

ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can view own redemptions' AND tablename = 'redemptions'
  ) THEN
    CREATE POLICY "Users can view own redemptions" ON redemptions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END;
$$;

-- ============================================================
-- 4. FUNCIÓN: redeem_service() — canje con débito real
-- ============================================================

-- Debita créditos del monedero, registra la transacción y crea
-- el registro del servicio canjeado. SECURITY DEFINER para que el
-- service role pueda ejecutarla de forma atómica.
CREATE OR REPLACE FUNCTION redeem_service(
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

  -- Asegurar que existe el monedero
  INSERT INTO public.wallets (user_id, balance_credits)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- FOR UPDATE: bloquea la fila para evitar dobles débitos concurrentes.
  -- Sin el lock, dos canjes simultáneos pueden pasar el check de saldo y el
  -- segundo UPDATE violaría el CHECK (balance_credits >= 0).
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

COMMENT ON FUNCTION redeem_service(UUID, TEXT, TEXT, DECIMAL)
  IS 'Canjea créditos Resurte por un servicio de la Tienda de Crecimiento. Debita el monedero, registra la transacción y crea el registro en redemptions. Retorna el nuevo saldo.';

-- ============================================================
-- 5. SEGURIDAD: restringir ejecución SOLO al service_role
-- ============================================================
-- Por defecto, PostgREST expone las funciones a los roles anon/authenticated.
-- redeem_service() es SECURITY DEFINER y NO valida auth.uid() = p_user_id,
-- así que cualquier usuario autenticado podría debitar el monedero de OTRO
-- usuario (IDOR) llamando select redeem_service('<user_id_ajeno>', ...).
-- Al revocar EXECUTE de anon/authenticated/public, la función solo queda
-- disponible para el service_role (el que usa /api/redeem), que ya valida
-- la sesión real del usuario antes de invocarla.
REVOKE EXECUTE ON FUNCTION public.redeem_service(UUID, TEXT, TEXT, DECIMAL)
  FROM anon, authenticated, public;

-- Asegurar explícitamente que el service_role (cliente de /api/redeem)
-- conserva el permiso de ejecución.
GRANT EXECUTE ON FUNCTION public.redeem_service(UUID, TEXT, TEXT, DECIMAL)
  TO service_role;
