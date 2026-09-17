-- ============================================================
-- 00144_invoice_credit_reversal.sql  (fase C — integridad de dinero)
--
-- Cierra tres defectos reales del flujo "sube tu ticket → recibe
-- Créditos Resurte" (00074):
--
-- 1. APROBACIÓN NO ATÓMICA (doble abono). `POST /api/admin/facturas`
--    llamaba `grant_wallet_credit()` y DESPUÉS intentaba el
--    `UPDATE ... WHERE status = 'pending'`. El abono ocurría antes de
--    la guarda y el resultado del UPDATE no se verificaba: si el
--    UPDATE fallaba, o si dos admins aprobaban a la vez, el monedero
--    quedaba abonado dos veces con el envío aún 'pending'.
--    → `approve_invoice_submission()` hace abono + marcado en una sola
--      transacción, con `FOR UPDATE` sobre el envío.
--
-- 2. NO HABÍA REVERSIÓN. Un envío aprobado quedaba atrapado en 409
--    ("Este envío ya fue revisado"): los créditos otorgados por un
--    ticket fraudulento o duplicado eran irrecuperables.
--    → `revoke_invoice_submission()` revoca un envío aprobado,
--      debitando exactamente lo abonado (nunca por debajo de 0) y
--      registrando la transacción negativa para auditoría.
--
-- 3. SIN DEDUPE. El mismo objeto de Storage podía enviarse N veces
--    (límite 10/min) y aprobarse N veces.
--    → índice único parcial (user_id, image_path) mientras el envío
--      siga vivo ('pending'/'approved'). Un reintento tras rechazo o
--      revocación sigue permitido.
--
-- Invariantes respetadas:
--   · `grant_wallet_credit` sigue siendo la única vía de ABONO manual.
--   · Todo débito va sin caducidad (amount < 0 → expires_at NULL, 00132).
--   · Idempotente: aprobar dos veces o revocar dos veces no mueve saldo.
--   · SECURITY DEFINER, solo service_role (mismo modelo que 00074).
-- ============================================================

-- ============================================================
-- 1. ESTADO 'revoked' + COLUMNAS DE TRAZABILIDAD
-- ============================================================
ALTER TABLE public.invoice_submissions
  DROP CONSTRAINT IF EXISTS invoice_submissions_status_check;

ALTER TABLE public.invoice_submissions
  ADD CONSTRAINT invoice_submissions_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'revoked'));

ALTER TABLE public.invoice_submissions
  ADD COLUMN IF NOT EXISTS credits_tx_id   BIGINT REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_credits DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS revoke_reason   TEXT;

COMMENT ON COLUMN public.invoice_submissions.credits_tx_id IS
  'Transacción de abono en wallet_transactions que originó la aprobación (traza exacta para revertir).';
COMMENT ON COLUMN public.invoice_submissions.revoked_credits IS
  'Créditos realmente debitados al revocar. Puede ser menor a credits_granted si el cliente ya los gastó.';

ALTER TABLE public.invoice_submissions
  DROP CONSTRAINT IF EXISTS invoice_submissions_revoked_nonneg;
ALTER TABLE public.invoice_submissions
  ADD CONSTRAINT invoice_submissions_revoked_nonneg
  CHECK (revoked_credits IS NULL OR revoked_credits >= 0);

-- ============================================================
-- 2. DEDUPE: un mismo archivo no puede estar vivo dos veces
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_submissions_live_image
  ON public.invoice_submissions (user_id, image_path)
  WHERE status IN ('pending', 'approved');

COMMENT ON INDEX public.uniq_invoice_submissions_live_image IS
  'Impide reenviar el mismo ticket/factura mientras el envío siga pendiente o aprobado (vector de abono múltiple).';

