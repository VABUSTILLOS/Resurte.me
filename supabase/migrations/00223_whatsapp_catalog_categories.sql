-- ============================================================================
-- 00223 — Orden de categorías POR CATÁLOGO de WhatsApp
--
-- QUÉ RESUELVE
--   El panel del catálogo lista las categorías de sus productos curados, pero
--   **no había dónde guardar un orden propio**: `categories` (00001) sólo tiene
--   `id, name, slug, icon, parent_id, created_at`, sin columna de orden. Hasta
--   ahora las secciones del mensaje `product_list` salían en orden de PRIMERA
--   APARICIÓN en la curaduría — un orden que nadie eligió.
--
-- POR QUÉ POR CATÁLOGO Y NO UNA COLUMNA EN `categories`
--   Las categorías son GLOBALES: la misma fila la usan la tienda, los listados y
--   el admin. Un `categories.sort_order` cambiaría el orden de las categorías en
--   **toda la tienda**, que es justo lo que no se pidió. Esta tabla es del
--   catálogo de WhatsApp: reordenar aquí no toca nada más.
--
-- QUÉ ES (Y QUÉ NO ES)
--   Una lista ORDENADA de categorías declaradas para el catálogo. Es una
--   preferencia de presentación:
--     - No crea ni borra categorías (eso vive en `categories`).
--     - No mueve ni clasifica productos.
--     - Una categoría declarada sin productos curados simplemente no aparece en
--       el mensaje: declara su POSICIÓN para cuando los tenga.
--   El orden declarado manda sobre el de primera aparición; lo que no esté
--   declarado se añade después, conservando el orden de la curaduría.
--
-- SEGURIDAD
--   Mismo criterio que el resto de tablas `whatsapp_catalog_*`: RLS habilitada
--   SIN políticas, así que sólo el service role (las acciones admin tras
--   `requireAdmin`) la lee y la escribe. No se relaja ninguna política.
--
-- Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_catalog_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id  UUID NOT NULL REFERENCES whatsapp_catalogs(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (catalog_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_wa_catalog_categories_order
  ON whatsapp_catalog_categories(catalog_id, position);

ALTER TABLE whatsapp_catalog_categories ENABLE ROW LEVEL SECURITY;
-- Sin políticas: sólo service role (acciones admin + cron), igual que
-- whatsapp_catalog_items y whatsapp_catalogs.

COMMENT ON TABLE whatsapp_catalog_categories IS
  'Orden de categorías declarado por catálogo de WhatsApp. No afecta a la tienda ni a la tabla categories.';
