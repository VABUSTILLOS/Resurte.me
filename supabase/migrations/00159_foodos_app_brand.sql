-- ============================================================
-- 00159 — Identidad propia de la "app de tu marca" (capacidad `app_marca`).
--
-- El manifest PWA por restaurante ya existía (00023 + el builder de
-- `foodos-seo.ts`), pero el dueño no podía ajustar las dos piezas que el
-- comensal ve al instalar:
--
--   * `short_name`: el nombre bajo el icono. Estaba **derivado** cortando
--     `name` a 12 caracteres, así que "Restaurante La Parrilla" se instalaba
--     como "Restaurante " — un nombre truncado que el dueño no podía arreglar.
--   * `background_color`: la pantalla de arranque. Estaba fija en un gris
--     crema ajeno a la marca.
--
-- Ambas columnas son NULL-ables y NULL significa "usa el valor derivado de
-- siempre", así que ningún restaurante existente cambia de manifest al
-- aplicar esta migración.
-- ============================================================

ALTER TABLE public.foodos_restaurants
  ADD COLUMN IF NOT EXISTS app_short_name TEXT,
  ADD COLUMN IF NOT EXISTS app_background_color TEXT;

-- Los CHECK van en un DO para que la migración sea idempotente: `ADD
-- CONSTRAINT` no admite `IF NOT EXISTS` en Postgres.
DO $$
BEGIN
  -- `short_name` del manifest: la especificación de PWA recomienda ≤12
  -- caracteres porque es lo que cabe bajo el icono sin recortarse.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'foodos_restaurants_app_short_name_len'
  ) THEN
    ALTER TABLE public.foodos_restaurants
      ADD CONSTRAINT foodos_restaurants_app_short_name_len
      CHECK (
        app_short_name IS NULL
        OR char_length(btrim(app_short_name)) BETWEEN 1 AND 12
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'foodos_restaurants_app_background_color_hex'
  ) THEN
    ALTER TABLE public.foodos_restaurants
      ADD CONSTRAINT foodos_restaurants_app_background_color_hex
      CHECK (
        app_background_color IS NULL
        OR app_background_color ~ '^#[0-9A-Fa-f]{6}$'
      );
  END IF;
END $$;

COMMENT ON COLUMN public.foodos_restaurants.app_short_name IS
  'Nombre corto del manifest PWA (≤12 caracteres). NULL = derivado de `name`.';
COMMENT ON COLUMN public.foodos_restaurants.app_background_color IS
  'Color de fondo de la pantalla de arranque de la PWA, #RRGGBB. NULL = valor por omisión.';

-- ------------------------------------------------------------
-- Privilegios: el dueño NO escribe estas columnas directo
-- ------------------------------------------------------------
-- La política "Owner manages restaurants" es `FOR ALL`, así que `authenticated`
-- puede hacer un UPDATE de la fila completa desde supabase-js. Si el gate de
-- nivel viviera sólo en la Server Action, cualquier dueño por debajo de
-- Diamante podría saltárselo escribiendo la columna desde el navegador y la
-- capacidad quedaría anunciada como premium sin serlo.
--
-- Mismo patrón que el REVOKE de Connect (00085): se retira el UPDATE de
-- columna y la única vía de escritura es el service role, después de
-- `requireFoodosFeature("app_marca")` en `saveAppBrand`.
REVOKE UPDATE (
  app_short_name,
  app_background_color
) ON public.foodos_restaurants FROM authenticated, anon;

-- El micrositio público lee el restaurante con `select("*")` bajo RLS anónimo,
-- así que la política de SELECT existente ya cubre estas columnas.
