-- ============================================================================
-- 00221 — Catálogo de WhatsApp principal: la marca `show_in_whatsapp` deja de
--         ser una bandera huérfana.
--
-- QUÉ PROBLEMA ARREGLA
--   `products.show_in_whatsapp` tenía switch por fila, acción en lote, campo en
--   el modal de producto, badge "pendiente de sync" y filtro "WA despublicado"
--   — todo eso en /admin/productos — pero NINGÚN camino de sync la leía: el
--   único productor era la curaduría `whatsapp_catalog_items`, y
--   `enqueueProductsForWaSync` sólo encola productos que ya están curados como
--   visibles. Marcar un producto en /admin/productos no lo metía al catálogo:
--   había que entrar a /admin/whatsapp. Esta migración une las dos verdades.
--
-- QUÉ AÑADE
--   1. `whatsapp_catalogs.is_default` + índice único parcial: UN solo catálogo
--      principal, garantizado por la base y no por convención.
--   2. `whatsapp_sync_queue.kind` ('upsert' | 'hide'): la cola sabe distinguir
--      "súbelo" de "márcalo no disponible".
--   3. Un trigger en `products` que mantiene la curaduría del catálogo
--      principal y encola el sync cuando cambia `show_in_whatsapp`.
--
-- QUIÉN ESCRIBE LA MARCA
--   Las ~7 rutas de escritura de productos (update, bulk, create, duplicate,
--   merge, delete, city-availability) y las altas por SQL. Por eso el puente
--   vive en un trigger y no en cada ruta: una sola definición, imposible de
--   olvidar en una ruta nueva. Las 3 acciones de curaduría escriben la marca
--   desde TypeScript (`src/app/admin/actions.ts`), nunca al revés: un puente
--   bidireccional sería un trigger recursivo.
--
-- POR QUÉ NO ROMPE NADA
--   - Sin catálogo principal el trigger es no-op: una escritura de producto
--     nunca falla por este motivo.
--   - En UPDATE sólo actúa si `show_in_whatsapp` cambió de valor, así que un
--     bulk de precios no paga nada.
--   - Un error inesperado se degrada a WARNING (mismo contrato "best-effort"
--     que `enqueueProductsForWaSync`) y, al correr el cuerpo en una
--     subtransacción implícita, la fila queda SIN CAMBIOS en vez de a medias:
--     no puede quedar curaduría sin encolado. La deriva queda visible en el
--     "pendiente de sync" del panel y en la previsualización de reconciliación.
--
-- LO QUE NO HACE
--   - No reconcilia nada: al desplegar no se toca ni la curaduría ni las
--     marcas. La reconciliación inicial es un botón explícito del admin
--     (`applyWaMembershipReconcile`), porque las dos direcciones posibles
--     ("la curaduría manda" / "las marcas mandan") reescriben cientos de
--     productos y eso no se hace sin que alguien lo vea.
--   - No borra en Meta: `kind = 'hide'` empuja `out of stock` (reversible). El
--     borrado sigue siendo una confirmación explícita del sync (invariante WA2).
--   - No toca catálogos que no sean el principal.
--
-- Idempotente.
-- ============================================================================

-- 1. CATÁLOGO PRINCIPAL -----------------------------------------
ALTER TABLE whatsapp_catalogs
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Un solo principal, garantizado por la base.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_catalogs_single_default
  ON whatsapp_catalogs(is_default)
  WHERE is_default;

COMMENT ON COLUMN whatsapp_catalogs.is_default IS
  'Catálogo principal: gobierna products.show_in_whatsapp. Uno solo (índice único parcial).';

-- 2. SEED DEL PRINCIPAL ----------------------------------------
-- Preferencia: 'global' (el fallback de plataforma que siembra 00090); si no
-- existe, el catálogo activo más antiguo. Sin catálogos no hace nada: el
-- trigger queda como no-op hasta que el admin cree uno.
DO $$
DECLARE
  v_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM whatsapp_catalogs WHERE is_default) THEN
    RETURN;
  END IF;

  SELECT id INTO v_id FROM whatsapp_catalogs WHERE slug = 'global' LIMIT 1;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM whatsapp_catalogs WHERE is_active ORDER BY created_at LIMIT 1;
  END IF;

  IF v_id IS NOT NULL THEN
    UPDATE whatsapp_catalogs SET is_default = true WHERE id = v_id;
  END IF;
