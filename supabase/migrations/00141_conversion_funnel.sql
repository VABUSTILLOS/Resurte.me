-- ============================================================
-- 00141: Embudo de conversión — índice de periodo y agregado en una vuelta
--
-- El panel `/admin/conversion` medía mal y además no cuadraba:
--
--   1. `GET /api/admin/funnel` filtraba `orders` por `created_at >= since`,
--      pero `orders` **no tenía índice por `created_at`** (los tiene por
--      `status`, `payment_status`, `user_id`, `store_id`… y por `utm_source`,
--      pero ninguno por fecha). Cada carga del panel barría la tabla completa.
--
--   2. El conteo se hacía en Node sobre las filas descargadas, así que
--      PostgREST lo truncaba en silencio al llegar a `max-rows` (~1000): con
--      más de mil pedidos en el periodo el embudo mentía sin avisar.
--
--   3. Los pagos con tarjeta rechazada (`payment_status = 'failed'`) no
--      entraban en ningún desenlace, así que el panel podía decir
--      "abandonados pendientes: 0" mientras tres pedidos por $717 se habían
--      caído en el cobro.
--
-- Esta migración añade el índice que faltaba y mueve el conteo a Postgres, que
-- agrega en una sola vuelta y sin tope de filas. El desenlace se calcula con la
-- MISMA regla que `classifyOrder` en `src/lib/conversion-funnel.ts`; el motor en
-- JS sigue siendo la referencia y la ruta degrada a él si esta migración no
-- está aplicada.
--
-- Aditiva e idempotente. No modifica datos ni columnas existentes.
-- ============================================================

-- ------------------------------------------------------------
-- Índice de periodo
-- ------------------------------------------------------------

-- Cubre la ruta de acceso del embudo (rango por `created_at`) y de paso sirve
-- el `ORDER BY created_at DESC` del listado de pedidos. Las columnas `INCLUDE`
-- son exactamente las que agrega `admin_conversion_funnel_window`, de modo que
-- la consulta se resuelve con un *index-only scan* y no toca el heap.
--
-- `id` va incluido porque el respaldo en JS necesita la llave para cruzar los
-- correos de recuperación con el desenlace de cada pedido.
CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders (created_at DESC)
  INCLUDE (id, status, payment_status, payment_method, total, utm_source);

-- ------------------------------------------------------------
-- Atribución UTM
-- ------------------------------------------------------------

-- `00061` ya la crea; se repite aquí con el mismo `IF NOT EXISTS` para que este
-- archivo sea aplicable por sí solo (el agregado de abajo la referencia y una
-- migración que aborta por una columna ausente es peor que una redundante).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS utm_source TEXT;

-- ------------------------------------------------------------
-- Agregado de una ventana
-- ------------------------------------------------------------

/**
 * Embudo de conversión de una sola ventana `[p_since, p_until)`.
 *
 * Devuelve JSONB para resolver todo en una ida, sin `jsonb_agg` vacío → NULL en
 * cada rama. `byOutcome` SIEMPRE trae los cinco desenlaces, incluso en cero, así
 * que el llamador nunca tiene que inventarse una clave ausente.
 *
 * El desenlace replica `classifyOrder` (`src/lib/conversion-funnel.ts`), en este
 * orden de prioridad:
 *
 *   pagado → pago fallido → cancelado → abandonado → otro
 *
 * Un pago rechazado gana sobre la cancelación a propósito: la tarjeta declinada
 * es el hecho que el panel debe mostrar y esconderlo detrás de "cancelado" es el
 * defecto que esta ronda corrige. `abandonado` es exactamente el conjunto que
 * contacta el motor de recuperación (`isAbandonedCartOrder`), incluidos OXXO,
 * SPEI y CoDi, y excluida contra entrega.
 *
 * `payment_method IS NULL` cuenta como abandonado, igual que en JS: un pedido
 * sin método de pago es el abandono más literal que hay.
 */
