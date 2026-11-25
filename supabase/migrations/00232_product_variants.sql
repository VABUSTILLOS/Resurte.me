-- ============================================================================
-- 00232 — Presentaciones (variantes) de producto — Ola 3 de equiparación
--         con Take App
--
-- QUÉ AÑADE
--   · Tabla `product_variants`: un producto puede tener presentaciones
--     (bolsa 1 kg vs 5 kg, tamaño, sabor…), cada una con su propio
--     precio, precio de oferta, existencia y SKU. Hoy cada presentación
--     es un producto separado; esta tabla permite agruparlas en una
--     sola ficha.
--   · `order_items.variant_id` / `order_items.variant_label`: la línea
--     del pedido guarda QUÉ presentación se compró (id + nombre en
--     foto, para que el historial no dependa de que la variante siga
--     existiendo). NULL = línea sin presentación, como siempre.
--   · `reserve_order_stock` / `release_order_stock` (00143) se
--     redefinen para mover la existencia POR VARIANTE en las líneas
--     que la traen, y re-derivar el `stock_status` del producto padre
--     (agotado solo si TODAS sus presentaciones activas están
--     agotadas). Las líneas sin variante se comportan exactamente
--     como en 00143.
--
-- MODELO DE ACCESO de `product_variants`
--   Lectura pública SOLO de variantes activas (política SELECT
--   `USING (is_active = true)` + GRANT SELECT a anon/authenticated):
--   precio y existencia de una presentación son datos de catálogo,
--   igual que los de `products`. La escritura es solo del servidor
--   (service_role): ningún rol de cliente tiene INSERT/UPDATE/DELETE.
--   Por tener política, la tabla NO entra en el registro de
--   `rls-declared.contract.test.ts` (RLS sin políticas).
--
-- DECISIONES
--   · La cantidad mínima/máxima por pedido (00229) sigue siendo POR
--     PRODUCTO, no por variante: las líneas de todas las
--     presentaciones de un producto suman para el límite. Por eso no
--     hay columnas de límites en esta tabla.
--   · La variante NO tiene ventana de oferta (sale_starts_at /
--     sale_ends_at de 00107 son del producto): su `sale_price` es
--     directo, `sale_price ?? price` es su precio efectivo.
--   · `slug` es el identificador estable de la variante DENTRO de su
--     producto: lo fija el servidor al crearla (desde el nombre, con
--     sufijo si se repite) y NUNCA se regenera al renombrar — de él
--     cuelga el retailer_id del feed de Meta
--     (`<id del producto>--<slug de la variante>`), así que moverlo
--     crearía otro artículo en WhatsApp.
--   · El producto padre de un producto CON variantes conserva su
--     propio precio (es el precio de referencia de la tarjeta), pero
--     su `stock_status` pasa a ser un AGREGADO de sus variantes: lo
--     re-derivan estas RPC y las rutas de admin de variantes.
--
-- ADITIVA Y TOLERANTE
--   Todo nace vacío/NULL: los 268 productos actuales no tienen
--   variantes y se comportan igual que antes. El código degrada si
--   esta migración aún no se aplica (42P01/42703 → sin variantes).
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_variants (
  id             BIGSERIAL PRIMARY KEY,
  product_id     BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL,
  sku            TEXT,
  price          DECIMAL(10,2) NOT NULL,
  sale_price     DECIMAL(10,2),
  stock_quantity INTEGER,
  stock_status   stock_status NOT NULL DEFAULT 'in_stock',
  is_active      BOOLEAN NOT NULL DEFAULT true,
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_variants_product_slug
  ON product_variants (product_id, slug);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_active
  ON product_variants (product_id) WHERE is_active;

COMMENT ON TABLE product_variants IS
  'Presentaciones de un producto (00232): precio, oferta, existencia y SKU propios. Lectura pública solo de activas; escritura solo service_role.';
COMMENT ON COLUMN product_variants.slug IS
  'Identificador estable dentro del producto: se fija al crear y nunca se regenera al renombrar (de él cuelga el retailer_id del feed de Meta).';
COMMENT ON COLUMN product_variants.stock_quantity IS
  'Existencia de ESTA presentación. NULL = sin control de inventario, como en products.';

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Product variants are viewable by everyone" ON product_variants;
CREATE POLICY "Product variants are viewable by everyone" ON product_variants
  FOR SELECT USING (is_active = true);

REVOKE ALL ON product_variants FROM anon, authenticated;
GRANT SELECT ON product_variants TO anon, authenticated;

-- La línea del pedido guarda la presentación comprada.
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS variant_id BIGINT REFERENCES product_variants(id) ON DELETE SET NULL;
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS variant_label TEXT;

COMMENT ON COLUMN order_items.variant_id IS
  'Presentación comprada (00232). NULL = el producto se vendió sin presentaciones.';
COMMENT ON COLUMN order_items.variant_label IS
  'Nombre de la presentación en foto al momento de la compra (00232): el historial no depende de que la variante siga existiendo.';

-- ------------------------------------------------------------
-- Reservar (v2): las líneas con variante descuentan la existencia
-- DE LA VARIANTE; las demás, la del producto, como en 00143.
-- Los conflictos de variante llevan el product_id padre (los
-- mensajes al cliente nombran el producto) y el variant_id.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_order_stock(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already   BOOLEAN;
  v_conflicts JSONB := '[]'::JSONB;
  v_reserved  JSONB := '[]'::JSONB;
  v_row       RECORD;
BEGIN
  SELECT stock_reserved INTO v_already FROM orders WHERE id = p_order_id;
  IF v_already IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found',
                              'reserved', '[]'::JSONB, 'conflicts', '[]'::JSONB);
  END IF;
  IF v_already THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_reserved',
                              'reserved', '[]'::JSONB, 'conflicts', '[]'::JSONB);
  END IF;

  -- Bloqueo determinista: productos y variantes, siempre en orden
  -- de id, para que dos pedidos concurrentes no se interbloqueen.
  PERFORM 1
    FROM products p
   WHERE p.id IN (SELECT oi.product_id FROM order_items oi WHERE oi.order_id = p_order_id)
   ORDER BY p.id
   FOR UPDATE;
  PERFORM 1
    FROM product_variants v
   WHERE v.id IN (SELECT oi.variant_id FROM order_items oi
                   WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL)
   ORDER BY v.id
   FOR UPDATE;

  -- Faltantes de líneas SIN variante (por producto, como 00143).
  FOR v_row IN
    SELECT p.id AS pid, s.requested, p.stock_quantity AS available
      FROM (
        SELECT oi.product_id AS pid, SUM(oi.quantity)::INT AS requested
          FROM order_items oi
         WHERE oi.order_id = p_order_id AND oi.variant_id IS NULL
         GROUP BY oi.product_id
      ) s
      JOIN products p ON p.id = s.pid
     WHERE p.stock_quantity IS NOT NULL
       AND p.stock_quantity < s.requested
  LOOP
    v_conflicts := v_conflicts || jsonb_build_object(
      'product_id', v_row.pid,
      'requested',  v_row.requested,
      'available',  v_row.available
    );
  END LOOP;

  -- Faltantes POR VARIANTE.
  FOR v_row IN
    SELECT v.id AS vid, v.product_id AS pid, s.requested, v.stock_quantity AS available
      FROM (
        SELECT oi.variant_id AS vid, SUM(oi.quantity)::INT AS requested
          FROM order_items oi
         WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL
         GROUP BY oi.variant_id
      ) s
      JOIN product_variants v ON v.id = s.vid
     WHERE v.stock_quantity IS NOT NULL
       AND v.stock_quantity < s.requested
  LOOP
    v_conflicts := v_conflicts || jsonb_build_object(
      'product_id', v_row.pid,
      'variant_id', v_row.vid,
      'requested',  v_row.requested,
      'available',  v_row.available
    );
  END LOOP;

  IF jsonb_array_length(v_conflicts) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_stock',
                              'reserved', '[]'::JSONB, 'conflicts', v_conflicts);
  END IF;

  -- Descontar productos (líneas sin variante) y re-derivar su
  -- estado con el mismo umbral de 00143.
  FOR v_row IN
    SELECT p.id AS pid, s.requested, p.stock_status AS before_status
      FROM (
        SELECT oi.product_id AS pid, SUM(oi.quantity)::INT AS requested
          FROM order_items oi
         WHERE oi.order_id = p_order_id AND oi.variant_id IS NULL
         GROUP BY oi.product_id
      ) s
      JOIN products p ON p.id = s.pid
     WHERE p.stock_quantity IS NOT NULL
  LOOP
    UPDATE products p
       SET stock_quantity = p.stock_quantity - v_row.requested,
           stock_status = CASE
             WHEN p.stock_quantity - v_row.requested <= 0
               THEN 'out_of_stock'::stock_status
             WHEN p.stock_quantity - v_row.requested <= COALESCE(p.low_stock_threshold, 5)
               THEN 'low_stock'::stock_status
             ELSE 'in_stock'::stock_status
           END
     WHERE p.id = v_row.pid;

    INSERT INTO stock_adjustments (product_id, previous_status, new_status, note, adjusted_by)
    SELECT v_row.pid, v_row.before_status, p.stock_status,
           'Reserva automática por pedido #' || p_order_id, NULL
      FROM products p WHERE p.id = v_row.pid;

    v_reserved := v_reserved || jsonb_build_object(
      'product_id', v_row.pid, 'quantity', v_row.requested
    );
  END LOOP;

  -- Descontar variantes y re-derivar su estado con el umbral del
  -- producto padre (low_stock_threshold es del producto, 00108).
  FOR v_row IN
    SELECT v.id AS vid, v.product_id AS pid, s.requested,
           v.stock_status AS before_status, v.name AS vname
      FROM (
        SELECT oi.variant_id AS vid, SUM(oi.quantity)::INT AS requested
          FROM order_items oi
         WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL
         GROUP BY oi.variant_id
      ) s
      JOIN product_variants v ON v.id = s.vid
     WHERE v.stock_quantity IS NOT NULL
  LOOP
    UPDATE product_variants v
       SET stock_quantity = v.stock_quantity - v_row.requested,
           stock_status = CASE
             WHEN v.stock_quantity - v_row.requested <= 0
               THEN 'out_of_stock'::stock_status
             WHEN v.stock_quantity - v_row.requested <= COALESCE(
                    (SELECT pr.low_stock_threshold FROM products pr WHERE pr.id = v.product_id), 5)
               THEN 'low_stock'::stock_status
             ELSE 'in_stock'::stock_status
           END,
           updated_at = now()
     WHERE v.id = v_row.vid;

    INSERT INTO stock_adjustments (product_id, previous_status, new_status, note, adjusted_by)
    SELECT v_row.pid, v_row.before_status, v.stock_status,
           'Reserva automática por pedido #' || p_order_id ||
             ' · presentación «' || v_row.vname || '»', NULL
      FROM product_variants v WHERE v.id = v_row.vid;

    v_reserved := v_reserved || jsonb_build_object(
      'product_id', v_row.pid, 'variant_id', v_row.vid, 'quantity', v_row.requested
    );
  END LOOP;

  -- El estado del producto padre de cada variante tocada es un
  -- agregado: agotado solo si TODAS sus presentaciones activas
  -- están agotadas (las sin control de inventario cuentan como
  -- disponibles: su estado no es out_of_stock).
  UPDATE products p
     SET stock_status = CASE
           WHEN EXISTS (SELECT 1 FROM product_variants v
                         WHERE v.product_id = p.id AND v.is_active)
            AND NOT EXISTS (SELECT 1 FROM product_variants v
                             WHERE v.product_id = p.id AND v.is_active
                               AND v.stock_status <> 'out_of_stock')
             THEN 'out_of_stock'::stock_status
           ELSE 'in_stock'::stock_status
         END
   WHERE p.id IN (SELECT DISTINCT oi.product_id FROM order_items oi
                   WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL);

  UPDATE orders SET stock_reserved = true WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'reserved',
                            'reserved', v_reserved, 'conflicts', '[]'::JSONB);