END $$;

-- 3. COLA: upsert vs ocultar -----------------------------------
ALTER TABLE whatsapp_sync_queue
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'upsert';

-- DROP + ADD para que la migración se pueda re-ejecutar.
ALTER TABLE whatsapp_sync_queue DROP CONSTRAINT IF EXISTS whatsapp_sync_queue_kind_check;
ALTER TABLE whatsapp_sync_queue
  ADD CONSTRAINT whatsapp_sync_queue_kind_check CHECK (kind IN ('upsert', 'hide'));

COMMENT ON COLUMN whatsapp_sync_queue.kind IS
  'upsert = subir el payload completo; hide = marcar no disponible en Meta (reversible, no borra).';

-- 4. PUENTE products.show_in_whatsapp -> catálogo principal -----
CREATE OR REPLACE FUNCTION sync_wa_default_catalog_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_catalog  UUID;
  v_position INTEGER;
BEGIN
  -- En UPDATE, sólo si la marca cambió: un bulk de precios no paga nada.
  IF TG_OP = 'UPDATE' AND NEW.show_in_whatsapp IS NOT DISTINCT FROM OLD.show_in_whatsapp THEN
    RETURN NULL;
  END IF;

  -- En INSERT sin la marca no hay nada que ocultar: un producto recién creado
  -- no puede estar en la curaduría (la FK apunta a `products`), así que el
  -- DELETE de la rama ELSE sería un no-op por cada alta — importaciones CSV
  -- incluidas.
  IF TG_OP = 'INSERT' AND NEW.show_in_whatsapp IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  -- Sin catálogo principal no hay a quién alimentar: no-op, nunca error.
  SELECT id INTO v_catalog FROM whatsapp_catalogs WHERE is_default LIMIT 1;
  IF v_catalog IS NULL THEN
    RETURN NULL;
  END IF;

  IF NEW.show_in_whatsapp IS TRUE THEN
    SELECT MAX(position) INTO v_position
      FROM whatsapp_catalog_items
      WHERE catalog_id = v_catalog;

    -- Alta al final de la curaduría. Si ya estaba, se respeta su posición
    -- (reordenar es trabajo del admin, no del trigger) y sólo se re-visibilita.
    INSERT INTO whatsapp_catalog_items (catalog_id, product_id, position, is_visible)
    VALUES (v_catalog, NEW.id, COALESCE(v_position, 0) + 1, true)
    ON CONFLICT (catalog_id, product_id) DO UPDATE SET is_visible = true;

    INSERT INTO whatsapp_sync_queue (catalog_id, product_id, reason, kind)
    VALUES (v_catalog, NEW.id, 'show_in_whatsapp', 'upsert')
    ON CONFLICT (catalog_id, product_id) DO UPDATE
      SET reason = EXCLUDED.reason,
          kind = EXCLUDED.kind,
          attempts = 0,
          queued_at = now(),
          processed_at = NULL;
  ELSE
    DELETE FROM whatsapp_catalog_items
      WHERE catalog_id = v_catalog AND product_id = NEW.id;

    -- Sólo se encola 'hide' si de verdad había curaduría: marcar en false un
    -- producto que nunca estuvo en el catálogo no genera trabajo para Meta.
    IF FOUND THEN
      INSERT INTO whatsapp_sync_queue (catalog_id, product_id, reason, kind)
      VALUES (v_catalog, NEW.id, 'show_in_whatsapp', 'hide')
      ON CONFLICT (catalog_id, product_id) DO UPDATE
        SET reason = EXCLUDED.reason,
            kind = EXCLUDED.kind,
            attempts = 0,
            queued_at = now(),
            processed_at = NULL;
    END IF;
  END IF;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- El bloque corre en una subtransacción implícita: al caer aquí, la fila
  -- queda sin cambios (ni curaduría ni encolado), nunca a medias.
  RAISE WARNING 'sync_wa_default_catalog_membership: % (product %)', SQLERRM, NEW.id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_wa_default_membership ON products;
CREATE TRIGGER trg_products_wa_default_membership
  AFTER INSERT OR UPDATE OF show_in_whatsapp ON products
  FOR EACH ROW
  EXECUTE FUNCTION sync_wa_default_catalog_membership();