CREATE OR REPLACE FUNCTION admin_conversion_funnel_window(
  p_since timestamptz,
  p_until timestamptz
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH outcomes(outcome, sort) AS (
    VALUES ('paid', 1), ('failed', 2), ('pending', 3), ('cancelled', 4), ('other', 5)
  ),
  scoped AS (
    SELECT
      o.total,
      COALESCE(NULLIF(btrim(o.utm_source), ''), '(directo)') AS source,
      CASE
        WHEN o.payment_status = 'paid' THEN 'paid'
        WHEN o.payment_status = 'failed' THEN 'failed'
        WHEN o.status = 'cancelled' THEN 'cancelled'
        WHEN o.status = 'pending' AND o.payment_status = 'pending'
             AND (o.payment_method IS NULL OR o.payment_method <> 'cash_on_delivery')
          THEN 'pending'
        ELSE 'other'
      END AS outcome,
      o.payment_method
    FROM orders o
    WHERE o.created_at >= p_since AND o.created_at < p_until
  ),
  outcome_rows AS (
    SELECT o.outcome,
           o.sort,
           count(s.outcome) AS n,
           COALESCE(sum(s.total), 0) AS amount
      FROM outcomes o
      LEFT JOIN scoped s ON s.outcome = o.outcome
     GROUP BY o.outcome, o.sort
  ),
  method_rows AS (
    SELECT COALESCE(payment_method::text, '(sin método)') AS method,
           count(*) AS n,
           count(*) FILTER (WHERE outcome = 'paid') AS paid,
           count(*) FILTER (WHERE outcome = 'failed') AS failed,
           count(*) FILTER (WHERE outcome = 'pending') AS pending,
           COALESCE(sum(total) FILTER (WHERE outcome = 'paid'), 0) AS revenue
      FROM scoped
     GROUP BY 1
  ),
  utm_rows AS (
    SELECT source,
           count(*) AS n,
           count(*) FILTER (WHERE outcome = 'paid') AS paid,
           count(*) FILTER (WHERE outcome = 'failed') AS failed,
           COALESCE(sum(total) FILTER (WHERE outcome = 'paid'), 0) AS revenue
      FROM scoped
     GROUP BY 1
  )
  SELECT jsonb_build_object(
    'created', (SELECT count(*) FROM scoped),
    'byOutcome', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object('outcome', outcome, 'count', n, 'amount', amount)
               ORDER BY sort)
        FROM outcome_rows
    ), '[]'::jsonb),
    'byMethod', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'method', method, 'created', n, 'paid', paid,
                 'failed', failed, 'pending', pending, 'revenue', revenue)
               ORDER BY n DESC, method ASC)
        FROM method_rows
    ), '[]'::jsonb),
    'byUtm', COALESCE((
      SELECT jsonb_agg(
               jsonb_build_object(
                 'source', source, 'created', n, 'paid', paid,
                 'failed', failed, 'revenue', revenue)
               ORDER BY revenue DESC, n DESC, source ASC)
        FROM (SELECT * FROM utm_rows ORDER BY revenue DESC, n DESC, source ASC LIMIT 10) t
    ), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION admin_conversion_funnel_window(timestamptz, timestamptz) IS
  'Embudo de conversión de una ventana: pedidos creados, desglose por desenlace (pagado, pago fallido, abandonado, cancelado, otro) con importes, por método de pago y por fuente UTM. Réplica de classifyOrder/buildFunnel en SQL.';

-- ------------------------------------------------------------
-- Agregado de periodo actual + anterior
-- ------------------------------------------------------------

/**
 * Embudo del periodo y del periodo anterior comparable, en una sola llamada.
 *
 * `previous` es `null` cuando no se pide comparación (periodo anterior
 * desconocido). Es distinto de "el periodo anterior tuvo cero pedidos", que
 * devuelve un agregado con todo en cero: el panel pinta "sin base" en el primer
 * caso y una caída real en el segundo.
 */
CREATE OR REPLACE FUNCTION admin_conversion_funnel(
  p_since timestamptz,
  p_until timestamptz,
  p_prev_since timestamptz DEFAULT NULL,
  p_prev_until timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object(
    'current', admin_conversion_funnel_window(p_since, p_until),
    'previous',
      CASE
        WHEN p_prev_since IS NULL OR p_prev_until IS NULL THEN NULL
        ELSE admin_conversion_funnel_window(p_prev_since, p_prev_until)
      END
  );
$$;

COMMENT ON FUNCTION admin_conversion_funnel(timestamptz, timestamptz, timestamptz, timestamptz) IS
  'Embudo de conversión del periodo actual y del anterior comparable en una sola consulta.';

-- ------------------------------------------------------------
-- Permisos
-- ------------------------------------------------------------

-- Solo el panel (`service_role`) consume estas funciones. Sin el REVOKE, una
-- función nueva en `public` nace con EXECUTE para PUBLIC.
REVOKE ALL ON FUNCTION public.admin_conversion_funnel_window(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_conversion_funnel(timestamptz, timestamptz, timestamptz, timestamptz) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_conversion_funnel_window(timestamptz, timestamptz) FROM anon';
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_conversion_funnel(timestamptz, timestamptz, timestamptz, timestamptz) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_conversion_funnel_window(timestamptz, timestamptz) FROM authenticated';
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_conversion_funnel(timestamptz, timestamptz, timestamptz, timestamptz) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_conversion_funnel_window(timestamptz, timestamptz) TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_conversion_funnel(timestamptz, timestamptz, timestamptz, timestamptz) TO service_role';
  END IF;
END $$;
