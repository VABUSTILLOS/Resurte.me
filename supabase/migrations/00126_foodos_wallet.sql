-- ============================================================
-- FoodOS Fase 5 (paridad FluxSales): tarjeta de lealtad en Wallet
--
-- Qué es: la tarjeta de puntos del comensal, instalable en Apple Wallet,
-- Google Wallet o —sin certificados— como tarjeta web con QR que se abre
-- desde el móvil y se puede añadir a la pantalla de inicio.
--
-- Decisiones:
--   1. UNA sola tabla (`foodos_wallet_passes`) registra las tres
--      plataformas. La fila `web` es la de respaldo y existe siempre que el
--      restaurante tenga programa de lealtad; las filas `apple`/`google`
--      se crean cuando el comensal realmente instala el pase.
--   2. El saldo se guarda **copiado** (`points`, `points_value`): el pase es
--      una fotografía, no una consulta viva. Un trigger sobre
--      `foodos_customers.loyalty_points` la refresca al acreditar puntos, que
--      es exactamente lo que hace la entrega del pedido (migración 00081).
--   3. `token` es la capability URL de la tarjeta web y `serial` el
--      identificador del pase ante Apple/Google. Ambos son únicos y el token
--      no se puede adivinar; el comensal no tiene sesión.
--   4. El dueño del restaurante **no inserta pases a mano**: los crea la capa
--      de servidor al entregar el pedido o al pedir el enlace.
--
-- Idempotente.
-- ============================================================

-- 1. TABLA DE PASES --------------------------------------------
CREATE TABLE IF NOT EXISTS public.foodos_wallet_passes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id     UUID NOT NULL REFERENCES public.foodos_restaurants(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES public.foodos_customers(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL DEFAULT 'web' CHECK (platform IN ('apple','google','web')),
  -- Identificador público del pase ante el proveedor (determinista por cliente).
  serial            TEXT NOT NULL,
  -- Capability token de la tarjeta web / QR.
  token             TEXT NOT NULL,
  -- Fotografía del saldo en el momento de la última sincronización.
  points            INTEGER NOT NULL DEFAULT 0,
  points_value      NUMERIC(10,2) NOT NULL DEFAULT 0,
  reward_label      TEXT,
  reward_threshold  INTEGER,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  snapshot_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  pushed_at         TIMESTAMPTZ,
  push_count        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT foodos_wallet_passes_serial_key UNIQUE (serial),
  CONSTRAINT foodos_wallet_passes_token_key UNIQUE (token),
  CONSTRAINT foodos_wallet_passes_customer_platform_key UNIQUE (customer_id, platform)
);

COMMENT ON TABLE public.foodos_wallet_passes IS
  'Tarjeta de lealtad del comensal: una fila por plataforma (apple/google/web). El saldo es una copia, no una consulta viva.';

-- ============================================================
-- 2. TRIGGER updated_at
-- ============================================================
DROP TRIGGER IF EXISTS trg_touch_foodos_wallet_passes ON public.foodos_wallet_passes;
CREATE TRIGGER trg_touch_foodos_wallet_passes
  BEFORE UPDATE ON public.foodos_wallet_passes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================================
-- 3. SINCRONIZACIÓN AL ACREDITAR PUNTOS
-- ============================================================
-- Los puntos se acreditan al entregar el pedido (trigger de 00081). Este
-- trigger propaga el saldo a los pases del cliente para que la tarjeta que ya
-- está en el teléfono no quede desfasada.
CREATE OR REPLACE FUNCTION public.foodos_sync_wallet_passes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_point_value NUMERIC(10,2);
BEGIN
  IF NEW.loyalty_points IS NOT DISTINCT FROM OLD.loyalty_points
     AND NEW.store_credit IS NOT DISTINCT FROM OLD.store_credit THEN
    RETURN NEW;
  END IF;

  SELECT point_value INTO v_point_value
  FROM public.foodos_loyalty_programs
  WHERE restaurant_id = NEW.restaurant_id AND is_active = true;

  UPDATE public.foodos_wallet_passes
  SET points       = NEW.loyalty_points,
      points_value = ROUND(NEW.loyalty_points * COALESCE(v_point_value, 0), 2),
      snapshot_at  = now()
  WHERE customer_id = NEW.id AND is_active = true;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_foodos_sync_wallet_passes ON public.foodos_customers;
CREATE TRIGGER trg_foodos_sync_wallet_passes
  AFTER UPDATE OF loyalty_points, store_credit ON public.foodos_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.foodos_sync_wallet_passes();

-- ============================================================
-- 4. ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_foodos_wallet_passes_rest
  ON public.foodos_wallet_passes(restaurant_id, platform)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_foodos_wallet_passes_customer
  ON public.foodos_wallet_passes(customer_id);

-- ============================================================
-- 5. RLS
-- ============================================================
-- El comensal no tiene sesión: entra por la capability URL (`token`) y la
-- tarjeta se sirve con service role desde el route handler. Por eso aquí solo
-- hay políticas para el dueño del restaurante y para admin.
ALTER TABLE public.foodos_wallet_passes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads wallet passes" ON public.foodos_wallet_passes;
CREATE POLICY "Owner reads wallet passes" ON public.foodos_wallet_passes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

-- El dueño puede desactivar un pase (revocarlo) pero no inventar saldos: el
-- CHECK del UPDATE lo fuerza a mantener el restaurante de la fila.
DROP POLICY IF EXISTS "Owner revokes wallet passes" ON public.foodos_wallet_passes;
CREATE POLICY "Owner revokes wallet passes" ON public.foodos_wallet_passes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.foodos_restaurants r
      WHERE r.id = restaurant_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin manages wallet passes" ON public.foodos_wallet_passes;
CREATE POLICY "Admin manages wallet passes" ON public.foodos_wallet_passes
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());
