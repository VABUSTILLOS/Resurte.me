-- ============================================================
-- Resurte.me — panel_members: roles de personal del panel
--
-- Fase 4.6. Un dueño (siempre usuario autenticado; los guests no
-- pueden invitar personal) invita por email a miembros con un rol:
--
--   gerente — todo excepto configuración y respaldo
--   cocina  — comanda e inventario (mermas)
--   mesero  — ventas y comanda
--
-- Flujo: el dueño crea la invitación (status 'pendiente',
-- invite_token único); el invitado acepta con sesión iniciada y su
-- user queda ligado (member_user_id, status 'activo'). A partir de
-- ahí las APIs del panel resuelven al dueño efectivo vía esta tabla
-- y aplican la matriz rol×herramienta (src/lib/panel-roles.ts).
--
-- RLS: el dueño administra sus miembros; el miembro solo puede leer
-- su propia fila (para saber su rol). Las escrituras de datos del
-- panel siguen pasando por las API routes con service client, que es
-- donde se aplica la matriz de permisos.
-- ============================================================

CREATE TABLE public.panel_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_email   TEXT NOT NULL,
  member_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  role           TEXT NOT NULL,
  invite_token   UUID NOT NULL DEFAULT gen_random_uuid(),
  status         TEXT NOT NULL DEFAULT 'pendiente',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT panel_members_role_valid CHECK (role IN ('gerente', 'cocina', 'mesero')),
  CONSTRAINT panel_members_status_valid CHECK (status IN ('pendiente', 'activo')),
  CONSTRAINT panel_members_email_valid CHECK (char_length(member_email) BETWEEN 3 AND 254),
  CONSTRAINT panel_members_not_self CHECK (member_user_id IS NULL OR member_user_id <> owner_user_id)
);

-- Una invitación por dueño+email.
CREATE UNIQUE INDEX panel_members_owner_email_unique
  ON public.panel_members (owner_user_id, lower(member_email));

-- Aceptación de invitación por token.
CREATE UNIQUE INDEX panel_members_invite_token_unique
  ON public.panel_members (invite_token);

-- Resolución del dueño efectivo al operar el panel como miembro.
CREATE INDEX panel_members_active_member
  ON public.panel_members (member_user_id)
  WHERE status = 'activo' AND member_user_id IS NOT NULL;

ALTER TABLE public.panel_members ENABLE ROW LEVEL SECURITY;

-- El dueño administra (lee/crea/edita/borra) sus miembros.
CREATE POLICY panel_members_owner_all ON public.panel_members
  FOR ALL USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- El miembro solo lee su propia fila (rol + estado).
CREATE POLICY panel_members_member_read ON public.panel_members
  FOR SELECT USING (auth.uid() = member_user_id);

REVOKE ALL ON public.panel_members FROM anon;
