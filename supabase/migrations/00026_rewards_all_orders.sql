-- ============================================================
-- Resurte.me — Cashback en TODAS las compras + semanas calificadas
--
-- Cambios vs. 00010:
--   1. TODAS las compras (con user_id) generan cashback a la tasa del
--      nivel actual. Se elimina el gate de total >= $2,500 MXN.
--   2. El nivel se calcula por SEMANAS CALIFICADAS del mes:
--      una semana ISO califica si el gasto acumulado de esa semana
--      (órdenes existentes + la orden nueva) es >= $2,500 MXN.
--      Nivel = semanas calificadas en el mes:
--        0-1 → Verde 5% | 2 → Plata 10% | 3 → Oro 15% | 4+ → Diamante 20%
--   3. Órdenes anónimas (user_id NULL): solo registran metadata de
--      semana/mes y NUNCA tocan wallets (evita violación NOT NULL).
--   4. orders.store_id pasa a tener DEFAULT (la tienda única activa),
--      porque el checkout no lo envía y la columna es NOT NULL.
-- ============================================================

-- ============================================================
-- 1. DEFAULT DE store_id EN ÓRDENES
-- ============================================================
-- El checkout web no envía store_id y la columna es NOT NULL.
-- Resolver la tienda activa (única) para que los inserts no fallen.
CREATE OR REPLACE FUNCTION public.default_order_store_id()
RETURNS BIGINT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT id
  FROM public.stores
  WHERE is_active = true
  ORDER BY id
  LIMIT 1
$$;

ALTER TABLE public.orders
  ALTER COLUMN store_id SET DEFAULT public.default_order_store_id();

COMMENT ON COLUMN orders.store_id
  IS 'Tienda del pedido. DEFAULT = única tienda activa (por ahora Resurte).';

-- ============================================================
-- 2. FUNCIÓN TRIGGER: process_cashback_for_order()
-- ============================================================
CREATE OR REPLACE FUNCTION process_cashback_for_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_week      INTEGER;
  v_qualifying_weeks  INTEGER;
  v_cashback_pct      NUMERIC(5,2);
  v_cashback_amt      NUMERIC(10,2);
  v_tier_name         TEXT;
  v_wallet_id         BIGINT;
BEGIN
  -- ── Metadata de semana/mes: siempre se registra ──
  v_current_week := EXTRACT(WEEK FROM NEW.created_at)::INTEGER;
  NEW.week_of_month := v_current_week;
  NEW.month_year    := TO_CHAR(NEW.created_at, 'YYYY-MM');

  -- ── Evitar doble procesamiento ──
  IF NEW.cashback_credits IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- ── Órdenes anónimas o inválidas: sin cashback ni wallet ──
  IF NEW.user_id IS NULL OR NEW.total IS NULL OR NEW.total <= 0 THEN
    RETURN NEW;
  END IF;

  -- ── Semanas calificadas del mes (incluye la orden actual) ──
  -- Una semana califica si la suma acumulada de gasto de esa semana
  -- (órdenes existentes + NEW.total en la semana actual) >= $2,500 MXN.
  WITH weekly_spend AS (
    SELECT
      EXTRACT(WEEK FROM o.created_at)::INTEGER AS week_num,
      SUM(o.total) AS spend
    FROM orders o
    WHERE o.user_id = NEW.user_id
      AND DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NEW.created_at)
      AND o.status <> 'cancelled'
    GROUP BY EXTRACT(WEEK FROM o.created_at)::INTEGER
  ),
  with_current AS (
    SELECT
      week_num,
      CASE WHEN week_num = v_current_week THEN spend + NEW.total ELSE spend END AS spend
    FROM weekly_spend
    UNION ALL
    -- Si la semana actual aún no existe entre las órdenes previas, la agrega
    SELECT v_current_week, NEW.total
    WHERE NOT EXISTS (SELECT 1 FROM weekly_spend WHERE week_num = v_current_week)
  )
  SELECT COUNT(*) INTO v_qualifying_weeks
  FROM with_current
  WHERE spend >= 2500;

  -- ── Asignar nivel según semanas calificadas ──
  CASE v_qualifying_weeks
    WHEN 0 THEN v_tier_name := 'Verde';    v_cashback_pct := 0.05;
    WHEN 1 THEN v_tier_name := 'Verde';    v_cashback_pct := 0.05;
    WHEN 2 THEN v_tier_name := 'Plata';    v_cashback_pct := 0.10;
    WHEN 3 THEN v_tier_name := 'Oro';       v_cashback_pct := 0.15;
    ELSE        v_tier_name := 'Diamante';  v_cashback_pct := 0.20;
  END CASE;

  -- ── Calcular créditos: TODAS las compras generan cashback ──
  v_cashback_amt := ROUND(NEW.total * v_cashback_pct, 2);

  -- ── Grabar metadata de cashback en la orden ──
  NEW.cashback_credits := v_cashback_amt;
  NEW.cashback_tier    := v_tier_name;

  -- ── Asegurar que el monedero existe (crear si no) ──
  INSERT INTO wallets (user_id, balance_credits)
  VALUES (NEW.user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO v_wallet_id FROM wallets WHERE user_id = NEW.user_id;

  -- ── Registrar transacción de abono ──
  INSERT INTO wallet_transactions (wallet_id, amount, concept, order_id)
  VALUES (
    v_wallet_id,
    v_cashback_amt,
    'Cashback Nivel ' || v_tier_name || ' (' || (v_cashback_pct * 100)::INTEGER || '%)',
    NEW.id
  );

  -- ── Actualizar saldo del monedero ──
  UPDATE wallets
  SET balance_credits = balance_credits + v_cashback_amt,
      updated_at = now()
  WHERE id = v_wallet_id;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. TRIGGER: BEFORE INSERT en órdenes
-- ============================================================
DROP TRIGGER IF EXISTS trg_cashback_on_order ON orders;

CREATE TRIGGER trg_cashback_on_order
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION process_cashback_for_order();

COMMENT ON TRIGGER trg_cashback_on_order ON orders
  IS 'Calcula y registra cashback en Créditos Resurte al crear una orden. TODAS las compras generan cashback a la tasa del nivel actual; el nivel se define por semanas calificadas (>= $2,500 MXN acumulados por semana ISO del mes).';

COMMENT ON COLUMN orders.cashback_credits
  IS 'Créditos Resurte generados por esta orden (todas las compras generan cashback).';
