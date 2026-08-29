-- ============================================================
-- Resurte.me — panel_entries: persistencia genérica de las
-- herramientas del panel ("Mi Restaurante")
--
-- Las herramientas del panel (ventas, mermas, inventario, comanda,
-- temporada, planificador, apertura, clientes, proveedores, reloj,
-- tarjetas de regalo, config) vivían solo en localStorage: se perdían
-- entre dispositivos y navegadores. Esta tabla las persiste con el
-- mismo patrón que panel_dishes (migración 00053): dueño = usuario
-- autenticado o guest_token anónimo (capability UUID v4), sync
-- bidireccional localStorage ↔ BD vía /api/panel/entries, y reclamo
-- de filas guest al iniciar sesión vía /api/addresses/claim.
--
-- Diseño: UNA sola tabla genérica en vez de una tabla por herramienta.
-- Todas las herramientas comparten la misma semántica de sync
-- (valor completo por clave de storage, replace-all, último escritor
-- gana), así que una tabla con columna `tool` evita duplicar ~10
-- esquemas idénticos y permite sumar herramientas sin migraciones.
--
--   tool           = clave de localStorage (p.ej. "ventas-entries")
--   collection_slug = colección de restaurante ("default" si no hay)
--   payload        = { "value": <valor JSON completo de la clave> }
--
-- Un (dueño, tool, collection_slug) tiene A LO SUMO una fila; el PUT
-- hace delete + insert (igual que /api/panel/dishes).
-- ============================================================

CREATE TABLE public.panel_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool              TEXT NOT NULL,
  collection_slug   TEXT NOT NULL DEFAULT 'default',
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_token       UUID,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT panel_entries_owner_chk CHECK (user_id IS NOT NULL OR guest_token IS NOT NULL),
  CONSTRAINT panel_entries_tool_chk CHECK (tool ~ '^[a-z0-9][a-z0-9-]{0,39}$')
);

CREATE INDEX idx_panel_entries_user ON public.panel_entries(user_id, tool, collection_slug);
CREATE INDEX idx_panel_entries_guest ON public.panel_entries(guest_token, tool, collection_slug);

ALTER TABLE public.panel_entries ENABLE ROW LEVEL SECURITY;

-- Lecturas/escrituras públicas pasan por /api/panel/entries (service role,
-- que bypasea RLS y valida el guest_token como capability). El usuario
-- autenticado puede operar sus propias filas directamente.
CREATE POLICY "Users manage own panel entries" ON public.panel_entries
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.panel_entries FROM anon;

COMMENT ON TABLE public.panel_entries
  IS 'Datos de las herramientas del panel (ventas, mermas, inventario, etc.). Dueño: user_id o guest_token anónimo (capability). Sync bidireccional con localStorage vía /api/panel/entries; una fila por (dueño, tool, collection_slug).';
