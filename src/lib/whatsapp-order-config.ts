// ============================================================
// Decisiones de producto: pedidos que llegan por WhatsApp
// ============================================================
// Las decisiones de abajo gobiernan cómo se convierte un
// mensaje de pedido del catálogo de WhatsApp (type "order") en un
// pedido de la tienda. Viven juntas y parametrizadas a propósito:
// son decisiones de Victor (confirmadas el 2026-11-20), y cambiarlas
// debe ser tocar UNA constante aquí, no cazar valores por el código.
//
// Consumidores: src/lib/whatsapp-orders.ts (creación del pedido) y
// src/app/api/whatsapp/webhook/route.ts (respuestas al cliente).

import { MIN_ORDER_MXN } from "@/lib/commercial-facts"

/**
 * Método de pago con el que nace un pedido de WhatsApp.
 *
 * El cliente no elige método en el mensaje de pedido (lo acuerda
 * después, por chat), pero `orders.payment_method` no puede quedar
 * en null: el aviso a staff de workflows.ts lo imprime con
 * `.toUpperCase()` y tronaría. "cash_on_delivery" (contra entrega)
 * es el método confirmado por Victor; el staff puede corregirlo en
 * el panel cuando el cliente acuerde otra forma de pago.
 */
export const WHATSAPP_ORDER_PAYMENT_METHOD = "cash_on_delivery"

/**
 * Mínimo de compra para que un pedido de WhatsApp se cree.
 * Es la misma cifra de la tienda (`MIN_ORDER_MXN` de
 * commercial-facts.ts): una sola fuente para la cifra comercial.
 */
export const WHATSAPP_ORDER_MINIMUM_MXN = MIN_ORDER_MXN

/**
 * Qué hacer con un pedido por debajo del mínimo:
 * - true  → NO se crea el pedido; se responde al cliente cuánto le
 *           falta para el mínimo y el intento queda registrado en
 *           whatsapp_messages (bitácora del webhook).
 * - false → se crea igual, con la tarifa de envío que corresponda,
 *           y el staff lo gestiona.
 *
 * Confirmado por Victor el 2026-11-20: true — es la regla que ya
 * rige en la tienda.
 */
export const WHATSAPP_ORDER_REJECT_BELOW_MINIMUM = true

/**
 * Ventana (horas) en la que un mensaje de texto libre del cliente se
 * interpreta como la dirección del pedido de WhatsApp que la espera.
 *
 * Tras crear el pedido, la confirmación le pide la dirección por el
 * mismo chat. Si dentro de esta ventana llega UN solo pedido de ese
 * teléfono esperando dirección (address_id null, no cancelado ni
 * entregado), el texto se guarda como su dirección en vez de caer al
 * menú genérico. Fuera de la ventana, o con cero/varios pedidos en
 * espera, el texto sigue el routing normal (palabras clave y menú):
 * capturar a ciegas ligaría direcciones a pedidos viejos o al pedido
 * equivocado.
 */
export const WHATSAPP_ADDRESS_CAPTURE_WINDOW_HOURS = 48
