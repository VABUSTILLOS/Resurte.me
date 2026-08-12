-- ============================================================
-- Resurte.me — Migración 00052 (CRM Comercialización) + roles
-- Vía: Supabase Dashboard → SQL Editor → New query → Run
-- Idempotente: seguro de re-ejecutar.
--
-- ⚠️ PASO 0 · EDITA LA LISTA DEL PASO 3 con los emails de tus
-- vendedores (los que pongas ahí se vuelven account managers).
-- Ejemplo si son 3 vendedores:
--   'vendedor1@gmail.com',
--   'vendedor2@gmail.com',
--   'vendedor3@gmail.com',

-- ============================================================
-- PASO 1 · PRE-CHECK (solo lectura)
-- Esperado: profiles.role = 0 (aún no existe).
-- ============================================================
SELECT count(*) AS profiles_role_present
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role';

-- Ver quién es cada usuario hoy (email vive en auth.users)
SELECT au.email, COALESCE(p.role, '(sin rol)') AS rol_actual, p.full_name
FROM auth.users au
LEFT JOIN profiles p ON p.id = au.id
ORDER BY au.email;

-- ============================================================
-- PASO 2 · MIGRACIÓN 00052 (CRM Comercialización)
-- ============================================================

-- 2.1 Rol del usuario en profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'cliente'
    CHECK (role IN ('cliente', 'vendedor'));

CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- 2.2 Prospectos del vendedor
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
  user_id           UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  referral_code     TEXT UNIQUE,
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

-- 2.3 Bitácora de actividades
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id               BIGSERIAL PRIMARY KEY,
  prospect_id      BIGINT NOT NULL REFERENCES public.crm_prospects(id) ON DELETE CASCADE,
  seller_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN ('llamada','whatsapp','correo','visita','nota','pedido')),
  direction        TEXT NOT NULL DEFAULT 'saliente' CHECK (direction IN ('saliente','entrante')),
  outcome          TEXT,
  summary          TEXT,
  duration_seconds INTEGER,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_prospect  ON crm_activities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_seller    ON crm_activities(seller_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_occurred  ON crm_activities(occurred_at);

-- 2.4 Atribución de pedidos asistidos
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_id);

-- 2.5 RLS
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
-- PASO 3 · ASIGNAR ROL 'vendedor'
-- Cambia los emails de la lista de abajo por los de tus
-- vendedores (los que pusiste en el PASO 0).
-- ============================================================
UPDATE profiles p
SET role = 'vendedor'
WHERE p.id IN (
  SELECT id FROM auth.users
  WHERE email IN (
    '{{PON_AQUI_EMAIL_VENDEDOR}}'
    -- 'vendedor2@gmail.com',
    -- 'vendedor3@gmail.com',
  )
);

-- (Opcional) Si quieres marcar a TODOS excepto el admin como vendedores:
-- UPDATE profiles p
-- SET role = 'vendedor'
-- WHERE p.role IS DISTINCT FROM 'vendedor'
--   AND p.id NOT IN (SELECT id FROM auth.users WHERE email = 'vabustillos@gmail.com');

-- ============================================================
-- PASO 4 · POST-CHECK (verificación)
-- Esperado: tus vendedores con rol = vendedor; el admin intacto.
-- ============================================================
SELECT au.email, p.role, p.full_name
FROM auth.users au
LEFT JOIN profiles p ON p.id = au.id
ORDER BY au.email;
