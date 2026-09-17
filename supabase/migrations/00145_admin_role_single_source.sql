-- 00145_admin_role_single_source.sql
-- Una sola fuente de verdad para "es admin".
--
-- PROBLEMA (T1 del inventario): la regla "este usuario es admin" estaba escrita
-- CINCO veces, con cuatro implementaciones distintas:
--
--   1. public.is_admin()                      (00067) -> lee profiles.role
--   2. policy admin_audit_log  SELECT         (00072) -> EXISTS inline sobre profiles
--   3. policy stock_adjustments INSERT        (00077) -> EXISTS inline sobre profiles
--   4. policy stock_adjustments SELECT        (00077) -> EXISTS inline sobre profiles
--   5. src/lib/admin-auth.ts isAdminUser()    -> ADMIN_EMAILS || profiles.role || admin_users
--
-- Consecuencia real: un admin cuyo acceso viniera SOLO de ADMIN_EMAILS o de
-- `admin_users` pasaba el guard de la app (y por tanto todas las rutas
-- /api/admin/*, que usan service_role y saltan RLS) pero NO pasaba las policies
-- RLS, que solo miran profiles.role. El resultado no era un error visible sino
-- tablas vacías en silencio: exactamente el patrón de "éxito falso" que este
-- plan viene a erradicar. Y al revés: quitar a alguien de ADMIN_EMAILS no le
-- revocaba el acceso RLS si su profiles.role seguía en 'admin'.
--
-- SOLUCIÓN: profiles.role = 'admin' queda como la ÚNICA fuente de verdad.
--   a) `admin_users` (00030, legado) se vuelve una tabla DERIVADA: un trigger la
--      espeja hacia profiles.role, así que ya no puede divergir por más que se
--      manipule a mano (que es justo como documenta 00030 que se otorga admin).
--   b) Las tres policies con la regla duplicada inline pasan a llamar a
--      public.is_admin(), de modo que en SQL la regla existe una sola vez.
--   c) El lado de la app se auto-repara en src/lib/admin-auth.ts: si un email de
--      ADMIN_EMAILS (bootstrap de emergencia) todavía no tiene profiles.role,
--      se promueve, y así RLS y app convergen en lugar de discrepar.
--
-- Idempotente: se puede reejecutar sin riesgo.

-- ---------------------------------------------------------------------------
-- 1. Espejo admin_users -> profiles.role
-- ---------------------------------------------------------------------------
-- Reglas:
--   INSERT en admin_users  -> profiles.role = 'admin'
--   DELETE de admin_users  -> profiles.role = 'cliente' SOLO si hoy es 'admin'
--                             (nunca pisa 'vendedor'), y nunca si dejaría al
--                             sistema sin ningún administrador.
CREATE OR REPLACE FUNCTION public.sync_admin_users_to_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_current TEXT;
  v_remaining INT;
BEGIN
  v_user_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;

  SELECT p.role INTO v_current
  FROM public.profiles p
  WHERE p.id = v_user_id;

  IF TG_OP = 'INSERT' THEN
    IF v_current IS DISTINCT FROM 'admin' THEN
      UPDATE public.profiles SET role = 'admin' WHERE id = v_user_id;
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'DELETE': solo degradamos si esta fila era lo que otorgaba el rol.
  IF v_current = 'admin' THEN
    SELECT count(*) INTO v_remaining
    FROM public.profiles
    WHERE role = 'admin' AND id <> v_user_id;

    IF v_remaining = 0 THEN
      RAISE EXCEPTION 'No puedes quitar al último administrador del sistema';
    END IF;

    UPDATE public.profiles SET role = 'cliente' WHERE id = v_user_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sync_admin_users_to_profile_trigger ON public.admin_users;
CREATE TRIGGER sync_admin_users_to_profile_trigger
  AFTER INSERT OR DELETE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_admin_users_to_profile();

-- Una función de trigger no se puede invocar directamente, pero es
-- SECURITY DEFINER: no hay razón para que anon o authenticated tengan EXECUTE.
REVOKE ALL ON FUNCTION public.sync_admin_users_to_profile() FROM PUBLIC, anon, authenticated;

-- Backfill: cualquier fila legada que aún no esté reflejada en profiles.role.
UPDATE public.profiles p
SET role = 'admin'
FROM public.admin_users a
WHERE a.user_id = p.id
  AND p.role IS DISTINCT FROM 'admin';

-- ---------------------------------------------------------------------------
-- 2. Una sola implementación de la regla en SQL
-- ---------------------------------------------------------------------------
-- public.is_admin() (00067) se mantiene tal cual: lee profiles.role, que a
-- partir de aquí es la única fuente. Se recrea con search_path vacío para
-- alinear con las migraciones recientes (00143/00144).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Las tres policies que repetían la regla inline ahora delegan.
DROP POLICY IF EXISTS "Admins can read audit log" ON public.admin_audit_log;
CREATE POLICY "Admins can read audit log" ON public.admin_audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert stock adjustments" ON public.stock_adjustments;
CREATE POLICY "Admins can insert stock adjustments" ON public.stock_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can read stock adjustments" ON public.stock_adjustments;
CREATE POLICY "Admins can read stock adjustments" ON public.stock_adjustments
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Reporte de acceso admin (diagnóstico, service_role únicamente)
-- ---------------------------------------------------------------------------
-- Devuelve, por cada usuario con acceso admin, de qué fuente le viene. Sirve
-- para que /admin/sistema pueda mostrar la divergencia en vez de esconderla.
CREATE OR REPLACE FUNCTION public.admin_access_report()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  profile_role TEXT,
  in_admin_users BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT
    p.id,
    u.email::TEXT,
    p.role,
    EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = p.id)
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'admin'
     OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = p.id)
  ORDER BY p.id;
$$;

REVOKE ALL ON FUNCTION public.admin_access_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_access_report() TO service_role;
