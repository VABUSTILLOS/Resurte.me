-- ============================================================
-- 00137 · Comandero de mesas: aviso de cuenta
--
-- El mapa de mesas necesita un tercer estado además de libre y ocupada: la
-- cuenta pedida. Es la señal que busca el cajero cuando recorre el salón, así
-- que se guarda con marca de tiempo en la propia cuenta abierta en vez de
-- derivarla de algo indirecto (por ejemplo, que la cocina ya terminó).
--
-- Idempotente y aditiva: se puede correr las veces que haga falta.
-- ============================================================

ALTER TABLE foodos_table_tickets
  ADD COLUMN IF NOT EXISTS billing_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN foodos_table_tickets.billing_requested_at IS
  'Cuándo el mesero pidió la cuenta. NULL = todavía no. Se limpia si se cancela el aviso.';
