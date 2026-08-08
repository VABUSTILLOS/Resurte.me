-- ============================================================
-- Resurte.me — Aplicación manual de migración 00033
-- Vía: Supabase Dashboard → SQL Editor → New query → Run
-- Idempotente: seguro de re-ejecutar.
-- ============================================================

-- PASO 1 · PRE-CHECK (solo lectura)
-- Esperado: addresses.guest_token = 0 (aún no existe).
SELECT count(*) AS guest_token_present
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'guest_token';

-- ------------------------------------------------------------
-- PASO 2 · MIGRACIÓN 00033 (guest_address_tokens)
-- ------------------------------------------------------------
ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS guest_token TEXT;

CREATE INDEX IF NOT EXISTS idx_addresses_guest_token
  ON public.addresses (guest_token);

-- ------------------------------------------------------------
-- PASO 3 · POST-CHECK (verificación)
-- Esperado: 1 fila (guest_token, text, nullable).
-- ------------------------------------------------------------
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'guest_token';
