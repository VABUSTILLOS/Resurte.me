-- ============================================================
-- 00143 — RESERVA Y LIBERACIÓN DE STOCK EN EL CICLO DEL PEDIDO
--
-- Antes de esta migración `products.stock_quantity` solo lo escribía el
-- panel admin: la tienda podía vender 100 piezas de un producto con 5 en
-- existencia y el inventario nunca bajaba. Estas dos funciones hacen el
-- descuento y la devolución de forma atómica, en el momento correcto.
--
-- Reglas:
--   · Solo se mueve lo que lleva control de inventario
--     (`stock_quantity IS NOT NULL`). NULL = sin control → se ignora.
--   · Las filas se bloquean en orden determinista (id) para que dos pedidos
--     concurrentes nunca se interbloqueen.
--   · Si falta existencia no se descuenta NADA y se devuelven los conflictos,
--     para que la API rechace el pedido con un mensaje útil.
--   · La idempotencia la da `orders.stock_reserved`: reservar dos veces o
--     liberar dos veces es un no-op. Así una cancelación repetida no infla
--     el inventario, ni un reintento descuenta doble.
--
-- OJO — el umbral de "stock bajo" (5) está duplicado aquí y en
-- `src/lib/stock.ts` (`deriveStockStatus` / `DEFAULT_LOW_STOCK_THRESHOLD`).
-- La derivación en SQL existe solo para que el descuento sea atómico; si
-- cambia el default allá, tiene que cambiar aquí también.
-- ============================================================

-- Marca de "este pedido ya descontó inventario". Aditiva e idempotente.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS stock_reserved BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN orders.stock_reserved IS
  'true = reserve_order_stock ya descontó products.stock_quantity para este pedido. Da idempotencia a reserva y liberación.';

-- ------------------------------------------------------------
-- Reservar: descuenta el inventario de los productos del pedido.
-- Devuelve {ok, reason, reserved[], conflicts[]}. Nunca lanza por
-- falta de existencia: el conflicto se reporta para que la API decida.
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

  -- Bloqueo determinista: siempre en orden de id, así dos pedidos
  -- concurrentes nunca se esperan mutuamente en distinto orden.
  PERFORM 1
    FROM products p
   WHERE p.id IN (SELECT oi.product_id FROM order_items oi WHERE oi.order_id = p_order_id)
   ORDER BY p.id
   FOR UPDATE;

  -- Faltantes. Se agrega por producto porque el carrito puede repetirlo.
  FOR v_row IN
    SELECT p.id AS pid, s.requested, p.stock_quantity AS available
      FROM (
        SELECT oi.product_id AS pid, SUM(oi.quantity)::INT AS requested
          FROM order_items oi
         WHERE oi.order_id = p_order_id
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

  IF jsonb_array_length(v_conflicts) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_stock',
                              'reserved', '[]'::JSONB, 'conflicts', v_conflicts);
  END IF;

  -- Descontar y re-derivar stock_status con el mismo umbral del panel.
  FOR v_row IN
    SELECT p.id AS pid, s.requested, p.stock_status AS before_status
      FROM (
        SELECT oi.product_id AS pid, SUM(oi.quantity)::INT AS requested
          FROM order_items oi
         WHERE oi.order_id = p_order_id
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

  UPDATE orders SET stock_reserved = true WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'reserved',
                            'reserved', v_reserved, 'conflicts', '[]'::JSONB);
END;
$$;

-- ------------------------------------------------------------
-- Liberar: devuelve al inventario lo que el pedido había descontado.
-- Se llama al cancelar. No-op si el pedido nunca reservó.
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

  FOR v_row IN
    SELECT p.id AS pid, s.requested, p.stock_status AS before_status
      FROM (
        SELECT oi.product_id AS pid, SUM(oi.quantity)::INT AS requested
          FROM order_items oi
         WHERE oi.order_id = p_order_id
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

  UPDATE orders SET stock_reserved = false WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true, 'reason', 'released', 'restored', v_restored);
END;
$$;

-- Solo el backend (service role) mueve inventario. Si `anon` o
-- `authenticated` pudieran llamarlas, cualquiera con la llave pública
-- podría vaciar el stock de un producto a voluntad.
REVOKE ALL ON FUNCTION public.reserve_order_stock(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_order_stock(BIGINT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.release_order_stock(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_order_stock(BIGINT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_order_stock(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_order_stock(BIGINT) TO service_role;
