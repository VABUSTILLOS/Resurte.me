-- ============================================================
-- Resurte.me — Sistema de Cashback en Créditos Resurte
-- Monedero digital + trigger automático de cashback por compra
-- ============================================================

-- ============================================================
-- 1. COLUMNAS DE CASHBACK EN ÓRDENES
-- ============================================================
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cashback_credits DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS cashback_tier     TEXT,
  ADD COLUMN IF NOT EXISTS week_of_month     INTEGER,
  ADD COLUMN IF NOT EXISTS month_year        TEXT;  -- formato 'YYYY-MM'

COMMENT ON COLUMN orders.cashback_credits IS 'Créditos Resurte generados por esta orden (solo si total >= $2,500 MXN)';
COMMENT ON COLUMN orders.cashback_tier     IS 'Nivel de cashback aplicado: Verde, Plata, Oro, Diamante';
COMMENT ON COLUMN orders.week_of_month     IS 'Semana ISO del mes en que se realizó la compra';
COMMENT ON COLUMN orders.month_year        IS 'Mes/año de la compra en formato YYYY-MM';

-- ============================================================
-- 2. MONEDERO (WALLET) — 1 registro por usuario
-- ============================================================
CREATE TABLE IF NOT EXISTS wallets (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  balance_credits DECIMAL(10,2) NOT NULL DEFAULT 0.00 CHECK (balance_credits >= 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE wallets IS 'Monedero digital de Créditos Resurte. 1 registro por usuario.';
COMMENT ON COLUMN wallets.balance_credits IS 'Saldo actual en Créditos Resurte. Solo puede ser >= 0.';

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

-- ============================================================
-- 3. TRANSACCIONES DEL MONEDERO
-- ============================================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id         BIGSERIAL PRIMARY KEY,
  wallet_id  BIGINT NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  amount     DECIMAL(10,2) NOT NULL,
  concept    TEXT NOT NULL,
  order_id   BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE wallet_transactions IS 'Historial de movimientos del monedero. amount > 0 = abono (cashback), amount < 0 = canje (pago de servicios).';
COMMENT ON COLUMN wallet_transactions.amount   IS 'Positivo = abono de créditos. Negativo = canje/uso de créditos.';
COMMENT ON COLUMN wallet_transactions.concept  IS 'Concepto legible: "Cashback Nivel Oro", "Canje Servicio SEO", etc.';
COMMENT ON COLUMN wallet_transactions.order_id IS 'Orden que originó el cashback (nullable para canjes manuales).';

CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet  ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_order   ON wallet_transactions(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON wallet_transactions(created_at DESC);

-- ============================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- ── wallets ──
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can view own wallet' AND tablename = 'wallets'
  ) THEN
    CREATE POLICY "Users can view own wallet"
      ON wallets FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Solo el service_role (o backend via SECURITY DEFINER) puede INSERT/UPDATE
-- No se crean políticas de INSERT/UPDATE/DELETE para authenticated users

-- ── wallet_transactions ──
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Users can view own wallet transactions' AND tablename = 'wallet_transactions'
  ) THEN
    CREATE POLICY "Users can view own wallet transactions"
      ON wallet_transactions FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM wallets
          WHERE wallets.id = wallet_transactions.wallet_id
            AND wallets.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Solo el service_role puede INSERT (el trigger usa SECURITY DEFINER, no requiere política)

-- ============================================================
-- 5. FUNCIÓN TRIGGER: process_cashback_for_order()
-- ============================================================
CREATE OR REPLACE FUNCTION process_cashback_for_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_week   INTEGER;
  v_week_count     INTEGER;
  v_cashback_pct   NUMERIC(5,2);
  v_cashback_amt   NUMERIC(10,2);
  v_tier_name      TEXT;
  v_wallet_id      BIGINT;
  v_week_already   BOOLEAN;
BEGIN
  -- ── Validación: solo órdenes con total >= $2,500 MXN generan cashback ──
  IF NEW.total IS NULL OR NEW.total < 2500 THEN
    NEW.week_of_month := EXTRACT(WEEK FROM NEW.created_at)::INTEGER;
    NEW.month_year    := TO_CHAR(NEW.created_at, 'YYYY-MM');
    RETURN NEW;
  END IF;

  -- ── Evitar doble procesamiento ──
  IF NEW.cashback_credits IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- ── Contar semanas ISO distintas del mes en curso ──
  -- BEFORE INSERT: la orden aún no está en la tabla, contamos las existentes
  v_current_week := EXTRACT(WEEK FROM NEW.created_at)::INTEGER;

  SELECT COUNT(DISTINCT EXTRACT(WEEK FROM o.created_at))
  INTO v_week_count
  FROM orders o
  WHERE o.user_id = NEW.user_id
    AND DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NEW.created_at);

  -- Verificar si la semana de esta orden ya fue contada en las existentes
  SELECT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.user_id = NEW.user_id
      AND EXTRACT(WEEK FROM o.created_at) = v_current_week
      AND DATE_TRUNC('month', o.created_at) = DATE_TRUNC('month', NEW.created_at)
  ) INTO v_week_already;

  IF NOT v_week_already THEN
    v_week_count := v_week_count + 1;
  END IF;

  -- ── Asignar nivel (tier) según semanas acumuladas (incluyendo la actual) ──
  CASE v_week_count
    WHEN 1 THEN v_tier_name := 'Verde';    v_cashback_pct := 0.05;
    WHEN 2 THEN v_tier_name := 'Plata';    v_cashback_pct := 0.10;
    WHEN 3 THEN v_tier_name := 'Oro';       v_cashback_pct := 0.15;
    ELSE        v_tier_name := 'Diamante';  v_cashback_pct := 0.20;  -- 4+ semanas
  END CASE;

  -- ── Calcular créditos ──
  v_cashback_amt := ROUND(NEW.total * v_cashback_pct, 2);

  -- ── Grabar metadata de cashback en la orden ──
  NEW.cashback_credits := v_cashback_amt;
  NEW.cashback_tier     := v_tier_name;
  NEW.week_of_month     := v_current_week;
  NEW.month_year        := TO_CHAR(NEW.created_at, 'YYYY-MM');

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
-- 6. TRIGGER: BEFORE INSERT en órdenes
-- ============================================================
DROP TRIGGER IF EXISTS trg_cashback_on_order ON orders;

CREATE TRIGGER trg_cashback_on_order
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION process_cashback_for_order();

COMMENT ON TRIGGER trg_cashback_on_order ON orders
  IS 'Calcula y registra automáticamente el cashback en Créditos Resurte al crear una orden. Solo aplica si total >= $2,500 MXN.';
