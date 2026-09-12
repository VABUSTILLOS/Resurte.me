-- ============================================================
-- Resurte.me — 00071: Reconciliación del drift de producción
--
-- PROVENIENCIA: la base de producción fue alterada a mano (SQL Editor del
-- dashboard) en varios puntos documentados en `supabase/ESQUEMA.md` y en los
-- scripts ad-hoc que vivían en `supabase/manual/` (ya eliminados; ver
-- `supabase/manual/README.md`). Esos cambios quedaron versionados en:
--
--   · 00028 → products.price / sale_price / is_visible / stock_status
--   · 00031 → orders.customer_phone / orders.discount
--   · 00032 → whatsapp_messages.store_id DEFAULT default_order_store_id()
--   · 00033 → addresses.guest_token (+ índice)
--   · 00052 → profiles.role, crm_prospects, crm_activities, orders.seller_id
--   · 00053 → panel_dishes
--
-- Esta migración NO introduce esquema nuevo: re-afirma, de forma idempotente,
-- los DEFAULTs, NOT NULLs, CHECKs, índices, RLS y policies que pudieron
-- quedar incompletos en producción cuando el cambio manual solo creó la
-- columna/tabla sin su constraint. Reproducir 00001–00071 desde cero deja el
-- esquema tal como está documentado en ESQUEMA.md.
--
-- Idempotente: segura de re-ejecutar (guardas IF NOT EXISTS / DO + catálogo).
-- ============================================================

-- ------------------------------------------------------------
-- 1. products: DEFAULTs de las columnas retro-versionadas (00028)
--    (si prod las creó a mano sin default, aquí se re-afirman)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_visible') THEN
    ALTER TABLE public.products ALTER COLUMN is_visible SET DEFAULT true;
    UPDATE public.products SET is_visible = true WHERE is_visible IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'stock_status') THEN
    ALTER TABLE public.products ALTER COLUMN stock_status SET DEFAULT 'in_stock';
    UPDATE public.products SET stock_status = 'in_stock' WHERE stock_status IS NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. orders.discount: DEFAULT 0 + NOT NULL (00031)
--    Si la columna se creó a mano como nullable/sin default, se alinea.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'discount') THEN
    ALTER TABLE public.orders ALTER COLUMN discount SET DEFAULT 0;
    UPDATE public.orders SET discount = 0 WHERE discount IS NULL;
    ALTER TABLE public.orders ALTER COLUMN discount SET NOT NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. whatsapp_messages.store_id: DEFAULT de tienda activa (00032)
--    Re-aplicación idempotente (ALTER COLUMN SET DEFAULT siempre lo es).
-- ------------------------------------------------------------
ALTER TABLE public.whatsapp_messages
  ALTER COLUMN store_id SET DEFAULT public.default_order_store_id();

-- ------------------------------------------------------------
-- 4. addresses.guest_token: índice (00033), solo si la columna existe
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'guest_token') THEN
    CREATE INDEX IF NOT EXISTS idx_addresses_guest_token
      ON public.addresses (guest_token);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 5. profiles.role: CHECK (cliente|vendedor) (00052)
--    Si prod creó la columna a mano sin el CHECK, se añade.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.profiles'::regclass
               AND conname = 'profiles_role_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check CHECK (role IN ('cliente', 'vendedor'));
  END IF;
END $$;

-- ------------------------------------------------------------
-- 6. panel_dishes: RLS + policy + revoke (00053)
--    Si la tabla se creó a mano sin seguridad, se re-afirma.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'panel_dishes') THEN
    ALTER TABLE public.panel_dishes ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users manage own panel dishes" ON public.panel_dishes;
    CREATE POLICY "Users manage own panel dishes" ON public.panel_dishes
      FOR ALL TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());

    REVOKE ALL ON public.panel_dishes FROM anon;
  END IF;
END $$;

-- ============================================================
-- Nota: `product_stores` es tabla LEGADO (ver ESQUEMA.md). Nada en src/ la
-- lee; el seed ya no la escribe. Se conserva en el esquema por compatibilidad
-- y porque 00028 la usa como fuente de backfill histórico.
-- ============================================================
