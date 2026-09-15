-- ============================================================
-- Sync de catálogo WhatsApp (fase WA4): historial de syncs.
-- 1. whatsapp_sync_runs: una corrida por sync (manual o auto)
-- 2. whatsapp_sync_items: detalle por producto (acción + error)
-- Admin-only: service role (requireAdmin en las actions).
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_sync_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id   UUID NOT NULL REFERENCES whatsapp_catalogs(id) ON DELETE CASCADE,
  trigger_kind TEXT NOT NULL DEFAULT 'manual',     -- manual | auto
  status       TEXT NOT NULL DEFAULT 'running',    -- running | done | failed
  added        INTEGER NOT NULL DEFAULT 0,
  updated      INTEGER NOT NULL DEFAULT 0,
  removed      INTEGER NOT NULL DEFAULT 0,
  stale_count  INTEGER NOT NULL DEFAULT 0,
  handles      JSONB NOT NULL DEFAULT '[]',        -- handles async de Meta
  error        TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wa_sync_runs_catalog
  ON whatsapp_sync_runs(catalog_id, started_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_sync_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     UUID NOT NULL REFERENCES whatsapp_sync_runs(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL,
  action     TEXT NOT NULL,        -- create | update | delete | skipped
  status     TEXT NOT NULL,        -- ok | error
  error      TEXT,                 -- mensaje de Meta cuando aplica
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_sync_items_run
  ON whatsapp_sync_items(run_id, status);

-- ============================================================
-- RLS: solo service role (admin vía requireAdmin + service client)
-- ============================================================
ALTER TABLE whatsapp_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_sync_items ENABLE ROW LEVEL SECURITY;
