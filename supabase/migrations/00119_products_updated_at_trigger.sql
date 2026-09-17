-- ============================================================
-- 00119 — `products.updated_at` siempre refleja la última escritura
-- ============================================================
-- Ronda 10 (B19). La concurrencia optimista del panel compara el
-- `updated_at` que el cliente leyó contra el vigente: si no se mueve en
-- cada escritura, la precondición nunca detecta nada.
--
-- Hasta ahora `updated_at` solo lo escribían a mano algunas rutas (la
-- importación, por ejemplo) y el resto de los caminos del panel lo dejaban
-- intacto. El trigger lo garantiza para TODOS los escritores (update, bulk,
-- merge, store-prices, bulk-seo, reorder, restauración desde la papelera…),
-- incluidas las escrituras hechas fuera de la API.
--
-- Aditiva e idempotente: no cambia firmas ni borra datos.
-- La API además escribe `updated_at` explícitamente, así que el panel
-- funciona aunque esta migración todavía no esté aplicada.

CREATE OR REPLACE FUNCTION products_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_touch_updated_at ON products;

CREATE TRIGGER products_touch_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION products_touch_updated_at();

-- Índice de apoyo: ordenar/filtrar por edición reciente en el panel.
CREATE INDEX IF NOT EXISTS idx_products_updated_at ON products(updated_at DESC);
