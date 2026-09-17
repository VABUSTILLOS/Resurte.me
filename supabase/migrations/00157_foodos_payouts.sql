-- ============================================================
-- 00157: Dispersiones a restaurantes FoodOS (custodia de fondos)
--
-- El problema (punto medio de C.2): `STRIPE_CONNECT_ENABLED` no existe en
-- producción, así que `isConnectRoutingEnabled()` es false y
-- `buildDestinationChargeParams()` devuelve `{}`. Todo cargo con tarjeta
-- del micrositio FoodOS entra a la cuenta Stripe de Resurte.me. El
-- restaurante no recibe nada hasta que alguien le transfiere a mano.
--
-- La migración 00085 ya dejó el rastro por pedido
-- (`foodos_orders.connected_account_id`: NULL = los fondos los tiene la
-- plataforma), pero NO existe ninguna superficie ni tabla que registre la
-- dispersión. Consecuencias concretas:
--
--  1. No se sabe cuánto se le debe a cada restaurante. La obligación se
--     puede reconstruir (suma de pedidos pagados sin cuenta conectada)
--     pero nadie la calcula y nadie la muestra.
--
--  2. No se puede SALDAR. No hay dónde escribir "a este restaurante ya le
--     transferí $4,120 el 3 de julio por SPEI 4471". Un saldo que no baja
--     nunca no sirve para operar: el segundo mes se paga dos veces o no se
--     paga. Es el mismo fallo que 00155 cerró para las comisiones.
--
--  3. La comisión que la plataforma retiene sobre los pedidos en custodia
--     no queda registrada en ningún lado. `foodos_orders.application_fee_amount`
--     sólo se escribe cuando el cargo fue destination charge (00085), así
--     que en custodia manual la retención es un hecho no auditable.
--
-- Decisiones explícitas:
--
--  1. `outstanding = gross_collected - settled_total - fee_total`, donde
--     `gross_collected` son los pedidos pagados SIN cuenta conectada. Se
--     resta también `fee_total` porque esa parte del bruto ya quedó
--     aplicada a favor de la plataforma: dejarla en el saldo haría que el
--     restaurante pudiera cobrarla dos veces.
--
--     Una dispersión negativa (el restaurante devuelve dinero) SUMA al
--     saldo, no lo resta: al regresar el efectivo, la obligación vuelve.
--     Por eso `settled_amount <> 0` y no `> 0`.
--
--  2. El ledger es append-only. Una dispersión ya salió del banco;
--     reescribirla destruiría la conciliación. Una corrección se registra
--     como otra fila (negativa) con su propio comprobante y motivo.
--
--  3. La comisión retenida se captura POR DISPERSIÓN (`fee_amount`), no se
--     calcula con `platform_fee_percent`. La tasa vigente es una política;
--     lo retenido es un hecho. Calcular el segundo con el primero repetiría
--     el fallo que 00155 documenta: cambiar la tasa reescribiría el pasado.
--     `platform_fee_percent` sólo se expone como referencia en el saldo.
--
--  4. Toda dispersión exige comprobante (`reference`) y la referencia es
--     única por restaurante. Es la defensa contra el doble registro por
--     doble clic, igual que el índice único de comprobantes de crédito.
--
--  5. Pagar de más se rechaza. `record_foodos_payout` recalcula el saldo
--     con la fila del restaurante bloqueada y rechaza si la dispersión
--     excede lo pendiente. Es una comprobación de cordura, no un invariante
--     duro: el bruto se mueve si después entra una devolución.
-- ============================================================

-- ── 1. Dispersiones ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.foodos_payouts (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id   UUID NOT NULL REFERENCES public.foodos_restaurants(id) ON DELETE RESTRICT,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  -- Negativo = el restaurante devolvió dinero; la obligación vuelve.
  settled_amount  NUMERIC(14,2) NOT NULL,
  fee_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  reference       TEXT NOT NULL,
  notes           TEXT,
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.foodos_payouts IS
  'Ledger append-only de dispersiones a restaurantes FoodOS por fondos que la plataforma cobró en custodia (pedidos con connected_account_id NULL).';
COMMENT ON COLUMN public.foodos_payouts.period_start IS
  'Inicio de la ventana de ventas que esta dispersión salda. Sólo informativo: el saldo se calcula sobre todo el histórico.';
COMMENT ON COLUMN public.foodos_payouts.settled_amount IS
  'Monto transferido al restaurante. Negativo si el restaurante devolvió dinero (la obligación se restaura).';
COMMENT ON COLUMN public.foodos_payouts.fee_amount IS
  'Comisión retenida por la plataforma en esta dispersión. Se captura, no se calcula: lo retenido es un hecho, no una tasa vigente.';
COMMENT ON COLUMN public.foodos_payouts.reference IS
  'Comprobante de la transferencia (folio SPEI, id de operación). Único por restaurante; es la defensa contra el doble registro.';

-- ── 2. Coherencia ───────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'foodos_payouts_amounts_check'
      AND conrelid = 'public.foodos_payouts'::regclass
  ) THEN
    ALTER TABLE public.foodos_payouts
      ADD CONSTRAINT foodos_payouts_amounts_check
      CHECK (settled_amount <> 0 AND fee_amount >= 0);

    ALTER TABLE public.foodos_payouts
      ADD CONSTRAINT foodos_payouts_range_check
      CHECK (period_end >= period_start);

    ALTER TABLE public.foodos_payouts
      ADD CONSTRAINT foodos_payouts_reference_check
      CHECK (length(btrim(reference)) >= 4);

    -- Una corrección (dispersión negativa) sin explicación es una
    -- manipulación del saldo; se exige motivo.
    ALTER TABLE public.foodos_payouts
      ADD CONSTRAINT foodos_payouts_correction_check
      CHECK (settled_amount > 0 OR length(btrim(coalesce(notes, ''))) >= 5);

    ALTER TABLE public.foodos_payouts
      ADD CONSTRAINT foodos_payouts_unique_reference
      UNIQUE (restaurant_id, reference);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_foodos_payouts_restaurant_paid
  ON public.foodos_payouts (restaurant_id, paid_at DESC);

