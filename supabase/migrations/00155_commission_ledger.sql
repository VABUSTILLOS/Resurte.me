-- ============================================================
-- 00155: Ledger de comisiones
--
-- El problema: /admin/comisiones NO es un ledger, es una calculadora.
-- `getAdminCommissions()` recompone la cifra en cada carga multiplicando
-- las ventas pagadas de los clientes vinculados por la tasa vigente
-- (SELLER_COMMISSION_RATE). De ahí salen tres fallos concretos:
--
--  1. Cambiar la tasa REESCRIBE EL PASADO. Si la comisión de mayo ya se
--     le comunicó al vendedor al 5% y en junio se baja al 3%, la pantalla
--     de mayo pasa a mostrar 3% de mayo. No hay registro de lo que se
--     debía en ningún momento anterior, así que no hay nada que
--     reconciliar ni forma de detectar la diferencia.
--
--  2. NO SE PUEDE PAGAR. No hay periodo, no hay estado, no hay
--     referencia, no hay ajustes. La pantalla muestra un número que no
--     se puede cerrar: el admin no tiene dónde escribir "esto ya se
--     pagó el 5 de julio por transferencia 4471". Un importe que no se
--     puede saldar no es una comisión, es un adorno.
--
--  3. La atribución es SIEMPRE la actual. Si un prospecto se reasigna a
--     otro vendedor, la comisión de meses cerrados cambia de dueño.
--
-- La solución: el devengo es el acto de congelar. `accrue_commission_period`
-- calcula las ventas del periodo y ESCRIBE la fila con la tasa capturada
-- en ese momento. A partir de ahí la cifra es un hecho, no un cálculo.
--
-- Decisiones explícitas:
--
--  1. La tasa se congela en el primer devengo y NO se reescribe al
--     re-devengar. Re-devengar sigue siendo útil (un pago entró tarde y
--     hay que refrescar las ventas), pero la tasa ya se le comunicó al
--     vendedor; cambiarla en silencio es justo el fallo que esta
--     migración existe para cerrar. Si de verdad hay que corregir el
--     importe, el camino es un ajuste, que queda con motivo y autor.
--
--  2. La atribución se resuelve igual que en el dashboard del vendedor
--     (crm_prospects.seller_id → user_id → orders.user_id). `orders`
--     tenía una columna `seller_id` (00052) que NINGUNA ruta escribió
--     nunca —usarla habría dado cero siempre— y que **00189 ya eliminó**.
--     Se mantiene la regla existente para que el vendedor y el admin no
--     vean cifras distintas.
--
--  3. El devengo SÍ refresca las ventas mientras el periodo siga
--     `devengada`. Un pedido pagado después del cierre pertenece a ese
--     periodo; congelarlo al primer devengo obligaría a devengar una vez
--     y nunca más, que es frágil. El congelamiento definitivo ocurre al
--     pagar: `pay_commission_period` cierra el periodo y los triggers
--     rechazan cualquier cambio posterior de importe.
--
--  4. `amount_due` es una columna generada, no una convención. El
--     importe a pagar (ventas × tasa + ajustes) tiene UNA definición, en
--     la base, y no depende de que la interfaz sume bien.
--
--  5. Pagar exige referencia cuando hay algo que pagar. Un egreso sin
--     rastro es exactamente el tipo de afirmación no verificable que no
--     queremos: si `amount_due > 0`, hay que decir por dónde salió el
--     dinero.
--
--  6. Los ajustes son append-only y con motivo. Un ajuste sin motivo no
--     es un ajuste, es una manipulación; se exige motivo de 5 caracteres
--     y que el periodo siga abierto.
-- ============================================================

