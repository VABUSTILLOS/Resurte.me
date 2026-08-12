-- ============================================================
-- Resurte.me — Comercialización (CRM de vendedores)
--
-- Los vendedores (account managers) gestionan prospectos y clientes
-- restauranteros, registran llamadas/WhatsApp y colocan pedidos asistidos
-- para asegurar la recompra semanal. Ganan comisión sobre pedidos pagados
-- de los clientes que les pertenecen.
--
-- Idempotente: se aplica a mano en el SQL Editor de Supabase.
-- ============================================================

-- 1. Rol del usuario en profiles (fuente de verdad de roles del sitio)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'cliente'
    CHECK (role IN ('cliente', 'vendedor'));

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- 2. Prospectos del vendedor
CREATE TABLE IF NOT EXISTS public.crm_prospects (
  id                BIGSERIAL PRIMARY KEY,
  seller_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  restaurant_name   TEXT,
  phone             TEXT,
  whatsapp          TEXT,
  email             TEXT,
  city_id           BIGINT REFERENCES public.cities(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'nuevo'
                      CHECK (status IN ('nuevo','contactado','en_seguimiento','cliente_activo','inactivo','perdido')),
  user_id           UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- vínculo a cuenta real
  referral_code     TEXT UNIQUE, -- código para el link de registro del vendedor
  last_contact_at   TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  notes             TEXT,
  source            TEXT NOT NULL DEFAULT 'manual',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_prospects_seller      ON crm_prospects(seller_id);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_status      ON crm_prospects(status);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_follow_up   ON crm_prospects(next_follow_up_at);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_user        ON crm_prospects(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_prospects_referral    ON crm_prospects(referral_code);

COMMENT ON COLUMN crm_prospects.referral_code IS 'Código único del link de registro del vendedor (ej: RESU-A3F9B2)';

-- Genera un código único para el link de registro del prospecto
CREATE OR REPLACE FUNCTION generate_crm_prospect_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_code := 'RESU-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 6));
    SELECT EXISTS (SELECT 1 FROM crm_prospects WHERE referral_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION set_crm_prospect_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := generate_crm_prospect_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_crm_prospect_code ON crm_prospects;

CREATE TRIGGER trg_set_crm_prospect_code
  BEFORE INSERT ON crm_prospects
  FOR EACH ROW
  EXECUTE FUNCTION set_crm_prospect_code();

-- updated_at automático
CREATE OR REPLACE FUNCTION set_crm_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_prospects_updated_at ON crm_prospects;

CREATE TRIGGER trg_crm_prospects_updated_at
  BEFORE UPDATE ON crm_prospects
  FOR EACH ROW
  EXECUTE FUNCTION set_crm_updated_at();

-- 3. Bitácora de actividades de contacto (llamadas, WhatsApp, correo, visitas)
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id               BIGSERIAL PRIMARY KEY,
  prospect_id      BIGINT NOT NULL REFERENCES public.crm_prospects(id) ON DELETE CASCADE,
  seller_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('llamada','whatsapp','correo','visita','nota','pedido')),
  direction        TEXT NOT NULL DEFAULT 'saliente' CHECK (direction IN ('saliente','entrante')),
  outcome          TEXT, -- responded_no, no_respondio, interesado, no_interesado, ...
  summary          TEXT,
  duration_seconds INTEGER,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_prospect  ON crm_activities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_seller    ON crm_activities(seller_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_occurred  ON crm_activities(occurred_at);

-- 4. Atribución de pedidos asistidos por el vendedor
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);

-- 5. RLS
-- El vendedor solo accede a SUS prospectos y actividades; el service_role
-- (server actions) tiene acceso total para pedidos asistidos y comisiones.
ALTER TABLE public.crm_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_prospects_owner_all" ON public.crm_prospects;
CREATE POLICY "crm_prospects_owner_all"
  ON public.crm_prospects
  FOR ALL
  TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS "crm_activities_owner_all" ON public.crm_activities;
CREATE POLICY "crm_activities_owner_all"
  ON public.crm_activities
  FOR ALL
  TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

DROP POLICY IF EXISTS "crm_prospects_service_all" ON public.crm_prospects;
CREATE POLICY "crm_prospects_service_all"
  ON public.crm_prospects
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "crm_activities_service_all" ON public.crm_activities;
CREATE POLICY "crm_activities_service_all"
  ON public.crm_activities
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- CÓMO ASIGNAR ROLES A VENDEDORES (SQL Editor de Supabase)
-- ============================================================
-- El email vive en auth.users; profiles solo tiene id/full_name/...
-- La columna role fue agregada por esta migración (default 'cliente').

-- 1) Ver usuarios y su rol actual:
--   SELECT au.email, COALESCE(p.role, 'cliente') AS rol
--   FROM auth.users au
--   LEFT JOIN profiles p ON p.id = au.id
--   ORDER BY au.email;

-- 2) Asignar 'vendedor' a vendedores puntuales por email:
--   UPDATE profiles p
--   SET role = 'vendedor'
--   WHERE p.id IN (
--     SELECT id FROM auth.users
--     WHERE email IN ('vendedor1@gmail.com', 'vendedor2@gmail.com')
--   );

-- 3) Asignar 'vendedor' a todos EXCEPTO el admin (vabustillos@gmail.com):
--   UPDATE profiles p
--   SET role = 'vendedor'
--   WHERE p.role IS DISTINCT FROM 'vendedor'
--     AND p.id NOT IN (
--       SELECT id FROM auth.users WHERE email = 'vabustillos@gmail.com'
--     );

-- Nota: el admin (ADMIN_EMAILS) ve todas las secciones sin importar su
-- rol; estas queries solo cambian lo que ven los usuarios normales.
