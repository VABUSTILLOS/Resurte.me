-- ============================================================
-- Resurte.me — Aplicación manual de migraciones 00031 + 00032
-- Vía: Supabase Dashboard → SQL Editor → New query → Run
-- Idempotente: seguro de re-ejecutar.
-- ============================================================

-- PASO 1 · PRE-CHECK (solo lectura)
-- Esperado: default_order_store_id() = 1 (00026 ya aplicada).
-- Si da 0, aplicar primero 00026_rewards_all_orders.sql.
SELECT 'default_order_store_id()' AS check_item, count(*) AS present
FROM pg_proc WHERE proname = 'default_order_store_id'

UNION ALL

SELECT 'orders.customer_phone', count(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_phone'

UNION ALL

SELECT 'orders.discount', count(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'discount'

UNION ALL

SELECT 'whatsapp_messages.store_id', count(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'whatsapp_messages' AND column_name = 'store_id';

-- ------------------------------------------------------------
-- PASO 2 · MIGRACIÓN 00031 (order_address_fixes)
-- ------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_phone TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- PASO 3 · MIGRACIÓN 00032 (whatsapp store_id default)
-- ------------------------------------------------------------
ALTER TABLE public.whatsapp_messages
  ALTER COLUMN store_id SET DEFAULT public.default_order_store_id();

COMMENT ON COLUMN public.whatsapp_messages.store_id
  IS 'Tienda del mensaje. DEFAULT = única tienda activa (por ahora Resurte).';

-- ------------------------------------------------------------
-- PASO 4 · POST-CHECK (verificación)
-- Esperado:
--   orders.customer_phone        → text,  nullable, (sin default)
--   orders.discount              → numeric, not null, default 0
--   whatsapp_messages.store_id   → default default_order_store_id()
-- ------------------------------------------------------------
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (
       (table_name = 'orders' AND column_name IN ('customer_phone', 'discount'))
    OR (table_name = 'whatsapp_messages' AND column_name = 'store_id')
  )
ORDER BY table_name, column_name;
