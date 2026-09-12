-- ============================================================
-- 00071: invoice_submissions — captura real de facturas/tickets
--
-- El "escáner de facturas" de /recompensas era simulado (mockData,
-- créditos nunca acreditados). Ahora el usuario sube la foto de su
-- factura/ticket a Storage (bucket privado `facturas`, carpeta por
-- usuario) y un admin la revisa en /admin/facturas: al aprobar se
-- abonan créditos reales vía grant_wallet_credit().
--
-- grant_wallet_credit: única vía de abono manual (SECURITY DEFINER,
-- solo service_role — mismo modelo que redeem_service).
-- ============================================================

CREATE TABLE public.invoice_submissions (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_path       TEXT NOT NULL,        -- ruta en el bucket `facturas`
  total_amount     DECIMAL(10,2),        -- total capturado (opcional)
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  credits_granted  DECIMAL(10,2),
  reviewed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT invoice_submissions_credits_nonneg
    CHECK (credits_granted IS NULL OR credits_granted >= 0)
);

CREATE INDEX idx_invoice_submissions_status ON public.invoice_submissions (status, created_at DESC);
CREATE INDEX idx_invoice_submissions_user ON public.invoice_submissions (user_id, created_at DESC);

ALTER TABLE public.invoice_submissions ENABLE ROW LEVEL SECURITY;

-- El usuario crea y consulta solo SUS envíos; la revisión es service_role.
CREATE POLICY invoice_submissions_select_own ON public.invoice_submissions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY invoice_submissions_insert_own ON public.invoice_submissions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.invoice_submissions IS
  'Facturas/tickets subidos por usuarios para acreditación manual de créditos (revisión admin).';

-- ── Storage: bucket privado `facturas` con carpeta por usuario ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('facturas', 'facturas', false)
ON CONFLICT (id) DO NOTHING;

-- El usuario sube/lee archivos solo dentro de su carpeta <auth.uid()>/...
CREATE POLICY facturas_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'facturas' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY facturas_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'facturas' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── Abono manual de créditos (aprobación de facturas) ──
CREATE OR REPLACE FUNCTION public.grant_wallet_credit(
  p_user_id UUID,
  p_amount DECIMAL,
  p_concept TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id BIGINT;
  v_tx_id BIGINT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'grant_wallet_credit: amount must be positive (got %)', p_amount;
  END IF;

  -- Wallet del usuario (crearlo si no existe), bloqueado para el abono.
  INSERT INTO wallets (user_id, balance_credits)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NULL THEN
    SELECT id INTO v_wallet_id FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  END IF;

  UPDATE wallets
  SET balance_credits = balance_credits + p_amount,
      updated_at = now()
  WHERE id = v_wallet_id;

  INSERT INTO wallet_transactions (wallet_id, amount, concept)
  VALUES (v_wallet_id, p_amount, p_concept)
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

-- Solo service_role (mismo modelo que redeem_service): evita que un
-- usuario se auto-abone créditos llamando la función con su propio id.
REVOKE EXECUTE ON FUNCTION public.grant_wallet_credit(UUID, DECIMAL, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_wallet_credit(UUID, DECIMAL, TEXT)
  TO service_role;
