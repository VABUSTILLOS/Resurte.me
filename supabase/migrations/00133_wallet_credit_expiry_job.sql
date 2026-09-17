-- ============================================================
-- 00133_wallet_credit_expiry_job.sql  (ronda de mejoras, fase M7b / R17)
--
-- Pone en marcha la caducidad marcada en 00132:
--   · `wallet_credit_lots()`  — reparte los canjes entre los abonos (FIFO)
--                               y devuelve el restante de cada lote.
--   · `expire_wallet_credits()` — avisa a 30 días y da de baja lo vencido.
--   · pg_cron diario que la ejecuta.
--
-- Camino del dinero (importante): la baja toma `FOR UPDATE` sobre la fila de
-- `wallets`, el mismo punto de serialización que `credit_cashback_on_payment`
-- (00036) y `redeem_service` (00035). Sin él, un canje concurrente podría
-- leer el saldo antes de la baja y dejar el monedero desincronizado.
--
-- Nunca se baja el saldo por debajo de cero: `wallets.balance_credits` tiene
-- `CHECK (>= 0)` y la baja se acota con `LEAST(...)`.
--
-- Privilegios: ambas funciones son de mantenimiento sobre TODOS los
-- monederos (no hay `auth.uid()` en un job de cron), así que la defensa es
-- que nadie más pueda ejecutarlas — REVOKE a PUBLIC/anon/authenticated y
-- GRANT solo a service_role. Igual que `consume_rate_limit` (00039) y
-- `foodos_ai_reserve` (00121).
-- ============================================================

