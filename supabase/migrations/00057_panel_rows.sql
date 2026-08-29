-- ============================================================
-- Resurte.me — panel_rows: almacenamiento por fila para las
-- herramientas del panel de alto volumen
--
-- Fase 4.2. `panel_entries` (00055) guarda el valor completo de cada
-- clave como un solo JSON con replace-all; eso escala mal para las
-- listas que crecen sin límite (ventas, mermas, movimientos de
-- inventario): el PUT tiene cap de 256 KB y cada cambio re-sube todo.
--
-- `panel_rows` guarda UNA fila por entidad (una venta, una merma, un
-- movimiento) con `client_id` idempotente, `entry_date` indexada para
-- filtros por rango y APIs paginadas. Mismo patrón de dueño
-- (user_id / guest_token), mismo RLS y mismo reclamo al login que
-- panel_entries / panel_dishes.
--
--   tool       = clave de storage ("ventas-entries", "mermas-entries",
--                "inventario-movimientos")
--   client_id  = id estable de la entidad en el cliente (SaleEntry.id,
--                WasteEntry.id o uno generado para movimientos)
--   entry_date = fecha de negocio de la entidad (para from/to)
--   payload    = la entidad completa en JSON
--
-- La migración de datos existentes es transparente: el primer GET de
-- /api/panel/rows importa el array de panel_entries si aún no hay filas.
-- ============================================================

CREATE TABLE public.panel_rows (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool              TEXT NOT NULL,
  collection_slug   TEXT NOT NULL DEFAULT 'default',
  user_id           UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_token       TEXT,
  client_id         TEXT NOT NULL,
  entry_date        DATE,
  payload           JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT panel_rows_tool_valid CHECK (tool ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  CONSTRAINT panel_rows_owner CHECK (
    (user_id IS NOT NULL AND guest_token IS NULL) OR
    (user_id IS NULL AND guest_token IS NOT NULL)
  ),
  CONSTRAINT panel_rows_client_id_len CHECK (char_length(client_id) BETWEEN 1 AND 80)
);

-- Una fila por (dueño, tool, colección, client_id): upsert idempotente.
CREATE UNIQUE INDEX panel_rows_user_unique
  ON public.panel_rows (user_id, tool, collection_slug, client_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX panel_rows_guest_unique
  ON public.panel_rows (guest_token, tool, collection_slug, client_id)
  WHERE guest_token IS NOT NULL;

CREATE INDEX panel_rows_user_date
  ON public.panel_rows (user_id, tool, collection_slug, entry_date)
  WHERE user_id IS NOT NULL;

CREATE INDEX panel_rows_guest_date
  ON public.panel_rows (guest_token, tool, collection_slug, entry_date)
  WHERE guest_token IS NOT NULL;

ALTER TABLE public.panel_rows ENABLE ROW LEVEL SECURITY;

-- Solo el dueño autenticado puede leer/escribir sus filas (los guests
-- pasan por la API con service client, igual que panel_entries).
CREATE POLICY panel_rows_select_own ON public.panel_rows
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY panel_rows_insert_own ON public.panel_rows
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY panel_rows_update_own ON public.panel_rows
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY panel_rows_delete_own ON public.panel_rows
  FOR DELETE USING (auth.uid() = user_id);

REVOKE ALL ON public.panel_rows FROM anon;

-- Multi-dispositivo: los cambios por fila llegan por Realtime a los
-- usuarios con sesión (RLS filtra; los guests re-descargan al volver a
-- la pestaña, igual que con panel_entries en 00056).
ALTER PUBLICATION supabase_realtime ADD TABLE public.panel_rows;
