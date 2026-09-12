-- Fixes for the store checkout flow.
-- 1) Version `orders.customer_phone`, which the status/workflow routes already
--    select but was only ever added manually in the remote DB.
-- 2) Version `orders.discount`, needed to persist coupon discounts server-side.

-- Idempotente (convención del repo): seguro de re-aplicar aunque las columnas
-- ya existan (en producción se añadieron a mano antes de versionarse).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_phone TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2) NOT NULL DEFAULT 0;
