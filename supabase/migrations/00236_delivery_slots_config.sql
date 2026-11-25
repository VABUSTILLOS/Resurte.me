-- ============================================================
-- Ola 7 — Franjas horarias de entrega con hora de corte
-- ============================================================
-- Configuración de las franjas de entrega de la tienda en una
-- sola fila (id = 1): qué franjas se ofrecen cada día de la
-- semana, la hora de corte opcional y la capacidad opcional
-- por franja. La forma del JSON es `DeliverySlotsConfig` de
-- src/lib/delivery-slots.ts:
--
--   {
--     "cutoffTime": "14:00" | null,        -- null = sin corte
--     "capacityPerSlot": 10 | null,        -- null = sin límite
--     "week": [["08-10", ...], ... x7]     -- índice 0 = domingo
--   }
--
-- Sin esta migración (y sin fila) el código usa la
-- configuración histórica: las 6 franjas de siempre todos los
-- días, sin corte y sin capacidad — el comportamiento no
-- cambia hasta que el panel guarda otra cosa.
--
-- Acceso solo con service_role (sin políticas, como el resto
-- de las tablas de configuración de olas anteriores).

CREATE TABLE IF NOT EXISTS delivery_slots_config (
  id          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config      JSONB NOT NULL,
  updated_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE delivery_slots_config ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE delivery_slots_config IS
  'Configuración de franjas de entrega de la tienda (Ola 7, 00236): fila única id=1 con el JSON de DeliverySlotsConfig (franjas por día de semana, hora de corte, capacidad por franja). La leen el checkout web, el flujo de WhatsApp, la validación de POST /api/orders y los pedidos recurrentes; la escribe /admin/entregas. Acceso solo con service_role (src/lib/delivery-slots-server.ts).';
