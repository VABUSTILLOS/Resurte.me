-- 00019_email_tracking.sql
-- Email tracking for abandoned cart recovery & reactivation campaigns
-- Used by /api/email/* cron endpoints

CREATE TABLE IF NOT EXISTS email_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email_to      TEXT NOT NULL,
  email_type    TEXT NOT NULL,              -- 'abandoned_cart', 'reactivation_30', 'reactivation_60', 'reactivation_90'
  order_id      BIGINT REFERENCES orders(id) ON DELETE SET NULL,  -- nullable (reactivation may not have an order)
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'sent',  -- 'sent', 'failed'
  error         TEXT,
  metadata      JSONB DEFAULT '{}'::jsonb   -- extra context (e.g. cart items, tier info)
);

CREATE INDEX IF NOT EXISTS idx_email_logs_user_type ON email_logs(user_id, email_type, sent_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_order ON email_logs(order_id);

COMMENT ON TABLE email_logs IS 'Tracks all marketing/transactional emails sent to users';
