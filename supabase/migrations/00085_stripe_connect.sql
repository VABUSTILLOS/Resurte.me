-- ============================================================
-- 00085 · Stripe Connect Express por restaurante
-- ============================================================
-- Hasta hoy Resurte.me cobraba TODOS los pagos con tarjeta con su
-- propia cuenta Stripe (`getStripe()` lee un único STRIPE_SECRET_KEY).
-- Eso significa que el dinero de los restaurantes entraba a la cuenta
-- de Resurte y había que dispersarlo a mano: custodia de fondos de
-- terceros, con riesgo legal/fiscal y conciliación manual.
--
-- Con Connect, cada restaurante tiene su propia cuenta Express y el
-- cargo se hace como "destination charge":
--   transfer_data.destination = <cuenta del restaurante>
--   application_fee_amount    = comisión que retiene la plataforma
-- Stripe liquida al restaurante; Resurte nunca toca los fondos.
--
-- SEGURIDAD: estas columnas NO pueden ser escribibles por el dueño del
-- restaurante. `foodos_restaurants` tiene una política RLS de dueño
-- ("Owner manages restaurants", 00023) que permite UPDATE sobre la fila
-- completa; sin el REVOKE de abajo, un dueño podría apuntar
-- `stripe_account_id` a una cuenta ajena y desviar los cobros de sus
-- propios comensales, o marcarse `stripe_charges_enabled = true`.
-- Las políticas RLS filtran filas; los privilegios de columna son una
-- capa aparte y siguen aplicando, así que se revocan explícitamente.
-- Toda escritura a estas columnas pasa por `createServiceClient()`.
-- ============================================================

ALTER TABLE public.foodos_restaurants
  ADD COLUMN IF NOT EXISTS stripe_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_requirements_due TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stripe_onboarded_at TIMESTAMPTZ,
  -- Comisión de la plataforma. 0 = paridad con Take App (sólo se retiene
  -- la comisión de Stripe). La fija un admin, nunca el dueño.
  ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC(5, 2) NOT NULL DEFAULT 0;

-- Una cuenta Express pertenece a un solo restaurante.
CREATE UNIQUE INDEX IF NOT EXISTS idx_foodos_restaurants_stripe_account
  ON public.foodos_restaurants (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'foodos_restaurants_platform_fee_percent_check'
  ) THEN
    ALTER TABLE public.foodos_restaurants
      ADD CONSTRAINT foodos_restaurants_platform_fee_percent_check
      CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100);
  END IF;
END $$;

-- Comprobante por pedido de lo que se transfirió y de lo que se retuvo.
-- Se guarda para poder conciliar contra el reporte de Stripe sin volver
-- a consultar la API por cada pedido.
ALTER TABLE public.foodos_orders
  ADD COLUMN IF NOT EXISTS application_fee_amount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS connected_account_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'foodos_orders_application_fee_amount_check'
  ) THEN
    ALTER TABLE public.foodos_orders
      ADD CONSTRAINT foodos_orders_application_fee_amount_check
      CHECK (application_fee_amount >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_foodos_orders_connected_account
  ON public.foodos_orders (connected_account_id)
  WHERE connected_account_id IS NOT NULL;

-- ------------------------------------------------------------
-- Privilegios: el dueño del restaurante NO escribe el estado de Connect
-- ------------------------------------------------------------
REVOKE UPDATE (
  stripe_account_id,
  stripe_charges_enabled,
  stripe_payouts_enabled,
  stripe_details_submitted,
  stripe_requirements_due,
  stripe_onboarded_at,
  platform_fee_percent
) ON public.foodos_restaurants FROM authenticated, anon;

COMMENT ON COLUMN public.foodos_restaurants.stripe_account_id IS
  'Cuenta Express (acct_...) del restaurante. Sólo escribe el service role desde /api/foodos/connect/*.';
COMMENT ON COLUMN public.foodos_restaurants.stripe_charges_enabled IS
  'Espejo de account.charges_enabled de Stripe. Sólo escribe el service role.';
COMMENT ON COLUMN public.foodos_restaurants.platform_fee_percent IS
  'Comisión que retiene Resurte.me sobre cada cargo. 0 = sin comisión. Sólo la cambia un admin.';
COMMENT ON COLUMN public.foodos_orders.application_fee_amount IS
  'Comisión retenida en centavos MXN (application_fee_amount del PaymentIntent). 0 si el cargo no fue destination charge.';
COMMENT ON COLUMN public.foodos_orders.connected_account_id IS
  'Cuenta Connect que recibió los fondos de este pedido. NULL si el cargo fue a la cuenta de la plataforma.';
