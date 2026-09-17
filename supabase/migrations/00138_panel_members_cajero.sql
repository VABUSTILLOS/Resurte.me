-- ============================================================
-- 00138 — Rol "cajero" para el personal del panel
-- ============================================================
-- El POS necesita quien cobre sin darle el menú, los precios ni la
-- configuración del restaurante. El rol "cajero" entra a la caja, al
-- mostrador, a las mesas y al tablero, y nada más (la matriz de
-- superficies vive en src/lib/panel-roles.ts).
--
-- Se recrea el CHECK en vez de encadenar ALTERs porque la restricción es
-- la definición completa del conjunto de roles válidos: así queda en un
-- solo lugar y se puede leer de un vistazo.
--
-- Idempotente: DROP ... IF EXISTS + ADD, y el ADD sólo si falta.

ALTER TABLE public.panel_members
  DROP CONSTRAINT IF EXISTS panel_members_role_valid;

ALTER TABLE public.panel_members
  ADD CONSTRAINT panel_members_role_valid
  CHECK (role IN ('gerente', 'cajero', 'cocina', 'mesero'));

-- Los dueños existentes conservan su rol: 'dueno' nunca se guarda en esta
-- tabla (el dueño se resuelve por owner_user_id), así que no hay filas que
-- migrar y la restricción anterior ya era la correcta para todos los datos
-- vivos.
