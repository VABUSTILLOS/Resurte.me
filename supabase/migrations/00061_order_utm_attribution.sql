-- ============================================================
-- 00061: Atribución UTM en pedidos
--
-- Permite medir la conversión por campaña/anuncio (equivalente a la
-- atribución de SamCart/ThriveCart). El checkout captura los parámetros
-- utm_* de la URL de aterrizaje (localStorage) y los envía en
-- POST /api/orders; aquí se persisten en `orders`.
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS utm_source   TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium   TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_term     TEXT,
  ADD COLUMN IF NOT EXISTS utm_content  TEXT;

-- Conversión por fuente/campaña (reportes en /admin).
CREATE INDEX IF NOT EXISTS idx_orders_utm_source   ON public.orders(utm_source)   WHERE utm_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_utm_campaign ON public.orders(utm_campaign) WHERE utm_campaign IS NOT NULL;

COMMENT ON COLUMN public.orders.utm_source IS 'Fuente de la campaña (utm_source) capturada en la URL de aterrizaje.';
COMMENT ON COLUMN public.orders.utm_campaign IS 'Campaña (utm_campaign) que originó el pedido; clave para ROAS.';