-- ── 1. Periodos de comisión ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_periods (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  rate          NUMERIC(6,4)  NOT NULL,
  revenue       NUMERIC(14,2) NOT NULL DEFAULT 0,
  order_count   INTEGER       NOT NULL DEFAULT 0,
  adjustments   NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_due    NUMERIC(14,2) GENERATED ALWAYS AS (round(revenue * rate + adjustments, 2)) STORED,
  status        TEXT NOT NULL DEFAULT 'devengada',
  paid_at       TIMESTAMPTZ,
  paid_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  payment_reference TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commission_periods IS
  'Ledger de comisiones: una fila por vendedor y periodo. La tasa se congela en el primer devengo; el importe se congela al pagar.';
COMMENT ON COLUMN public.commission_periods.rate IS
  'Tasa capturada al devengar. NO se reescribe al re-devengar: es lo que se le comunicó al vendedor.';
COMMENT ON COLUMN public.commission_periods.adjustments IS
  'Suma de commission_adjustments. La mantiene un trigger; no se escribe a mano.';
COMMENT ON COLUMN public.commission_periods.amount_due IS
  'Generada: round(revenue * rate + adjustments, 2). Definición única del importe a pagar.';
COMMENT ON COLUMN public.commission_periods.status IS
  'devengada (abierta, editable) → pagada (cerrada) | cancelada (descartada, con motivo).';

-- ── 2. Coherencia del periodo ───────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commission_periods_status_check'
      AND conrelid = 'public.commission_periods'::regclass
  ) THEN
    ALTER TABLE public.commission_periods
      ADD CONSTRAINT commission_periods_status_check
      CHECK (status IN ('devengada','pagada','cancelada'));

    ALTER TABLE public.commission_periods
      ADD CONSTRAINT commission_periods_range_check
      CHECK (period_end >= period_start);

    ALTER TABLE public.commission_periods
      ADD CONSTRAINT commission_periods_rate_check
      CHECK (rate >= 0 AND rate <= 1);

    -- Un periodo pagado sin fecha de pago es un pago que no se puede
    -- situar; una fecha de pago sin estado pagado es un pago fantasma.
    ALTER TABLE public.commission_periods
      ADD CONSTRAINT commission_periods_paid_check
      CHECK ((status = 'pagada') = (paid_at IS NOT NULL));

    -- Pagar exige rastro cuando hay algo que pagar (decisión 5).
    ALTER TABLE public.commission_periods
      ADD CONSTRAINT commission_periods_reference_check
      CHECK (
        status <> 'pagada'
        OR amount_due <= 0
        OR (payment_reference IS NOT NULL AND length(btrim(payment_reference)) >= 4)
      );

    -- Idempotencia del devengo: no puede haber dos filas del mismo
    -- vendedor para el mismo periodo. Re-devengar actualiza, no duplica.
    ALTER TABLE public.commission_periods
      ADD CONSTRAINT commission_periods_unique_period
      UNIQUE (seller_id, period_start, period_end);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commission_periods_status_end
  ON public.commission_periods(status, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_commission_periods_seller
  ON public.commission_periods(seller_id, period_end DESC);

-- ── 3. Ajustes ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_adjustments (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_id   BIGINT NOT NULL REFERENCES public.commission_periods(id) ON DELETE CASCADE,
  amount      NUMERIC(14,2) NOT NULL,
  reason      TEXT NOT NULL,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.commission_adjustments IS
  'Ajustes append-only sobre un periodo abierto (bonos, correcciones, descuentos). El total vive en commission_periods.adjustments.';
COMMENT ON COLUMN public.commission_adjustments.amount IS
  'Positivo suma a favor del vendedor, negativo descuenta. No puede ser cero: un ajuste de cero no ajusta nada.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'commission_adjustments_amount_check'
      AND conrelid = 'public.commission_adjustments'::regclass
  ) THEN
    ALTER TABLE public.commission_adjustments
      ADD CONSTRAINT commission_adjustments_amount_check CHECK (amount <> 0);

    ALTER TABLE public.commission_adjustments
      ADD CONSTRAINT commission_adjustments_reason_check
      CHECK (length(btrim(reason)) >= 5);
  END IF;
END $$;

-- Índice de FK: el trigger suma por period_id en cada ajuste.
CREATE INDEX IF NOT EXISTS idx_commission_adjustments_period
  ON public.commission_adjustments(period_id);

-- ── 4. El total de ajustes lo mantiene la base ──────────────
-- `FOR UPDATE` sobre el periodo es lo que hace el total correcto: sin
-- él, dos ajustes concurrentes leerían la misma suma y el segundo
-- pisaría al primero (lost update).
CREATE OR REPLACE FUNCTION public.sync_commission_adjustments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_id BIGINT := COALESCE(NEW.period_id, OLD.period_id);
  v_status    TEXT;
  v_total     NUMERIC(14,2);
BEGIN
  SELECT status INTO v_status
  FROM public.commission_periods
  WHERE id = v_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El periodo % no existe', v_period_id USING ERRCODE = '23503';
  END IF;

  IF v_status <> 'devengada' THEN
    RAISE EXCEPTION
      'No se puede ajustar un periodo en estado «%»: solo se ajustan periodos devengados', v_status
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_total
  FROM public.commission_adjustments
  WHERE period_id = v_period_id;

  UPDATE public.commission_periods
  SET adjustments = v_total, updated_at = now()
  WHERE id = v_period_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_commission_adjustments ON public.commission_adjustments;
CREATE TRIGGER trg_sync_commission_adjustments
  AFTER INSERT OR UPDATE OR DELETE ON public.commission_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.sync_commission_adjustments();

-- ── 5. Un periodo pagado es inmutable ───────────────────────
-- Las RPC ya lo comprueban, pero el service_role puede escribir directo.
-- El candado tiene que estar en la base para que "pagada" signifique algo.
CREATE OR REPLACE FUNCTION public.guard_commission_period_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'devengada' THEN
    IF NEW.status <> OLD.status
       OR NEW.rate IS DISTINCT FROM OLD.rate
       OR NEW.revenue IS DISTINCT FROM OLD.revenue
       OR NEW.order_count IS DISTINCT FROM OLD.order_count
       OR NEW.adjustments IS DISTINCT FROM OLD.adjustments
       OR NEW.period_start IS DISTINCT FROM OLD.period_start
       OR NEW.period_end IS DISTINCT FROM OLD.period_end
    THEN
      RAISE EXCEPTION
        'El periodo % está «%»: su importe quedó cerrado y no se puede modificar',
        OLD.id, OLD.status
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- Desde `devengada` solo se puede seguir siendo devengada, pagar o cancelar.
  IF NEW.status NOT IN ('devengada','pagada','cancelada') THEN
    RAISE EXCEPTION 'Transición de estado inválida: % → %', OLD.status, NEW.status
      USING ERRCODE = '23514';
  END IF;

  IF NEW.period_start IS DISTINCT FROM OLD.period_start
     OR NEW.period_end IS DISTINCT FROM OLD.period_end
  THEN
    RAISE EXCEPTION 'El rango del periodo no se puede cambiar: cancela y devenga uno nuevo'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_commission_period_update ON public.commission_periods;
CREATE TRIGGER trg_guard_commission_period_update
  BEFORE UPDATE ON public.commission_periods
  FOR EACH ROW EXECUTE FUNCTION public.guard_commission_period_update();

DROP TRIGGER IF EXISTS trg_touch_commission_periods ON public.commission_periods;
CREATE TRIGGER trg_touch_commission_periods
  BEFORE UPDATE ON public.commission_periods
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 6. RPC: devengar ────────────────────────────────────────
-- Devuelve la fila resultante. Es idempotente: re-devengar un periodo
-- abierto refresca ventas y nº de pedidos, conserva la tasa original.
CREATE OR REPLACE FUNCTION public.accrue_commission_period(
  p_seller_id    UUID,
  p_period_start DATE,
  p_period_end   DATE,
  p_rate         NUMERIC,
  p_timezone     TEXT DEFAULT 'America/Mexico_City'
)
RETURNS public.commission_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.commission_periods;
  v_revenue NUMERIC(14,2);
  v_orders  INTEGER;
  v_from    TIMESTAMPTZ;
  v_to      TIMESTAMPTZ;
  v_exists  BOOLEAN;
BEGIN
  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'El fin del periodo no puede ser anterior al inicio'
      USING ERRCODE = '22007';
  END IF;

  IF p_rate IS NULL OR p_rate < 0 OR p_rate > 1 THEN
    RAISE EXCEPTION 'La tasa debe ser un número entre 0 y 1 (recibido: %)', p_rate
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = p_timezone) THEN
    RAISE EXCEPTION 'Zona horaria desconocida: %', p_timezone USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_seller_id) THEN
    RAISE EXCEPTION 'El vendedor % no existe', p_seller_id USING ERRCODE = '23503';
  END IF;

  -- El día del negocio es el local, no el UTC: un pedido de las 19:30 del
  -- 31 de mayo en CDMX es del 31, no del 1 de junio. El fin es exclusivo.
  v_from := p_period_start::timestamp AT TIME ZONE p_timezone;
  v_to   := (p_period_end + 1)::timestamp AT TIME ZONE p_timezone;

  SELECT * INTO v_row
  FROM public.commission_periods
  WHERE seller_id = p_seller_id
    AND period_start = p_period_start
    AND period_end = p_period_end
  FOR UPDATE;

  -- `FOUND` hay que capturarlo aquí: la suma agregada de más abajo
  -- devuelve siempre una fila, así que dejaría `FOUND` en true y la rama
  -- de INSERT sería inalcanzable.
  v_exists := FOUND;

  IF v_exists AND v_row.status <> 'devengada' THEN
    RAISE EXCEPTION
      'El periodo ya está «%» y no se puede re-devengar', v_row.status
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(sum(o.total), 0), count(*)
  INTO v_revenue, v_orders
  FROM public.orders o
  WHERE o.payment_status = 'paid'
    AND o.status <> 'cancelled'
    AND o.created_at >= v_from
    AND o.created_at < v_to
    AND o.user_id IN (
      SELECT p.user_id
      FROM public.crm_prospects p
      WHERE p.seller_id = p_seller_id
        AND p.user_id IS NOT NULL
    );

  IF v_exists THEN
    UPDATE public.commission_periods
    SET revenue = v_revenue, order_count = v_orders
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.commission_periods
      (seller_id, period_start, period_end, rate, revenue, order_count)
    VALUES
      (p_seller_id, p_period_start, p_period_end, p_rate, v_revenue, v_orders)
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

