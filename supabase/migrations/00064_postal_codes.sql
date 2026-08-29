-- ============================================================
-- 00064: Catálogo de códigos postales → colonias (autocompletado)
--
-- Sustenta el autocompletado de colonia/municipio/estado en el
-- checkout (P7). Se puebla desde el catálogo oficial SEPOMEX con
-- un script de carga (COPY/INSERT masivo) — ver docs de ops.
-- Lectura pública: no contiene datos personales.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.postal_codes (
  zip_code     TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  municipality TEXT,
  state        TEXT,
  city_slug    TEXT,
  PRIMARY KEY (zip_code, neighborhood)
);

CREATE INDEX IF NOT EXISTS idx_postal_codes_zip ON public.postal_codes (zip_code);

ALTER TABLE public.postal_codes ENABLE ROW LEVEL SECURITY;

-- Catálogo público de solo lectura (sin PII).
DROP POLICY IF EXISTS postal_codes_public_read ON public.postal_codes;
CREATE POLICY postal_codes_public_read ON public.postal_codes
  FOR SELECT USING (true);

COMMENT ON TABLE public.postal_codes IS
  'Catálogo CP → colonia/municipio/estado (fuente SEPOMEX) para autocompletado de dirección en checkout.';
