-- ============================================================
-- Resurte.me — DEFAULT de store_id en whatsapp_automations y whatsapp_templates
--
-- whatsapp_messages ya tiene DEFAULT (migración 00032). Las tablas
-- de automatizaciones y plantillas comparten el mismo requisito
-- NOT NULL, así que los upserts desde el panel admin fallarían en
-- runtime sin store_id. Se aplica el mismo patrón: resolver la
-- tienda activa (única) como DEFAULT.
-- ============================================================

ALTER TABLE public.whatsapp_automations
  ALTER COLUMN store_id SET DEFAULT public.default_order_store_id();

ALTER TABLE public.whatsapp_templates
  ALTER COLUMN store_id SET DEFAULT public.default_order_store_id();

COMMENT ON COLUMN whatsapp_automations.store_id
  IS 'Tienda de la automatización. DEFAULT = única tienda activa (por ahora Resurte).';

COMMENT ON COLUMN whatsapp_templates.store_id
  IS 'Tienda de la plantilla. DEFAULT = única tienda activa (por ahora Resurte).';
