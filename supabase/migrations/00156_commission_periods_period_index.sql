-- ============================================================
-- 00156 · Índice por periodo en el ledger de comisiones
-- ============================================================
-- El ledger de 00155 se consulta por mes: `/admin/comisiones` filtra
-- `period_start = <primer día del mes>`. Ninguno de los índices de 00155
-- sirve para eso:
--
--   commission_periods_unique_period (seller_id, period_start, period_end)
--     -> el btree arranca por seller_id; sin seller_id no se puede usar.
--   idx_commission_periods_seller    (seller_id, period_end DESC)
--     -> igual: seller_id primero.
--   idx_commission_periods_status_end(status, period_end DESC)
--     -> arranca por status; tampoco.
--
-- Un periodo es exactamente un mes, así que `period_start` identifica la
-- pantalla completa. El índice va en (period_start DESC, seller_id) para que
-- el orden de lectura ya venga resuelto y no haga falta un sort.
--
-- Idempotente: se puede reaplicar sin efecto.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_commission_periods_period
  ON public.commission_periods (period_start DESC, seller_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'commission_periods'
      AND indexname = 'idx_commission_periods_period'
  ) THEN
    RAISE EXCEPTION 'No se creó idx_commission_periods_period';
  END IF;
END;
$$;
