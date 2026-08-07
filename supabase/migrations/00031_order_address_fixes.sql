-- Fixes for the store checkout flow.
-- 1) Version `orders.customer_phone`, which the status/workflow routes already
--    select but was only ever added manually in the remote DB.
-- 2) Version `orders.discount`, needed to persist coupon discounts server-side.

ALTER TABLE public.orders
  ADD COLUMN customer_phone TEXT;

ALTER TABLE public.orders
  ADD COLUMN discount DECIMAL(10,2) NOT NULL DEFAULT 0;
