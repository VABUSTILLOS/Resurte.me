-- ============================================================
-- 00046_order_items_item_type.sql
--
-- Distingue items estándar, de bump y de upsell dentro de order_items.
--
-- Retrocompatible: las filas existentes quedan 'standard' (DEFAULT) y todas
-- las consultas actuales (SELECT *) siguen funcionando sin cambios.
-- ============================================================

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'standard';

COMMENT ON COLUMN public.order_items.item_type IS
  'Origen del item: standard (carrito normal), bump (order bump del drawer), upsell (1-click post-pago).';

CREATE INDEX IF NOT EXISTS idx_order_items_type
  ON public.order_items (order_id, item_type);
