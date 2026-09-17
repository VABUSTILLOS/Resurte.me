-- ============================================================
-- 00132_wallet_credit_expiry.sql  (ronda de mejoras, fase M7a / R17)
--
-- Caducidad de los Créditos Resurte. Hasta ahora `wallet_transactions`
-- solo sabía de importes: un abono vivía en el monedero para siempre y
-- el negocio asumía un pasivo que crecía sin techo.
--
-- Regla: todo abono (amount > 0) caduca a los 12 meses de su creación.
-- El aviso previo (30 días antes) y la baja del saldo llegan en la
-- migración siguiente (`expire_wallet_credits` + pg_cron); aquí solo se
-- marca la fecha y se deja el terreno idempotente.
--
-- Invariantes que respeta:
--   · Ningún débito (canje, reverso) recibe caducidad: solo se consume.
--   · Introducir la política NO confisca lo ya acumulado: el backfill
--     regala a los lotes existentes la ventana completa desde el
--     despliegue, en vez de aplicarla retroactivamente.
--   · El saldo (`wallets.balance_credits`) no se toca en esta migración.
--
-- La caducidad NO se puede resolver con un DEFAULT de columna: el
-- DEFAULT también aplicaría a los débitos, que no caducan. De ahí el
-- trigger BEFORE INSERT, que solo actúa cuando hay abono y no se ha
-- fijado fecha explícita.
-- ============================================================

-- ============================================================
-- 1. COLUMNAS DE CADUCIDAD
-- ============================================================
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS expires_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expiry_settled_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.wallet_transactions.expires_at IS
  'Cuándo caducan los créditos de este abono (12 meses desde su creación). NULL en débitos.';
COMMENT ON COLUMN public.wallet_transactions.expiry_settled_at IS
  'Cuándo el job de caducidad ya revisó este lote. Da idempotencia incluso si el lote vencido no tenía restante.';

-- ============================================================
-- 2. TRIGGER: fija la caducidad de los abonos nuevos
-- ============================================================
-- Sin SECURITY DEFINER: la función solo muta NEW, no lee ni escribe
-- tablas, así que no necesita privilegios elevados.
CREATE OR REPLACE FUNCTION public.set_wallet_credit_expiry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- `created_at` ya trae su DEFAULT aplicado en un BEFORE INSERT; el
  -- COALESCE cubre el caso de un INSERT que lo pase explícitamente NULL.
  IF NEW.amount > 0 AND NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.created_at, now()) + INTERVAL '12 months';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_credit_expiry ON public.wallet_transactions;

CREATE TRIGGER trg_wallet_credit_expiry
  BEFORE INSERT ON public.wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_wallet_credit_expiry();

COMMENT ON TRIGGER trg_wallet_credit_expiry ON public.wallet_transactions IS
  'Asigna expires_at a los abonos (amount > 0). Los débitos nunca caducan.';

-- ============================================================
-- 3. BACKFILL (sin confiscar lo ya acumulado)
-- ============================================================
-- A un lote viejo se le da la ventana completa desde el despliegue, no
-- desde su creación: aplicar la política retroactivamente vaciaría de
-- golpe el saldo de quien no ha canjeado en un año.
UPDATE public.wallet_transactions
SET expires_at = GREATEST(
      created_at + INTERVAL '12 months',
      now() + INTERVAL '12 months'
    )
WHERE amount > 0
  AND expires_at IS NULL;

-- ============================================================
-- 4. ÍNDICE PARCIAL PARA EL JOB DE CADUCIDAD
-- ============================================================
-- El cron solo mira lotes pendientes de liquidar; el índice parcial
-- deja fuera todos los débitos y todos los lotes ya resueltos, así que
-- se mantiene diminuto aunque el histórico crezca.
CREATE INDEX IF NOT EXISTS idx_wallet_tx_expiry_pending
  ON public.wallet_transactions (expires_at)
  WHERE amount > 0 AND expires_at IS NOT NULL AND expiry_settled_at IS NULL;

-- ============================================================
-- 5. DEDUPE DE AVISOS SIN PEDIDO ASOCIADO
-- ============================================================
-- `idx_notifications_order_type` deduplica por (order_id, type), pero el
-- aviso de caducidad no nace de un pedido: sin `dedupe_key` el job
-- insertaría el mismo aviso en cada corrida.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

COMMENT ON COLUMN public.notifications.dedupe_key IS
  'Clave de idempotencia para avisos sin order_id (p. ej. "wallet-expiry:2026-03-14"). NULL = sin dedupe.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON public.notifications (user_id, type, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
