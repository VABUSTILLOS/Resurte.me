-- ============================================================================
-- 00228 — Flujo de pedido por WhatsApp: paso de la conversación y
--         comprobante de pago ligado al pedido
--
-- QUÉ AÑADE
--   Tres columnas en `orders` que respaldan la Ola 1 de equiparación con
--   Take App (el pedido de WhatsApp se completa DENTRO del chat):
--
--   · `wa_flow_step` — en qué paso de la conversación corta post-pedido
--     está el pedido: 'payment' (esperando que el cliente elija cómo paga)
--     o 'schedule' (esperando que elija el día de entrega). NULL = sin
--     conversación activa (todo pedido web y todo pedido ya completado).
--     Lo escribe y lo lee SOLO el flujo de WhatsApp
--     (src/lib/whatsapp-order-flow.ts vía el webhook).
--
--   · `payment_proof_path` / `payment_proof_at` — ruta del comprobante de
--     pago que el cliente manda como IMAGEN por WhatsApp (bucket privado
--     `entregas`, prefijo `marketplace-pagos/`; ver src/lib/payment-proof.ts)
--     y cuándo llegó. Espejo deliberado de `delivery_proof_*` (00154), pero
--     para el PAGO: son evidencias distintas y no se pisan — la foto de la
--     transferencia no es la foto de la entrega. Guardar el comprobante NO
--     marca el pedido como pagado: la confirmación del pago sigue siendo
--     manual en el panel, como todo SPEI de esta tienda.
--
-- QUIÉN LAS ESCRIBE
--   El servidor, con el cliente de servicio, desde el webhook de WhatsApp.
--   Nunca llegan en un body de cliente. Como las columnas nuevas no entran
--   en las listas de GRANT por columna de 00195, nacen legibles solo para
--   `service_role` (mismo criterio que `delivery_proof_path`).
--
-- POR QUÉ ES ADITIVA Y SIN DEFAULT QUE MIENTA
--   Las tres nacen NULL: un pedido sin conversación y sin comprobante ES
--   NULL en ambas cosas. El código tolera que esta migración aún no esté
--   aplicada (detecta el 42703 y degrada: sin paso de conversación no hay
--   preguntas de pago/horario y el flujo se comporta como antes; sin
--   columnas de comprobante, la foto se registra en la bitácora
--   `whatsapp_messages` y el staff la concilia a mano). Desplegar código
--   antes que esquema no rompe el webhook ni el checkout.
--
-- LO QUE NO HACE
--   No crea bucket nuevo (reutiliza `entregas`, el mismo almacenamiento de
--   la ruta de comprobantes de pedidos), no añade índices (las consultas
--   del flujo filtran por teléfono/perfil sobre la ventana reciente, como
--   la captura de dirección) y no toca `delivery_proof_*`.
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS wa_flow_step TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof_path TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_proof_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.wa_flow_step IS
  'Paso de la conversación post-pedido de WhatsApp: ''payment'' | ''schedule'' | NULL (00228). Solo lo escribe el flujo de WhatsApp.';
COMMENT ON COLUMN public.orders.payment_proof_path IS
  'Ruta del comprobante de pago enviado por el cliente (bucket `entregas`, prefijo `marketplace-pagos/`). Se guarda la ruta, jamás una URL firmada (00228).';
COMMENT ON COLUMN public.orders.payment_proof_at IS
  'Cuándo llegó el comprobante de pago del cliente (00228).';
