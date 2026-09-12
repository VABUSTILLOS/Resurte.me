-- 00067_master_admin_roles.sql
-- Unifica el rol "admin" dentro de profiles.role y permite que los admins
-- gestionen usuarios desde el panel /admin/usuarios.
--
-- Antes, el admin vivía solo en ADMIN_EMAILS (env) o en admin_users (00030).
-- Ahora profiles.role admite 'admin' como fuente de verdad adicional;
-- isAdminUser() (src/lib/admin-auth.ts) acepta cualquiera de las tres fuentes.
--
-- Idempotente: se aplica a mano en el SQL Editor de Supabase.

-- 1. Ampliar el CHECK de profiles.role para incluir 'admin'
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('cliente', 'vendedor', 'admin'));

-- 2. Backfill: los admins existentes en admin_users pasan a profiles.role
UPDATE public.profiles p
SET role = 'admin'
FROM public.admin_users a
WHERE a.user_id = p.id AND p.role IS DISTINCT FROM 'admin';

-- 3. Función helper SECURITY DEFINER para verificar admin sin recursión RLS.
--    (Una policy sobre profiles que consulte profiles directamente haría
--    recursión infinita; la función bypassea RLS como definer.)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 4. Policies: un admin puede ver todos los perfiles y actualizar roles.
--    Los usuarios siguen pudiendo leer/editar solo su propio perfil (00001),
--    y NO pueden cambiar su propio role (la policy de update propia queda
--    restringida abajo vía trigger).

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 5. Guard: un usuario no-admin nunca puede cambiar su propio role
--    (la policy "Users can update own profile" de 00001 permite editar el
--    resto de campos; este trigger protege la columna role).
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND auth.uid() = NEW.id
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'No puedes cambiar tu propio rol';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role_trigger ON public.profiles;
CREATE TRIGGER protect_profile_role_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();