-- ============================================================
-- 1. REPARTO FIFO DE LOS CANJES ENTRE LOS ABONOS
-- ============================================================
-- `wallets.balance_credits` es un saldo agregado: no dice qué abono sigue
-- vivo. Esta función lo reconstruye — el restante de un lote es su importe
-- menos lo que le tocó de la suma de débitos, en orden de antigüedad.
--
-- Se incluyen TAMBIÉN los abonos sin `expires_at` (anomalía: el trigger de
-- 00132 fecha todo abono). No pueden caducar — `NULL <= p_now` nunca es
-- cierto —, pero sí deben absorber su parte del pool de débitos: si no, esos
-- débitos se repartirían entre los abonos fechados y se daría de baja un
-- crédito que en realidad sigue vivo.
--
-- SECURITY INVOKER a propósito: no necesita privilegios propios, y quien la
-- llama (`expire_wallet_credits`, SECURITY DEFINER) ya los tiene.
CREATE OR REPLACE FUNCTION public.wallet_credit_lots(p_wallet_id BIGINT DEFAULT NULL)
RETURNS TABLE (
  lot_id            BIGINT,
  wallet_id         BIGINT,
  user_id           UUID,
  amount            NUMERIC(10,2),
  created_at        TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  expiry_settled_at TIMESTAMPTZ,
  remaining         NUMERIC(10,2)
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH credits AS (
    SELECT
      wt.id,
      wt.wallet_id,
      wt.amount,
      wt.created_at,
      wt.expires_at,
      wt.expiry_settled_at,
      -- Créditos abonados ANTES de este lote: lo que el pool de débitos
      -- tiene que agotar antes de empezar a morder este lote.
      COALESCE(
        SUM(wt.amount) OVER (
          PARTITION BY wt.wallet_id
          ORDER BY wt.created_at, wt.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ),
        0
      ) AS credit_before
    FROM public.wallet_transactions wt
    WHERE wt.amount > 0
      AND (p_wallet_id IS NULL OR wt.wallet_id = p_wallet_id)
  ),
  debits AS (
    SELECT wt.wallet_id, SUM(-wt.amount) AS debit_total
    FROM public.wallet_transactions wt
    WHERE wt.amount < 0
      AND (p_wallet_id IS NULL OR wt.wallet_id = p_wallet_id)
    GROUP BY wt.wallet_id
  )
  SELECT
    c.id,
    c.wallet_id,
    w.user_id,
    c.amount,
    c.created_at,
    c.expires_at,
    c.expiry_settled_at,
    -- Restante = importe - min(max(débitos - abonado_antes, 0), importe)
    GREATEST(
      c.amount - GREATEST(COALESCE(d.debit_total, 0) - c.credit_before, 0),
      0
    )
  FROM credits c
  JOIN public.wallets w ON w.id = c.wallet_id
  LEFT JOIN debits d ON d.wallet_id = c.wallet_id
  ORDER BY c.created_at, c.id
$$;

COMMENT ON FUNCTION public.wallet_credit_lots(BIGINT) IS
  'Lotes de crédito (abonos) con su restante tras repartir los débitos en FIFO. p_wallet_id NULL = todos los monederos. Autoridad del cálculo de caducidad.';

-- ============================================================
-- 2. AVISO PREVIO Y BAJA DE LO VENCIDO
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_wallet_credits(p_now TIMESTAMPTZ DEFAULT now())
RETURNS TABLE (
  settled_lots    INTEGER,
  expired_credits NUMERIC(10,2),
  warnings_sent   INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_wallet        RECORD;
  v_balance       NUMERIC(10,2);
  v_total_expired NUMERIC(10,2);
  v_to_remove     NUMERIC(10,2);
  v_lots          INTEGER;
  v_settled       INTEGER := 0;
  v_expired       NUMERIC(10,2) := 0;
  v_warnings      INTEGER := 0;
BEGIN
  -- ── 2.1 Aviso a 30 días ──
  -- Un aviso por (usuario, día de vencimiento): si varios lotes caducan el
  -- mismo día, se anuncian juntos con el importe sumado.
  WITH warnable AS (
    SELECT
      l.user_id,
      (l.expires_at AT TIME ZONE 'America/Mexico_City')::DATE AS expiry_day,
      SUM(l.remaining) AS amount
    FROM public.wallet_credit_lots(NULL) l
    WHERE l.remaining > 0
      AND l.expiry_settled_at IS NULL
      AND l.expires_at > p_now
      AND l.expires_at <= p_now + INTERVAL '30 days'
    GROUP BY l.user_id, (l.expires_at AT TIME ZONE 'America/Mexico_City')::DATE
  )
  INSERT INTO public.notifications (user_id, type, title, body, action_url, dedupe_key)
  SELECT
    w.user_id,
    'wallet_expiry',
    'Tus créditos Resurte están por caducar',
    'Tienes $' || to_char(w.amount, 'FM999999990.00')
      || ' MXN en créditos que caducan el '
      || to_char(w.expiry_day, 'DD/MM/YYYY')
      || '. Canjéalos antes de esa fecha.',
    '/recompensas',
    'wallet-expiry:' || to_char(w.expiry_day, 'YYYY-MM-DD')
  FROM warnable w
  -- Idempotencia: el índice único parcial (user_id, type, dedupe_key).
  ON CONFLICT (user_id, type, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS v_warnings = ROW_COUNT;

  -- ── 2.2 Baja de lo vencido ──
  FOR v_wallet IN
    SELECT DISTINCT l.wallet_id
    FROM public.wallet_credit_lots(NULL) l
    WHERE l.expiry_settled_at IS NULL
      AND l.expires_at <= p_now
    ORDER BY 1
  LOOP
    -- Mismo lock que el cashback y el canje: sin él, un abono o un canje
    -- concurrente podría leer el saldo antes de esta baja.
    SELECT w.balance_credits INTO v_balance
    FROM public.wallets w
    WHERE w.id = v_wallet.wallet_id
    FOR UPDATE;

    SELECT COALESCE(SUM(l.remaining), 0), COUNT(*)
      INTO v_total_expired, v_lots
    FROM public.wallet_credit_lots(v_wallet.wallet_id) l
    WHERE l.expiry_settled_at IS NULL
      AND l.expires_at <= p_now;

    -- Si el saldo quedó por debajo de lo vencido (dato corregido a mano,
    -- abono sin trigger), se baja lo que hay y no se viola el CHECK.
    v_to_remove := LEAST(v_total_expired, COALESCE(v_balance, 0));

    IF v_to_remove > 0 THEN
      -- Débito sin `expires_at`: el trigger de 00132 solo fecha los abonos.
      INSERT INTO public.wallet_transactions (wallet_id, amount, concept, order_id)
      VALUES (v_wallet.wallet_id, -v_to_remove, 'Caducidad de créditos', NULL);

      UPDATE public.wallets
      SET balance_credits = balance_credits - v_to_remove,
          updated_at = now()
      WHERE id = v_wallet.wallet_id;
    END IF;

    -- Marca TODOS los lotes vencidos del monedero, incluso los que ya no
    -- tenían restante: sin esto, un lote agotado se revisaría cada día.
    UPDATE public.wallet_transactions wt
    SET expiry_settled_at = p_now
    WHERE wt.wallet_id = v_wallet.wallet_id
      AND wt.amount > 0
      AND wt.expires_at IS NOT NULL
      AND wt.expires_at <= p_now
      AND wt.expiry_settled_at IS NULL;

    v_settled := v_settled + v_lots;
    v_expired := v_expired + v_to_remove;
  END LOOP;

  settled_lots := v_settled;
  expired_credits := v_expired;
  warnings_sent := v_warnings;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.expire_wallet_credits(TIMESTAMPTZ) IS
  'Job de caducidad de Créditos Resurte: avisa 30 días antes y da de baja lo vencido (FIFO, FOR UPDATE sobre wallets, idempotente vía expiry_settled_at). p_now permite rejugar un corte.';

-- Tipo de aviso nuevo en `notifications` (el COMMENT de 00073 quedó corto).
-- NotificationBell lo mapea a un icono propio; sin ese mapeo cae al genérico.
COMMENT ON COLUMN public.notifications.type IS
  'order_confirmation, order_status_*, cashback, cashback_credited, redemption, invoice_*, milestone, wallet_expiry (caducidad de créditos).';

-- ============================================================
-- 3. PRIVILEGIOS
-- ============================================================
-- Objeto nuevo de `public` (expuesto por PostgREST): sin el REVOKE, anon y
-- authenticated podrían invocarlas por RPC.
REVOKE ALL ON FUNCTION public.wallet_credit_lots(BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_wallet_credits(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_credit_lots(BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_wallet_credits(TIMESTAMPTZ) TO service_role;

-- ============================================================
-- 4. PROGRAMACIÓN DIARIA
-- ============================================================
-- 05:37 UTC (23:37 del día anterior en México): después de la purga de
-- rate_limits (04:17) y del cleanup de direcciones (04:00), y fuera del
-- cierre de día del restaurante.
--
-- El job corre como superusuario de pg_cron, así que no depende de HTTP ni
-- de CRON_SECRET — pero eso significa que el REVOKE de arriba es lo único
-- que impide que un cliente lo invoque.
SELECT cron.unschedule('expire-wallet-credits')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'expire-wallet-credits'
);

SELECT cron.schedule(
  'expire-wallet-credits',
  '37 5 * * *',
  $$SELECT public.expire_wallet_credits(now())$$
);
