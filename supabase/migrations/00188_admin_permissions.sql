-- 00188_admin_permissions.sql
--
-- Permisos granulares dentro de /admin (AU4 de la auditoría de estatus).
--
-- PROBLEMA: el acceso admin era todo-o-nada. `profiles.role IN
-- ('cliente','vendedor','admin')` (00067) y `is_admin()` (00067) deciden la
-- puerta, y una vez dentro no había forma de recortar nada. Cualquier admin
-- podía tocar el catálogo, el dinero de la red, las cuentas y la bitácora de
-- auditoría con los mismos permisos.
--
-- SOLUCIÓN: un eje nuevo, `admin_permissions`, que solo aplica cuando
-- `role = 'admin'`. NO se toca `profiles.role` ni `profiles_role_check` ni
-- `is_admin()` ni las policies RLS: la puerta sigue siendo exactamente la misma
-- y este eje solo recorta dentro de ella.
--
-- REPRESENTACIÓN (la decisión que más importa aquí):
--
--   NULL   → sin restringir: el admin ve todos los dominios.
--   '{}'   → restringido a nada.
--   '{...}'→ exactamente esos dominios.
--
-- Se elige `TEXT[]` anulable y no una tabla de concesiones porque `NULL` y `'{}'`
-- son distinguibles, y una tabla con cero filas no lo es. Con una tabla, borrar
-- las filas de permisos por error ascendería al usuario a admin completo; con
-- esta columna lo degrada. El default `NULL` garantiza además que **todos los
-- admins existentes conserven el acceso que ya tenían**: esta migración no
-- cambia el comportamiento de nadie, solo habilita poder recortarlo después.

-- ── 1. La columna ───────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_permissions TEXT[];

COMMENT ON COLUMN public.profiles.admin_permissions IS
  'Dominios de /admin concedidos. NULL = sin restringir (todos). Solo aplica cuando role = ''admin''. Ver src/lib/admin-permissions.ts.';

-- `NULL` = sin restringir. El `CHECK` no admite NULL como violación, así que
-- solo valida el contenido cuando hay contenido.
DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_admin_permissions_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_admin_permissions_check
      CHECK (
        admin_permissions IS NULL
        OR admin_permissions <@ ARRAY[
             'productos', 'pedidos', 'comisiones', 'marketing', 'clientes', 'sistema'
           ]::TEXT[]
      );
  END IF;
END $constraint$;

-- ── 2. Privilegios ──────────────────────────────────────────
--
-- 00162 retiró `UPDATE` de tabla sobre `profiles` y concedió columnas una a una.
-- `admin_permissions` **no se añade a esa lista a propósito**: queda como `role`,
-- no escribible por el dueño de la cuenta. Si un admin pudiera editar su propio
-- ámbito desde el cliente, la restricción sería decorativa.

REVOKE UPDATE (admin_permissions) ON public.profiles FROM authenticated, anon;

DO $guard$
DECLARE
  v_bad TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF has_column_privilege('authenticated', 'public.profiles', 'admin_permissions', 'UPDATE') THEN
    v_bad := v_bad || 'authenticated';
  END IF;
  IF has_column_privilege('anon', 'public.profiles', 'admin_permissions', 'UPDATE') THEN
    v_bad := v_bad || 'anon';
  END IF;
  IF NOT has_column_privilege('service_role', 'public.profiles', 'admin_permissions', 'UPDATE') THEN
    v_bad := v_bad || 'service_role-sin-privilegio';
  END IF;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'profiles.admin_permissions: privilegios incorrectos: %',
      array_to_string(v_bad, ', ');
  END IF;
END $guard$;

-- ── 3. Índice ───────────────────────────────────────────────
--
-- El guard de cada ruta de /admin lee esta columna por `id` (PK, ya indexada),
-- así que no hace falta un índice sobre ella. Se deja constancia para que no se
-- añada "por si acaso": un GIN sobre una columna que solo se lee por PK sería
-- coste de escritura sin ninguna consulta que lo aproveche.
