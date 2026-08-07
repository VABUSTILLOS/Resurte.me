-- 00030_admin_users.sql
-- Tabla opcional para gestionar administradores desde la BD.
--
-- La fuente de verdad primaria para `requireAdmin()` (src/lib/admin-auth.ts)
-- es la variable de entorno ADMIN_EMAILS. Si esa variable está vacía, el
-- helper consulta esta tabla para decidir si el usuario logueado es admin.
--
-- Para otorgar admin:
--   INSERT INTO admin_users (user_id) VALUES ('<auth.users.id>');
-- Para revocarlo:
--   DELETE FROM admin_users WHERE user_id = '<auth.users.id>';

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- RLS: cualquier usuario logueado puede ver SU PROPIA fila (si existe).
-- El helper requireAdmin() usa el client SDK, así que necesita SELECT
-- para verificar si el usuario actual está registrado como admin.
alter table public.admin_users enable row level security;

drop policy if exists "admin_users_select_own" on public.admin_users;
create policy "admin_users_select_own"
  on public.admin_users
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Solo el service_role (backend) escribe; los usuarios nunca insertan.
drop policy if exists "admin_users_admin_write" on public.admin_users;
create policy "admin_users_admin_write"
  on public.admin_users
  for all
  to service_role
  using (true)
  with check (true);
