-- ============================================================
-- 00076: delivery_drivers + asignación de repartidor + bucket productos
--
-- Cierra la operación logística del pedido: el admin asigna un repartidor
-- en /admin/pedidos y el cliente ve "Repartidor: <nombre>" en el rastreo
-- público (/pedido/[id]) cuando va en camino.
--
-- Además crea el bucket público `productos` para el upload de imágenes
-- desde /admin/productos (antes solo se podía pegar una URL externa).
-- ============================================================

CREATE TABLE public.delivery_drivers (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS driver_id BIGINT REFERENCES public.delivery_drivers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_driver ON public.orders(driver_id) WHERE driver_id IS NOT NULL;

ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;
-- Sin políticas públicas: el catálogo de repartidores es interno (admin
-- vía service_role). El rastreo público expone solo el primer nombre del
-- repartidor asignado, vía API con capability token.

COMMENT ON TABLE public.delivery_drivers IS 'Repartidores asignables a pedidos desde /admin/pedidos.';

-- ── Storage: bucket público para imágenes de producto ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('productos', 'productos', true)
ON CONFLICT (id) DO NOTHING;

-- Lectura pública (las imágenes se sirven en la tienda); escritura solo
-- vía service_role (POST /api/admin/products/upload-image con requireAdmin).
CREATE POLICY productos_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'productos');
