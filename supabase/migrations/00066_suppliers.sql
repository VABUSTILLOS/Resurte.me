-- ============================================================
-- 00066 · suppliers + product_suppliers
-- Directorio de proveedores y vínculo producto ↔ proveedor con
-- costo de lista, SKU del proveedor y presentación.
--
-- Seguridad: los costos son información comercial confidencial.
-- RLS habilitado SIN políticas públicas: solo service_role (rutas
-- /api/admin/*) puede leer/escribir.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.suppliers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  contact_name TEXT,
  phone TEXT,
  -- Solo dígitos con código de país, listo para wa.me (p. ej. 5216142353333).
  whatsapp TEXT,
  email TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  status TEXT NOT NULL DEFAULT 'prospecto'
    CHECK (status IN (
      'prospecto', 'localizado', 'verificado', 'contactado',
      'cotizado', 'aprobado', 'activo'
    )),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_suppliers (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id BIGINT NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  supplier_sku TEXT,
  presentation TEXT,
  cost NUMERIC(12,2),
  list_date DATE,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, supplier_id, supplier_sku)
);

CREATE INDEX IF NOT EXISTS idx_product_suppliers_product
  ON public.product_suppliers (product_id);
CREATE INDEX IF NOT EXISTS idx_product_suppliers_supplier
  ON public.product_suppliers (supplier_id);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_suppliers ENABLE ROW LEVEL SECURITY;
-- Sin políticas: anon/authenticated no leen costos. service_role
-- brinca RLS y es el único canal (APIs admin).

REVOKE ALL ON public.suppliers FROM anon, authenticated;
REVOKE ALL ON public.product_suppliers FROM anon, authenticated;
GRANT ALL ON public.suppliers TO service_role;
GRANT ALL ON public.product_suppliers TO service_role;

-- updated_at genérico (reutilizable en tablas futuras)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_suppliers ON public.suppliers;
CREATE TRIGGER trg_touch_suppliers
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_product_suppliers ON public.product_suppliers;
CREATE TRIGGER trg_touch_product_suppliers
  BEFORE UPDATE ON public.product_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
