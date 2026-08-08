-- ============================================================
-- 00049_leads.sql
--
-- Captura de leads del checkout drawer:
--   · email onBlur (source 'checkout_drawer') al salir del campo email;
--   · exit-intent (source 'exit_intent') al detectar abandono, con cupón.
--
-- Tabla separada de `profiles`/`addresses`: el lead puede ser un visitante
-- anónimo que aún no hace pedido, así que no pertenece a un user_id.
-- El flujo de checkout NO depende de esta tabla (insert falla-open).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.leads (
  id          BIGSERIAL PRIMARY KEY,
  email       TEXT NOT NULL,
  phone       TEXT,
  source      TEXT NOT NULL DEFAULT 'checkout_drawer',
  coupon_code TEXT,
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT leads_email_check CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT leads_source_check CHECK (source IN ('checkout_drawer', 'exit_intent'))
);

COMMENT ON TABLE public.leads IS
  'Leads capturados durante el checkout drawer (email onBlur y exit-intent). No afecta el flujo de órdenes.';

CREATE INDEX IF NOT EXISTS idx_leads_email
  ON public.leads (email, created_at);
