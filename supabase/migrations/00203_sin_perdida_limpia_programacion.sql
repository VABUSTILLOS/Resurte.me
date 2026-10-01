-- ============================================================
-- 00203 — Cerrar el hueco que dejo 00202: la publicacion programada
--
-- EL BUG
-- ------
-- `00202` oculto 22 productos de FRUGASA que no se pueden vender sin perder
-- dinero, con `is_visible = false`. Pero **no limpio `publish_at`**.
--
-- El job `scheduled-publishing` del cron diario hace exactamente esto:
--
--     UPDATE products SET is_visible = true, publish_at = null
--     WHERE publish_at <= now() AND publish_at IS NOT NULL;
--
-- Asi que un producto oculto por la regla con una fecha de publicacion
-- pendiente **vuelve al aire solo**, a un precio por debajo del costo y sin
-- que nadie lo note: la regla A se rompe en silencio a las 12:00 UTC.
--
-- El panel no tiene este problema porque `validateProductPatch` limpia la
-- programacion cuando `is_visible` viaja sin fechas explicitas (00107). El
-- SQL de una migracion no pasa por esa validacion, y ahi quedo el hueco.
--
-- QUE HACE
-- --------
-- Para todo producto que la regla deja sin precio valido: lo oculta y le
-- borra `publish_at` y `unpublish_at`.
--
-- COMO IDENTIFICA LOS PRODUCTOS (sin factores)
-- --------------------------------------------
-- Cada proveedor guarda `cost` en una base distinta, y la comparacion se
-- hace en la base que corresponde a cada uno, sin necesitar el peso de la
-- unidad de venta:
--
--   · FRUGASA  -> `cost` es POR KILO y `competitor_prices.unit_price`
--                 tambien: se comparan directo.
--   · AB Foods -> `cost` es POR UNIDAD DE VENTA y `products.price` tambien
--                 (precio por caja, bolsa o kilo): se comparan directo.
--
-- Es la misma condicion que evalua `00202`, escrita de la forma que no
-- obliga a repetir la tabla de pesos.
--
-- Idempotente: re-ejecutarla no encuentra nada que limpiar.
-- ============================================================

DO $$
DECLARE
  v_con_programacion int;
  v_afectados int;
  v_restantes int;
BEGIN
  CREATE TEMP TABLE _sin_precio ON COMMIT DROP AS
  SELECT p.id,
         p.slug,
         p.publish_at,
         p.unpublish_at,
         s.slug AS proveedor
  FROM public.products p
  JOIN public.product_suppliers ps ON ps.product_id = p.id AND ps.cost IS NOT NULL
  JOIN public.suppliers s ON s.id = ps.supplier_id
  LEFT JOIN (
    SELECT product_id, MIN(unit_price) AS unit_price
    FROM public.competitor_prices
    WHERE unit_price IS NOT NULL
    GROUP BY product_id
  ) cp ON cp.product_id = p.id
  WHERE s.slug IN ('frugasa', 'ab-foods')
    AND (
      (s.slug = 'frugasa' AND cp.unit_price IS NOT NULL AND cp.unit_price < ps.cost)
      OR (s.slug = 'ab-foods' AND p.price < ps.cost)
    );

  -- Cuantos traian una programacion viva: es la medida de si el hueco llego
  -- a estar armado en produccion.
  SELECT count(*) INTO v_con_programacion
  FROM _sin_precio
  WHERE publish_at IS NOT NULL OR unpublish_at IS NOT NULL;

  UPDATE public.products p
  SET is_visible = false,
      publish_at = NULL,
      unpublish_at = NULL,
      updated_at = now()
  FROM _sin_precio x
  WHERE p.id = x.id
    AND (p.is_visible OR p.publish_at IS NOT NULL OR p.unpublish_at IS NOT NULL);
  GET DIAGNOSTICS v_afectados = ROW_COUNT;

  -- Guarda en positivo: ninguno puede quedar con programacion pendiente.
  SELECT count(*) INTO v_restantes
  FROM public.products p
  JOIN _sin_precio x ON x.id = p.id
  WHERE p.publish_at IS NOT NULL OR p.unpublish_at IS NOT NULL;

  IF v_restantes > 0 THEN
    RAISE EXCEPTION
      '00203: % productos sin precio valido conservan publicacion programada', v_restantes;
  END IF;

  RAISE NOTICE
    '00203: % productos sin precio valido asegurados como ocultos; % traian programacion viva.',
    v_afectados, v_con_programacion;
END $$;
