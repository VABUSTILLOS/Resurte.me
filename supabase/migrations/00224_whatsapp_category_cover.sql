-- ============================================================================
-- 00224 — Portada por categoría EN EL CATÁLOGO de WhatsApp
--
-- QUÉ AÑADE
--   Una imagen de portada por (catálogo, categoría). Vive aquí y **no** en
--   `categories` a propósito: esa tabla es global (la usan la tienda y los
--   listados), así que una portada ahí sería de toda la tienda. El alcance
--   pedido es el catálogo de WhatsApp, y aquí queda acotado.
--
-- DÓNDE SE VE (y dónde no)
--   La portada se muestra en el panel del catálogo, para identificar cada
--   categoría de un vistazo. **No** aparece en el mensaje de WhatsApp: las
--   secciones de un `product_list` de Meta no admiten imagen por sección (solo
--   el encabezado del mensaje lleva una, y es una sola para todo el mensaje).
--   Es una preferencia de presentación del panel, no un campo del payload.
--
-- POR QUÉ EN ESTA TABLA
--   `whatsapp_catalog_categories` ya es la fila que representa "esta categoría
--   participa en este catálogo" (00223), así que la portada es un atributo de
--   esa relación. Poner una portada a una categoría que aún no estaba declarada
--   la declara (la acción hace upsert), que es coherente: si le pones portada,
--   es porque la quieres en el catálogo.
--
-- Idempotente.
-- ============================================================================

ALTER TABLE whatsapp_catalog_categories
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

COMMENT ON COLUMN whatsapp_catalog_categories.cover_image_url IS
  'Portada de la categoría en el panel del catálogo de WhatsApp. No se envía a Meta: product_list no admite imagen por sección.';
