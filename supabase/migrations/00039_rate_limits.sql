-- ============================================================
-- 00039_rate_limits.sql
--
-- Rate limiting durable y compartido entre instancias serverless.
--
-- Contexto: /api/foodos/orders usaba un Map en memoria que no
-- persiste entre instancias (Vercel) ni sobrevive deploys. Esta
-- tabla + RPC atómico (INSERT ... ON CONFLICT) da un fixed-window
-- counter compartido vía Postgres.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  hits         INTEGER NOT NULL DEFAULT 0
);

-- Acceso solo vía RPC (SECURITY DEFINER). No se expone la tabla.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
REVOKE ALL ON public.rate_limits FROM public;
GRANT ALL ON public.rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key            TEXT,
  p_limit          INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now        TIMESTAMPTZ := now();
  v_window     TIMESTAMPTZ;
  v_count      INTEGER;
  v_allowed    BOOLEAN;
  v_remaining  INTEGER;
  v_retry_after INTEGER;
BEGIN
  v_window := v_now - make_interval(secs => p_window_seconds);

  -- Limpieza perezosa de ventanas vencidas.
  DELETE FROM public.rate_limits WHERE window_start < v_window;

  -- Conteo atómico: inserta con 1, o incrementa si la ventana sigue viva;
  -- si la ventana venció, reinicia a 1.
  INSERT INTO public.rate_limits AS r (key, window_start, hits)
  VALUES (p_key, v_now, 1)
  ON CONFLICT (key) DO UPDATE SET
    hits = CASE WHEN r.window_start < v_window THEN 1 ELSE r.hits + 1 END,
    window_start = CASE WHEN r.window_start < v_window THEN v_now ELSE r.window_start END
  RETURNING hits INTO v_count;

  v_allowed    := v_count <= p_limit;
  v_remaining  := GREATEST(p_limit - v_count, 0);
  v_retry_after := CASE
    WHEN v_allowed THEN 0
    ELSE GREATEST(
      EXTRACT(EPOCH FROM (
        (SELECT window_start FROM public.rate_limits WHERE key = p_key) + make_interval(secs => p_window_seconds) - v_now
      ))::INTEGER,
      1
    )
  END;

  allowed             := v_allowed;
  remaining           := v_remaining;
  retry_after_seconds := v_retry_after;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO anon, authenticated, service_role;
