-- ============================================================
-- FoodOS: ejecución real de campañas WhatsApp.
-- Permite que el motor de campañas (cron / panel) expanda una
-- campaña "scheduled" en un envío por cliente y registre el
-- resultado de cada mensaje.
-- ============================================================

ALTER TABLE foodos_campaigns
  ADD COLUMN IF NOT EXISTS error TEXT;

ALTER TABLE foodos_campaigns
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- El cron toma campañas programadas cuya fecha ya venció
CREATE INDEX IF NOT EXISTS idx_foodos_campaigns_due
  ON foodos_campaigns (status, scheduled_for)
  WHERE status = 'scheduled';