-- ── 7. RPC: pagar ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pay_commission_period(
  p_period_id BIGINT,
  p_actor     UUID DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_notes     TEXT DEFAULT NULL
)
RETURNS public.commission_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.commission_periods;
BEGIN
  SELECT * INTO v_row
  FROM public.commission_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El periodo % no existe', p_period_id USING ERRCODE = '23503';
  END IF;

  IF v_row.status <> 'devengada' THEN
    RAISE EXCEPTION
      'El periodo ya está «%»: no se puede pagar dos veces', v_row.status
      USING ERRCODE = '23514';
  END IF;

  IF v_row.amount_due > 0
     AND (p_reference IS NULL OR length(btrim(p_reference)) < 4)
  THEN
    RAISE EXCEPTION
      'Falta la referencia del pago: un egreso de % sin rastro no es verificable', v_row.amount_due
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.commission_periods
  SET status = 'pagada',
      paid_at = now(),
      paid_by = p_actor,
      payment_reference = NULLIF(btrim(COALESCE(p_reference, '')), ''),
      notes = COALESCE(NULLIF(btrim(COALESCE(p_notes, '')), ''), notes)
  WHERE id = p_period_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ── 8. RPC: cancelar ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_commission_period(
  p_period_id BIGINT,
  p_reason    TEXT
)
RETURNS public.commission_periods
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.commission_periods;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Cancelar un periodo exige un motivo de al menos 5 caracteres'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_row
  FROM public.commission_periods
  WHERE id = p_period_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El periodo % no existe', p_period_id USING ERRCODE = '23503';
  END IF;

  IF v_row.status <> 'devengada' THEN
    RAISE EXCEPTION 'El periodo ya está «%»', v_row.status USING ERRCODE = '23514';
  END IF;

  UPDATE public.commission_periods
  SET status = 'cancelada', notes = btrim(p_reason)
  WHERE id = p_period_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ── 9. RLS y privilegios ────────────────────────────────────
