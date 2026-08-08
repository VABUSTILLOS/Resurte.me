-- ============================================================
-- 00035_redeem_advisory_lock.sql
--
-- Cierra la race condition de doble-débito en canjes:
--   El dedupe de 5 min del route (/api/redeem) cubre clics secuenciales,
--   pero dos peticiones SIMULTÁNEAS podían pasar el check antes de que
--   ninguna commiteara y ambas debitarían.
--
-- Fix: pg_advisory_xact_lock serializa el canje por (user_id, service_id).
-- La segunda petición espera a que la primera commitee y, al despertar,
-- ya no hay saldo suficiente (o el check de la app la ataja).
-- El lock es de transacción (xact), así que se libera automáticamente
-- al commit/rollback — sin riesgo de locks huérfanos.
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
