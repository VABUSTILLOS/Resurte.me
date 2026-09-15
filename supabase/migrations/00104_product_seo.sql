-- ============================================================
-- SEO por producto: la página pública los prefiere en
-- generateMetadata (con fallback al título/descripción actuales).
-- Aditiva, idempotente.
-- ============================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS seo_title       TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT;
