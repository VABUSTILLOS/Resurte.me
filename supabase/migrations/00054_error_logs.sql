-- Error logging table for production monitoring
-- Usage: POST /api/log-error { message, context?, severity?, user_id? }
-- Read:   admin panel o query directa

CREATE TABLE IF NOT EXISTS error_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message TEXT NOT NULL,
  context JSONB DEFAULT '{}'::JSONB,
  severity TEXT NOT NULL DEFAULT 'error' CHECK (severity IN ('info','warn','error','fatal')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  request_id TEXT,
  user_agent TEXT,
  url TEXT,
  stack TEXT,
  source TEXT NOT NULL DEFAULT 'client' CHECK (source IN ('client','server','edge'))
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_user_id_idx ON error_logs (user_id);
CREATE INDEX IF NOT EXISTS error_logs_severity_idx ON error_logs (severity);
CREATE INDEX IF NOT EXISTS error_logs_source_idx ON error_logs (source);

-- RLS: solo service role puede insertar; admin puede leer (policy en migration siguiente si hace falta)
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "service_role_all" ON error_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Retención: 90 días (pg_cron job en 00044 ya limpia tablas; añadimos este)
-- No creamos pg_cron aquí para no duplicar; el job existente puede expandirse.