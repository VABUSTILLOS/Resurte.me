-- ============================================================
-- 00065_product_city_availability.sql
--
-- Disponibilidad de productos por ciudad (selector en vivo).
--
-- Semántica (default global, opt-out por ciudad):
--   - Un producto SIN filas en esta tabla está disponible en TODAS
--     las ciudades. Así el catálogo actual no cambia de comportamiento
--     al aplicar la migración.
--   - En cuanto existe al menos una fila para un producto, el producto
--     solo está disponible en las ciudades con is_available = true.
--
-- La tienda filtra vía RPC get_available_product_ids(city_id) y el
-- panel /admin/disponibilidad escribe filas por (product_id, city_id).
-- Realtime: la tabla entra a la publicación para que el selector se
-- actualice en vivo entre sesiones/dispositivos.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.product_city_availability (
  id           BIGSERIAL PRIMARY KEY,
  product_id   BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  city_id      BIGINT NOT NULL REFERENCES public.cities(id) ON DELETE CASCADE,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, city_id)
);

CREATE INDEX IF NOT EXISTS idx_pca_city    ON public.product_city_availability(city_id);
CREATE INDEX IF NOT EXISTS idx_pca_product ON public.product_city_availability(product_id);

COMMENT ON TABLE public.product_city_availability IS
  'Disponibilidad por ciudad. Sin filas = disponible en todas las ciudades; con filas = solo donde is_available = true.';

-- RLS: lectura pública (la tienda filtra con el cliente anónimo);
-- escritura solo vía service_role (rutas /api/admin/* con requireAdmin).
ALTER TABLE public.product_city_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Product availability is viewable by everyone" ON public.product_city_availability;
CREATE POLICY "Product availability is viewable by everyone" ON public.product_city_availability
  FOR SELECT USING (true);

-- No se crean políticas de INSERT/UPDATE/DELETE: solo service_role bypassea RLS.

-- ============================================================
-- RPC: IDs de productos disponibles (y visibles) en una ciudad.
-- SECURITY DEFINER para leer ambas tablas con RLS; ejecución
-- concedida a anon/authenticated (la tienda usa cliente público).
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_available_product_ids(p_city_id BIGINT)
RETURNS SETOF BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id
  FROM public.products p
  WHERE p.is_visible = true
    AND (
      -- Default global: sin filas de disponibilidad -> todas las ciudades
      NOT EXISTS (
        SELECT 1 FROM public.product_city_availability a
        WHERE a.product_id = p.id
      )
      OR EXISTS (
        SELECT 1 FROM public.product_city_availability a
        WHERE a.product_id = p.id
          AND a.city_id = p_city_id
          AND a.is_available = true
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_available_product_ids(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_available_product_ids(BIGINT) TO anon, authenticated, service_role;

-- ============================================================
-- Realtime: el selector /admin/disponibilidad se suscribe a
-- postgres_changes para reflejar cambios hechos desde otras
-- sesiones sin recargar (mismo patrón que 00056 panel_entries).
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'product_city_availability'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_city_availability;
  END IF;
END $$;
