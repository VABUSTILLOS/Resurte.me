-- ============================================================
-- 00037_price_sync_trigger.sql
--
-- Elimina la doble fuente de verdad de precios.
--
-- Contexto: `products.price/sale_price` y `product_stores.price/
-- sale_price` coexisten. El catálogo público lee `products`; el
-- admin edita `product_stores`. Sin sincronización, los precios
-- del catálogo pueden quedar desactualizados.
--
-- Fix: trigger AFTER INSERT/UPDATE/DELETE en product_stores que
-- refleja el precio de la TIENDA ACTIVA en `products`. Así hay una
-- única puerta de escritura (product_stores) y el catálogo público
-- siempre lee el valor fresco.
-- ============================================================

-- Función que sincroniza el precio desde la tienda activa a products.
CREATE OR REPLACE FUNCTION public.sync_active_store_price_to_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_price      NUMERIC(10,2);
  v_sale_price NUMERIC(10,2);
BEGIN
  -- El precio canónico es el de la tienda activa (si existe).
  SELECT ps.price, ps.sale_price
    INTO v_price, v_sale_price
  FROM public.product_stores ps
  JOIN public.stores s ON s.id = ps.store_id
  WHERE ps.product_id = COALESCE(NEW.product_id, OLD.product_id)
    AND s.is_active = true
  LIMIT 1;

  -- Si no hay tienda activa con este producto, dejamos los valores
  -- de products intactos (no los pisamos con NULL).
  IF v_price IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.products
  SET price = v_price,
      sale_price = v_sale_price,
      updated_at = now()
  WHERE id = COALESCE(NEW.product_id, OLD.product_id);

  RETURN NULL;
END;
$$;

-- Triggers de sincronización
DROP TRIGGER IF EXISTS trg_sync_price_on_insert ON public.product_stores;
CREATE TRIGGER trg_sync_price_on_insert
  AFTER INSERT ON public.product_stores
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_active_store_price_to_product();

DROP TRIGGER IF EXISTS trg_sync_price_on_update ON public.product_stores;
CREATE TRIGGER trg_sync_price_on_update
  AFTER UPDATE ON public.product_stores
  FOR EACH ROW
  WHEN (NEW.price IS DISTINCT FROM OLD.price OR NEW.sale_price IS DISTINCT FROM OLD.sale_price)
  EXECUTE FUNCTION public.sync_active_store_price_to_product();

-- En DELETE ya no queda fila en product_stores: recalculamos si hay
-- otra tienda activa con el mismo producto; si no, no tocamos products.
DROP TRIGGER IF EXISTS trg_sync_price_on_delete ON public.product_stores;
CREATE TRIGGER trg_sync_price_on_delete
  AFTER DELETE ON public.product_stores
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_active_store_price_to_product();

COMMENT ON TRIGGER trg_sync_price_on_insert ON public.product_stores
  IS 'Refleja el precio de la tienda activa en products al insertar un precio.';
COMMENT ON TRIGGER trg_sync_price_on_update ON public.product_stores
  IS 'Refleja el precio de la tienda activa en products al actualizar un precio.';
COMMENT ON TRIGGER trg_sync_price_on_delete ON public.product_stores
  IS 'Recalcula products.price desde la tienda activa al eliminar un precio.';
