-- ============================================================
-- Atención al cliente (Ola 6): pausa del bot por conversación
-- y flujos automáticos por condición.
--
-- whatsapp_conversation_controls: el estado de control de la
-- conversación de WhatsApp de la TIENDA con un cliente, una fila
-- por teléfono (la llave es phoneKey: los últimos 10 dígitos,
-- el mismo criterio con el que la bandeja agrupa los mensajes).
-- Hoy guarda una sola cosa: `bot_paused` — cuando el equipo está
-- atendiendo a ese cliente desde la bandeja del panel, el bot
-- deja de responder lo CONVERSACIONAL (palabras clave, asistente
-- con IA y menú de bienvenida) para no pisar al humano. Lo
-- transaccional NO se pausa nunca: pedidos del catálogo, pasos
-- del flujo post-pedido (pago/horario), captura de dirección y
-- ligado de comprobantes siguen su curso, porque pausarlos
-- rompería pedidos en marcha. También la pausa la enciende solo
-- el asistente con IA cuando deriva a un humano (reclamos y
-- pagos disputados): el bot se hace a un lado hasta que el
-- equipo la reanuda desde la bandeja.
--
-- automation_type 'conditional_flows': el valor nuevo del ENUM
-- habilita la fila de configuración de los flujos automáticos
-- por condición (src/lib/whatsapp-automations-engine.ts). Las
-- reglas viven en el JSONB `config` de esa fila (una sola fila,
-- como el resto de automatizaciones); cada envío se deduplica
-- por (regla, pedido) en whatsapp_automation_sends.
--
-- Sin políticas: solo service role (webhook, bandeja y cron).
-- El código degrada si esta migración aún no se aplica
-- (42P01 en la tabla / el valor del ENUM no existe): sin ella
-- no hay pausa posible (la bandeja lo declara y el webhook
-- sigue como siempre) ni flujos por condición, y la tienda
-- atiende exactamente como hoy. Idempotente.
-- ============================================================

-- El valor nuevo del ENUM solo se AÑADE: usarlo en la misma
-- transacción no está permitido, y aquí ningún otro statement
-- lo referencia (lo usa el código de la app al insertar).
ALTER TYPE automation_type ADD VALUE IF NOT EXISTS 'conditional_flows';

CREATE TABLE IF NOT EXISTS whatsapp_conversation_controls (
  phone       TEXT PRIMARY KEY,
  bot_paused  BOOLEAN NOT NULL DEFAULT false,
  updated_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_conversation_controls ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE whatsapp_conversation_controls IS
  'Control por conversación de WhatsApp de la tienda (Ola 6, 00235): bot_paused apaga las respuestas conversacionales del bot (palabras clave, IA, menú) mientras el equipo atiende desde la bandeja; lo transaccional nunca se pausa. Acceso solo con service_role (src/lib/whatsapp-conversation-controls.ts).';
