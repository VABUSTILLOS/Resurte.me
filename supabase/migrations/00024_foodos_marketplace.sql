-- ============================================================
-- Marketplace hoyquecomemos.mx: capa de descubrimiento público.
-- Añade ciudad a las sucursales para filtrar el directorio.
-- ============================================================

ALTER TABLE foodos_branches
  ADD COLUMN IF NOT EXISTS city TEXT;

-- Índice parcial: restaurantes activos con sucursal (listado del directorio)
CREATE INDEX IF NOT EXISTS idx_foodos_restaurants_active
  ON foodos_restaurants (status, created_at DESC);

-- Búsqueda por ciudad en el directorio
CREATE INDEX IF NOT EXISTS idx_foodos_branches_city
  ON foodos_branches (city)
  WHERE city IS NOT NULL;
