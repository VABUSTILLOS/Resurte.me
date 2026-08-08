-- ============================================================
-- 00042_cleanup_guest_addresses.sql
--
-- Limpieza de direcciones anónimas huérfanas.
--
-- Contexto: /api/orders acepta guest_token (00033) para checkout
-- anónimo; cada visita puede crear direcciones con user_id NULL.
-- Sin expiración ni cleanup, esas filas se acumulan para siempre.
-- Esta migración expone un RPC que borra las direcciones con
-- guest_token, sin user_id, más viejas de N días.
--
-- Nota: addresses.created_at ya existe (migración 00001), así que
-- solo se añade el índice + RPC de limpieza.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_addresses_guest_orphan_cleanup
  ON public.addresses (created_at)
  WHERE guest_token IS NOT NULL AND user_id IS NULL;

CREATE OR REPLACE FUNCTION public.cleanup_orphan_guest_addresses(
  p_days INTEGER DEFAULT 30
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF p_days < 1 THEN
    RAISE EXCEPTION 'p_days must be >= 1';
  END IF;

  DELETE FROM public.addresses
  WHERE guest_token IS NOT NULL
    AND user_id IS NULL
    AND created_at < now() - make_interval(days => p_days);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Solo service_role puede invocarla (los cron endpoints usan service_role).
REVOKE ALL ON FUNCTION public.cleanup_orphan_guest_addresses(INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_orphan_guest_addresses(INTEGER)
  FROM anon, authenticated;