-- ============================================================
-- 3. APROBACIÓN ATÓMICA E IDEMPOTENTE
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_invoice_submission(
  p_id      BIGINT,
  p_credits DECIMAL,
  p_admin   UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub   public.invoice_submissions%ROWTYPE;
  v_tx_id BIGINT;
BEGIN
  IF p_credits IS NULL OR p_credits <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_credits');
  END IF;

  SELECT * INTO v_sub
  FROM public.invoice_submissions
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Idempotencia: reintentar una aprobación no vuelve a abonar.
  IF v_sub.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'already_reviewed',
      'status', v_sub.status,
      'credits', v_sub.credits_granted
    );
  END IF;

  -- Única vía de abono manual (00074). Mismo transacción que el marcado:
  -- si algo falla después, el abono también se deshace.
  v_tx_id := public.grant_wallet_credit(
    v_sub.user_id,
    p_credits,
    'Factura aprobada #' || p_id
  );

  UPDATE public.invoice_submissions
  SET status          = 'approved',
      credits_granted = p_credits,
      credits_tx_id   = v_tx_id,
      reviewed_by     = p_admin,
      reviewed_at     = now()
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'ok', true,
    'reason', 'approved',
    'credits', p_credits,
    'user_id', v_sub.user_id,
    'tx_id', v_tx_id
  );
END;
$$;

COMMENT ON FUNCTION public.approve_invoice_submission(BIGINT, DECIMAL, UUID) IS
  'Aprueba un envío de factura y abona los créditos en una sola transacción. Idempotente: un envío ya revisado no vuelve a abonar. Sustituye el par grant_wallet_credit + UPDATE no atómico de /api/admin/facturas.';

-- ============================================================
-- 4. REVERSIÓN DE UNA APROBACIÓN
-- ============================================================
CREATE OR REPLACE FUNCTION public.revoke_invoice_submission(
  p_id     BIGINT,
  p_admin  UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub      public.invoice_submissions%ROWTYPE;
  v_wallet   BIGINT;
  v_available NUMERIC(10,2);
  v_credits  NUMERIC(10,2);
  v_reversed NUMERIC(10,2) := 0;
  v_reason   TEXT;
BEGIN
  SELECT * INTO v_sub
  FROM public.invoice_submissions
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_sub.status = 'revoked' THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'already_revoked',
      'reversed', COALESCE(v_sub.revoked_credits, 0)
    );
  END IF;

  IF v_sub.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_approved', 'status', v_sub.status);
  END IF;

  v_credits := COALESCE(v_sub.credits_granted, 0);
  v_reason  := NULLIF(btrim(COALESCE(p_reason, '')), '');

  IF v_credits > 0 THEN
    -- Bloquea la wallet para que el saldo no cambie entre lectura y débito.
    SELECT id INTO v_wallet FROM public.wallets WHERE user_id = v_sub.user_id FOR UPDATE;

    IF v_wallet IS NOT NULL THEN
      SELECT balance_credits INTO v_available
      FROM public.wallets WHERE id = v_wallet;

      -- Nunca por debajo de 0: si el cliente ya gastó los créditos, se
      -- recupera lo que quede y se reporta el faltante.
      v_reversed := LEAST(GREATEST(COALESCE(v_available, 0), 0), v_credits);

      IF v_reversed > 0 THEN
        -- amount < 0 → sin caducidad (00132), es un débito.
        INSERT INTO public.wallet_transactions (wallet_id, amount, concept)
        VALUES (
          v_wallet,
          -v_reversed,
          'Reversión factura #' || p_id
            || CASE WHEN v_reason IS NULL THEN '' ELSE ' — ' || v_reason END
        );

        UPDATE public.wallets
        SET balance_credits = balance_credits - v_reversed,
            updated_at      = now()
        WHERE id = v_wallet;
      END IF;
    END IF;
  END IF;

  UPDATE public.invoice_submissions
  SET status          = 'revoked',
      revoked_at      = now(),
      revoked_by      = p_admin,
      revoked_credits = v_reversed,
      revoke_reason   = v_reason
  WHERE id = p_id;

  RETURN jsonb_build_object(
    'ok', true,
    'reason', 'revoked',
    'user_id', v_sub.user_id,
    'credits', v_credits,
    'reversed', v_reversed,
    'shortfall', v_credits - v_reversed
  );
END;
$$;

COMMENT ON FUNCTION public.revoke_invoice_submission(BIGINT, UUID, TEXT) IS
  'Revoca un envío de factura aprobado: debita exactamente los créditos abonados (sin bajar de 0) y registra la transacción negativa. Idempotente.';

-- ============================================================
-- 5. PRIVILEGIOS: solo service_role
-- ============================================================
REVOKE ALL ON FUNCTION public.approve_invoice_submission(BIGINT, DECIMAL, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_invoice_submission(BIGINT, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.approve_invoice_submission(BIGINT, DECIMAL, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_invoice_submission(BIGINT, UUID, TEXT)
  TO service_role;
