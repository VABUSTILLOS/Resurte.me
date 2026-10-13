// ============================================================
// Reglas puras del catálogo de WhatsApp de FoodOS, aptas para el CLIENTE.
//
// POR QUÉ ESTE ARCHIVO EXISTE (y no vive todo en `foodos-whatsapp.ts`)
// --------------------------------------------------------------------
// `foodos-whatsapp.ts` importa `node:crypto` (cifrado de tokens AES-GCM). La
// página `/panel/foodos/whatsapp` es un componente cliente y sólo necesitaba
// `orderedWhatsAppItems`, pero al importarlo desde ese módulo arrastraba el
// `crypto` entero: Next lo polyfillea para el navegador (~400 KB de
// `crypto-browserify`) y además envía al cliente la ruta de descifrado.
//
// La regla, entonces: **aquí sólo entran funciones puras sin un solo import
// de runtime**. Si algo necesita credenciales, red o criptografía, va en
// `foodos-whatsapp.ts` (servidor), no aquí.
// ============================================================

import type { FoodosMenuItem } from "@/types/foodos"

/**
 * Platillos visibles en WhatsApp, en el orden exacto de la curaduría
 * (whatsapp_position; los sin posición van al final por sort_order).
 */
export function orderedWhatsAppItems(items: FoodosMenuItem[]): FoodosMenuItem[] {
  return items
    .filter((i) => i.whatsapp_visible && i.is_available)
    .sort((a, b) => {
      const pa = a.whatsapp_position ?? Number.MAX_SAFE_INTEGER
      const pb = b.whatsapp_position ?? Number.MAX_SAFE_INTEGER
      if (pa !== pb) return pa - pb
      return a.sort_order - b.sort_order
    })
}