-- Mismo modelo que suppliers (00066): RLS activo SIN políticas y todo
-- revocado para anon/authenticated. Las comisiones son dinero de
-- terceros: el único canal es /api/admin/* con el service client.
ALTER TABLE public.commission_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_adjustments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.commission_periods FROM anon, authenticated;
REVOKE ALL ON public.commission_adjustments FROM anon, authenticated;
GRANT ALL ON public.commission_periods TO service_role;
GRANT ALL ON public.commission_adjustments TO service_role;

REVOKE ALL ON FUNCTION public.accrue_commission_period(UUID, DATE, DATE, NUMERIC, TEXT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.pay_commission_period(BIGINT, UUID, TEXT, TEXT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_commission_period(BIGINT, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accrue_commission_period(UUID, DATE, DATE, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.pay_commission_period(BIGINT, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_commission_period(BIGINT, TEXT) TO service_role;

-- ── 10. Guardia de la propia migración ──────────────────────
DO $guard_ledger$
DECLARE
  v_missing TEXT[];
BEGIN
  SELECT array_agg(t)
  INTO v_missing
  FROM (
    SELECT 'commission_periods' AS t
    WHERE to_regclass('public.commission_periods') IS NULL
    UNION ALL
    SELECT 'commission_adjustments'
    WHERE to_regclass('public.commission_adjustments') IS NULL
    UNION ALL
    SELECT 'accrue_commission_period'
    WHERE to_regprocedure('public.accrue_commission_period(uuid,date,date,numeric,text)') IS NULL
    UNION ALL
    SELECT 'pay_commission_period'
    WHERE to_regprocedure('public.pay_commission_period(bigint,uuid,text,text)') IS NULL
    UNION ALL
    SELECT 'cancel_commission_period'
    WHERE to_regprocedure('public.cancel_commission_period(bigint,text)') IS NULL
  ) AS faltantes;

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan objetos del ledger de comisiones: %', array_to_string(v_missing, ', ');
  END IF;

  -- La columna generada tiene que existir: es la definición única del
  -- importe a pagar. Si no se creó, la interfaz volvería a sumar a mano.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'commission_periods'
      AND column_name = 'amount_due'
      AND is_generated = 'ALWAYS'
  ) THEN
    RAISE EXCEPTION 'commission_periods.amount_due no es una columna generada';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('commission_periods','commission_adjustments')
  ) THEN
    RAISE EXCEPTION 'El ledger de comisiones no debe tener políticas RLS: solo service_role';
  END IF;
END
$guard_ledger$;