-- ── 3. Append-only ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_foodos_payout_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'Una dispersión registrada no se modifica ni se borra: el dinero ya salió. Registra el ajuste como una dispersión nueva con su comprobante.'
    USING ERRCODE = '23514';
END $$;

DROP TRIGGER IF EXISTS trg_foodos_payouts_append_only ON public.foodos_payouts;
CREATE TRIGGER trg_foodos_payouts_append_only
  BEFORE UPDATE OR DELETE ON public.foodos_payouts
  FOR EACH ROW EXECUTE FUNCTION public.reject_foodos_payout_mutation();

-- ── 4. Saldo por restaurante ────────────────────────────────
-- Una sola definición de "cuánto se le debe", en la base, para que la
-- pantalla del admin y cualquier reporte futuro no puedan discrepar.
CREATE OR REPLACE FUNCTION public.foodos_payout_balances()
RETURNS TABLE (
  restaurant_id        UUID,
  restaurant_name      TEXT,
  restaurant_slug      TEXT,
  platform_fee_percent NUMERIC,
  stripe_account_id    TEXT,
  connect_chargeable   BOOLEAN,
  gross_collected      NUMERIC,
  custody_order_count  BIGINT,
  settled_total        NUMERIC,
  fee_total            NUMERIC,
  outstanding          NUMERIC,
  payout_count         BIGINT,
  last_payout_at       TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH gross AS (
    SELECT o.restaurant_id AS rid, sum(o.total) AS collected, count(*) AS n
    FROM public.foodos_orders o
    WHERE o.payment_status = 'paid'
      AND o.connected_account_id IS NULL
    GROUP BY o.restaurant_id
  ),
  paid AS (
    SELECT p.restaurant_id AS rid,
           sum(p.settled_amount) AS settled,
           sum(p.fee_amount) AS fees,
           count(*) AS n,
           max(p.paid_at) AS last_at
    FROM public.foodos_payouts p
    GROUP BY p.restaurant_id
  )
  SELECT
    r.id,
    r.name,
    r.slug,
    r.platform_fee_percent,
    r.stripe_account_id,
    (r.stripe_charges_enabled AND r.stripe_payouts_enabled),
    COALESCE(g.collected, 0),
    COALESCE(g.n, 0),
    COALESCE(p.settled, 0),
    COALESCE(p.fees, 0),
    COALESCE(g.collected, 0) - COALESCE(p.settled, 0) - COALESCE(p.fees, 0),
    COALESCE(p.n, 0),
    p.last_at
  FROM public.foodos_restaurants r
  LEFT JOIN gross g ON g.rid = r.id
  LEFT JOIN paid  p ON p.rid = r.id
$$;

COMMENT ON FUNCTION public.foodos_payout_balances() IS
  'Saldo de custodia por restaurante: bruto cobrado en custodia menos dispersado y retenido. Definición única de "cuánto se le debe".';

-- ── 5. Registrar una dispersión ─────────────────────────────
CREATE OR REPLACE FUNCTION public.record_foodos_payout(
  p_restaurant_id UUID,
  p_period_start  DATE,
  p_period_end    DATE,
  p_settled_amount NUMERIC,
  p_fee_amount    NUMERIC,
  p_reference     TEXT,
  p_actor         UUID,
  p_notes         TEXT DEFAULT NULL
)
RETURNS public.foodos_payouts
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_restaurant public.foodos_restaurants;
  v_reference  TEXT := btrim(coalesce(p_reference, ''));
  v_notes      TEXT := nullif(btrim(coalesce(p_notes, '')), '');
  v_gross      NUMERIC;
  v_settled    NUMERIC;
  v_fees       NUMERIC;
  v_outstanding NUMERIC;
  v_row        public.foodos_payouts;
BEGIN
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'El fin del periodo no puede ser anterior al inicio'
      USING ERRCODE = '23514';
  END IF;

  IF p_settled_amount IS NULL OR p_settled_amount = 0 THEN
    RAISE EXCEPTION 'El monto de la dispersión no puede ser cero'
      USING ERRCODE = '23514';
  END IF;

  IF p_fee_amount IS NULL OR p_fee_amount < 0 THEN
    RAISE EXCEPTION 'La comisión retenida no puede ser negativa'
      USING ERRCODE = '23514';
  END IF;

  IF length(v_reference) < 4 THEN
    RAISE EXCEPTION 'La dispersión exige un comprobante de al menos 4 caracteres'
      USING ERRCODE = '23514';
  END IF;

  IF p_settled_amount < 0 AND length(coalesce(v_notes, '')) < 5 THEN
    RAISE EXCEPTION 'Una dispersión negativa exige explicar por qué (mínimo 5 caracteres)'
      USING ERRCODE = '23514';
  END IF;

  -- Bloquea el restaurante para serializar dispersiones concurrentes.
  SELECT * INTO v_restaurant
  FROM public.foodos_restaurants r
  WHERE r.id = p_restaurant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El restaurante % no existe', p_restaurant_id
      USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(sum(o.total), 0) INTO v_gross
  FROM public.foodos_orders o
  WHERE o.restaurant_id = p_restaurant_id
    AND o.payment_status = 'paid'
    AND o.connected_account_id IS NULL;

  SELECT COALESCE(sum(p.settled_amount), 0), COALESCE(sum(p.fee_amount), 0)
  INTO v_settled, v_fees
  FROM public.foodos_payouts p
  WHERE p.restaurant_id = p_restaurant_id;

  v_outstanding := v_gross - v_settled - v_fees;

  IF p_settled_amount > 0 AND (p_settled_amount + p_fee_amount) > v_outstanding THEN
    RAISE EXCEPTION
      'La dispersión (%) excede el saldo pendiente del restaurante (%)',
      round(p_settled_amount + p_fee_amount, 2), round(v_outstanding, 2)
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.foodos_payouts (
    restaurant_id, period_start, period_end, settled_amount,
    fee_amount, reference, notes, created_by
  ) VALUES (
    p_restaurant_id, p_period_start, p_period_end, p_settled_amount,
    p_fee_amount, v_reference, v_notes, p_actor
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

COMMENT ON FUNCTION public.record_foodos_payout(UUID, DATE, DATE, NUMERIC, NUMERIC, TEXT, UUID, TEXT) IS
  'Registra una dispersión append-only y rechaza si excede el saldo pendiente. Único camino de escritura del ledger.';

-- ── 6. Privilegios: sólo service_role ───────────────────────
ALTER TABLE public.foodos_payouts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.foodos_payouts FROM anon, authenticated;
GRANT ALL ON public.foodos_payouts TO service_role;

-- Una función es ejecutable por PUBLIC por defecto: sin este REVOKE,
-- cualquier usuario autenticado podría dispersar fondos.
REVOKE ALL ON FUNCTION public.record_foodos_payout(UUID, DATE, DATE, NUMERIC, NUMERIC, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foodos_payout_balances() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_foodos_payout_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_foodos_payout(UUID, DATE, DATE, NUMERIC, NUMERIC, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.foodos_payout_balances() TO service_role;

-- ── 7. Autocomprobación ─────────────────────────────────────
DO $guard_payouts$
DECLARE
  v_missing TEXT[];
BEGIN
  SELECT array_agg(t) INTO v_missing
  FROM (
    SELECT 'foodos_payouts' AS t
    WHERE to_regclass('public.foodos_payouts') IS NULL
    UNION ALL
    SELECT 'record_foodos_payout'
    WHERE to_regprocedure('public.record_foodos_payout(uuid,date,date,numeric,numeric,text,uuid,text)') IS NULL
    UNION ALL
    SELECT 'foodos_payout_balances'
    WHERE to_regprocedure('public.foodos_payout_balances()') IS NULL
    UNION ALL
    SELECT 'trg_foodos_payouts_append_only'
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_foodos_payouts_append_only'
        AND tgrelid = 'public.foodos_payouts'::regclass
    )
  ) AS faltantes;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan objetos del ledger de dispersiones: %', array_to_string(v_missing, ', ');
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'foodos_payouts'
  ) THEN
    RAISE EXCEPTION 'El ledger de dispersiones no debe tener políticas RLS: sólo service_role';
  END IF;

  -- El ledger no puede quedar escribible por anon/authenticated.
  IF has_table_privilege('anon', 'public.foodos_payouts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.foodos_payouts', 'INSERT') THEN
    RAISE EXCEPTION 'El ledger de dispersiones quedó escribible por anon/authenticated';
  END IF;
END
$guard_payouts$;
