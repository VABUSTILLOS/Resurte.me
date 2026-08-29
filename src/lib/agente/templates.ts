/**
 * Plantillas deterministas del Plan de Prospección Chihuahua.
 * Se usan como fallback cuando no hay LLM configurado, y como base
 * de estilo en el prompt del agente.
 */

import type { MessageKind } from "./types"

export interface TemplateContext {
  prospectName: string
  restaurantName: string | null
  sellerName: string
}

function greeting(ctx: TemplateContext): string {
  const name = ctx.prospectName?.split(" ")[0] || "buen día"
  return `Hola ${name}, buen día.`
}

export function renderTemplate(kind: MessageKind, ctx: TemplateContext): string {
  const r = ctx.restaurantName ? ` (${ctx.restaurantName})` : ""
  switch (kind) {
    case "primer_contacto":
      return `${greeting(ctx)} Soy ${ctx.sellerName} de Resurte.me. Vi que ${ctx.restaurantName ?? "su restaurante"} está activo y se ve que manejan un concepto muy interesante.

Le escribo porque estamos lanzando en Chihuahua una plataforma de abasto que ya usan más de 2,000 restaurantes en CDMX, Monterrey y Guadalajara.

Lo que nos diferencia no es solo que pide por WhatsApp y llega el mismo día — es que CADA PESO que gasta le regresa como descuento con el Club del Chef.

ASÍ FUNCIONA:
• Se registra en 3 minutos → 500 puntos de BIENVENIDA
• Cada $1 que gasta = 1 punto acumulado
• 1,000 puntos = $50 de descuento en su siguiente pedido

PROMO DE LANZAMIENTO CHIHUAHUA: si se registra esta semana, su primer pedido tiene DOBLE PUNTOS.

¿Le mando el enlace para registrarse? No necesita tarjeta, solo su RFC.

Saludos,
${ctx.sellerName} · Resurte.me Chihuahua`

    case "seguimiento":
      return `${greeting(ctx)} Soy ${ctx.sellerName} de Resurte.me${r}.

El otro día le platiqué de nuestra plataforma de abasto con entrega el mismo día en Chihuahua. Solo quería confirmar si pudo revisar la información.

Le recuerdo la oferta de lanzamiento: envío gratis en su primer pedido + crédito a 7 días desde el día 1 + 500 puntos de bienvenida.

Puede probar con un pedido de solo $500, sin compromiso. ¿Le mando el catálogo de esta semana?`

    case "cierre_urgencia":
      return `${greeting(ctx)}

Le escribo porque la promo de DOBLE PUNTOS en el primer pedido termina este viernes a medianoche.

Para que vea cuánto dejaría de ganar:
• Si se registra HOY: pedido de $4,000 → 8,000 pts → $400 de descuento
• Si espera: pedido de $4,000 → 4,000 pts → $200 de descuento

El registro es gratis, sin compromiso, y puede hacer su primer pedido de solo $500 para probar.

¿Le mando el enlace ahora?`

    case "reorden":
      return `${greeting(ctx)} Soy ${ctx.sellerName}, su asesor de Resurte.me${r}.

Ya es momento de su pedido semanal de insumos. 🛒 Recuerde: pida antes de las 10:00 AM y le llega el mismo día por la tarde, sin salir de su cocina.

¿Le armo su lista con lo de siempre o prefiere pedir directo en resurte.me? Sus puntos del Club del Chef siguen acumulándose con cada compra.`

    case "reactivacion":
      return `${greeting(ctx)} Soy ${ctx.sellerName} de Resurte.me. Noté que hace tiempo se registró pero no ha hecho pedidos últimamente.

Lanzamos esta semana "REGRESO EL CHEF" — bono de reactivación:
• 1,000 puntos EXTRA solo por volver
• Envío gratis sin importe mínimo
• 10% de descuento adicional en su primer producto de carne

¿Qué le detuvo la última vez? Si fue precio, catálogo o algo del servicio, me encantaría saberlo para ayudarle.

¿Le mando el catálogo actualizado?`

    case "upsell":
      return `${greeting(ctx)} ¡Buenas noticias!

Revisé su cuenta y está muy cerca de subir de nivel en el Club del Chef. Al subir desbloquea:
• Más puntos por cada peso gastado
• Envío gratis con menor importe mínimo
• Acceso a ofertas flash (hasta 30% de descuento)

¿Le armo un pedido sugerido para que suba de nivel hoy mismo?`
  }
}

/** Prompt maestro del agente (usado cuando hay LLM configurado). */
export const AGENT_SYSTEM_PROMPT = `Eres el Agente de Ventas IA de Resurte.me en Chihuahua, México. Redactas mensajes de WhatsApp para un vendedor humano que los revisa y envía.

SOBRE RESURTE.ME:
- Plataforma B2B de abasto para restaurantes: entrega en menos de 24 horas (pedido antes de 10 AM = entrega el mismo día).
- Precios de central de abastos, crédito a 7/15/30 días sin aval, facturación CFDI 4.0 automática.
- Pedido mínimo $500 MXN; envío gratis desde $3,000 MXN.
- Club del Chef: 1 punto por cada peso gastado; 1,000 pts = $50 MXN de descuento. Bono de bienvenida: 500 pts.
- Oferta de lanzamiento Chihuahua: envío gratis en primer pedido + crédito a 7 días desde el día 1 + doble puntos en el primer pedido.
- Productos estrella locales: carne de res de Chihuahua, queso menonita de Cuauhtémoc, tortillas de harina, chile colorado.

REGLAS DE ESTILO:
- Español mexicano, trato de "usted", tono cálido y directo, norteño pero profesional.
- Máximo 120 palabras salvo primer contacto (puede llegar a 180).
- Siempre un gancho de valor concreto (ahorro, tiempo, puntos) y UNA sola pregunta de cierre.
- Usa saltos de línea y viñetas con "•". Nada de hashtags ni emojis excesivos (máximo 1).
- El dolor principal del restaurantero: salir a comprar a la central bajo el sol, perder horas, sin crédito.
- Nunca inventes precios ni datos del restaurante que no estén en el contexto.
- Devuelve SOLO el texto del mensaje, sin comillas ni explicaciones.`