END;
$$;

-- ------------------------------------------------------------
-- Liberar (v2): devuelve a cada variante lo suyo y al producto lo
-- de sus líneas sin variante. Simétrica de la reserva.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_order_stock(p_order_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserved BOOLEAN;
  v_restored JSONB := '[]'::JSONB;
  v_row      RECORD;
BEGIN
  SELECT stock_reserved INTO v_reserved FROM orders WHERE id = p_order_id;
  IF v_reserved IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found',
                              'restored', '[]'::JSONB);
  END IF;
  IF NOT v_reserved THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'not_reserved',
                              'restored', '[]'::JSONB);
  END IF;

  PERFORM 1
    FROM products p
   WHERE p.id IN (SELECT oi.product_id FROM order_items oi WHERE oi.order_id = p_order_id)
   ORDER BY p.id
   FOR UPDATE;
  PERFORM 1
    FROM product_variants v
   WHERE v.id IN (SELECT oi.variant_id FROM order_items oi
                   WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL)
   ORDER BY v.id
   FOR UPDATE;

  FOR v_row IN
    SELECT p.id AS pid, s.requested, p.stock_status AS before_status
      FROM (
        SELECT oi.product_id AS pid, SUM(oi.quantity)::INT AS requested
          FROM order_items oi
         WHERE oi.order_id = p_order_id AND oi.variant_id IS NULL
         GROUP BY oi.product_id
      ) s
      JOIN products p ON p.id = s.pid
     WHERE p.stock_quantity IS NOT NULL
  LOOP
    UPDATE products p
       SET stock_quantity = p.stock_quantity + v_row.requested,
           stock_status = CASE
             WHEN p.stock_quantity + v_row.requested <= 0
               THEN 'out_of_stock'::stock_status
             WHEN p.stock_quantity + v_row.requested <= COALESCE(p.low_stock_threshold, 5)
               THEN 'low_stock'::stock_status
             ELSE 'in_stock'::stock_status
           END
     WHERE p.id = v_row.pid;

    INSERT INTO stock_adjustments (product_id, previous_status, new_status, note, adjusted_by)
    SELECT v_row.pid, v_row.before_status, p.stock_status,
           'Devolución automática por cancelación del pedido #' || p_order_id, NULL
      FROM products p WHERE p.id = v_row.pid;

    v_restored := v_restored || jsonb_build_object(
      'product_id', v_row.pid, 'quantity', v_row.requested
    );
  END LOOP;

  FOR v_row IN
    SELECT v.id AS vid, v.product_id AS pid, s.requested,
           v.stock_status AS before_status, v.name AS vname
      FROM (
        SELECT oi.variant_id AS vid, SUM(oi.quantity)::INT AS requested
          FROM order_items oi
         WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL
         GROUP BY oi.variant_id
      ) s
      JOIN product_variants v ON v.id = s.vid
     WHERE v.stock_quantity IS NOT NULL
  LOOP
    UPDATE product_variants v
       SET stock_quantity = v.stock_quantity + v_row.requested,
           stock_status = CASE
             WHEN v.stock_quantity + v_row.requested <= 0
               THEN 'out_of_stock'::stock_status
             WHEN v.stock_quantity + v_row.requested <= COALESCE(
                    (SELECT pr.low_stock_threshold FROM products pr WHERE pr.id = v.product_id), 5)
               THEN 'low_stock'::stock_status
             ELSE 'in_stock'::stock_status
           END,
           updated_at = now()
     WHERE v.id = v_row.vid;

    INSERT INTO stock_adjustments (product_id, previous_status, new_status, note, adjusted_by)
    SELECT v_row.pid, v_row.before_status, v.stock_status,
           'Devolución automática por cancelación del pedido #' || p_order_id ||
             ' · presentación «' || v_row.vname || '»', NULL
      FROM product_variants v WHERE v.id = v_row.vid;

    v_restored := v_restored || jsonb_build_object(
      'product_id', v_row.pid, 'variant_id', v_row.vid, 'quantity', v_row.requested
    );
  END LOOP;

  UPDATE products p
     SET stock_status = CASE
           WHEN EXISTS (SELECT 1 FROM product_variants v
                         WHERE v.product_id = p.id AND v.is_active)
            AND NOT EXISTS (SELECT 1 FROM product_variants v
                             WHERE v.product_id = p.id AND v.is_active
                               AND v.stock_status <> 'out_of_stock')
             THEN 'out_of_stock'::stock_status
           ELSE 'in_stock'::stock_status
         END
   WHERE p.id IN (SELECT DISTINCT oi.product_id FROM order_items oi
                   WHERE oi.order_id = p_order_id AND oi.variant_id IS NOT NULL);

  UPDATE orders SET stock_reserved = false WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'released', 'restored', v_restored);
END;
$$;
