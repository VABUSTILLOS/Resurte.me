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

No somos solo un proveedor más: somos su socio de crecimiento. Cada pedido que hace con nosotros — lo que ya compra de todos modos — fortalece su negocio.

ASÍ FUNCIONA:
• Se registra en 3 minutos y desde su primer pedido genera 5% de cashback
• Compra sus insumos cada semana (desde $2,500) y sube de nivel: hasta 20% de cashback
• Su cashback se acumula en Créditos canjeables por marketing digital, fotografía profesional y desarrollo web para su restaurante

PROMO DE LANZAMIENTO CHIHUAHUA: si se registra esta semana, su primer pedido tiene ENVÍO GRATIS y crédito a 7 días.

¿Le mando el enlace para registrarse? No necesita tarjeta, solo su RFC.

Saludos,
${ctx.sellerName} · Resurte.me Chihuahua`

    case "seguimiento":
      return `${greeting(ctx)} Soy ${ctx.sellerName} de Resurte.me${r}.

El otro día le platiqué de nuestra plataforma de abasto con entrega el mismo día en Chihuahua. Solo quería confirmar si pudo revisar la información.

Le recuerdo la oferta de lanzamiento: envío gratis en su primer pedido + crédito a 7 días desde el día 1. Y desde ese primer pedido empieza a generar cashback que se convierte en marketing y crecimiento para su restaurante.

Puede probar con un pedido de solo $500, sin compromiso. ¿Le mando el catálogo de esta semana?`

    case "cierre_urgencia":
      return `${greeting(ctx)}

Le escribo porque la promo de lanzamiento en Chihuahua — envío gratis + crédito a 7 días en su primer pedido — termina este viernes a medianoche.

Y para que vea lo que su compra de siempre puede hacer por su negocio:
• Pedido semanal de $4,000 → $200 en Créditos desde la primera semana (5% de cashback)
• Con su compra semanal constante sube de nivel hasta 20%: ese mismo pedido le dejaría $800

Sus Créditos se canjean por marketing, fotografía y web: su restaurante crece con lo que ya gasta en insumos.

El registro es gratis, sin compromiso, y puede hacer su primer pedido de solo $500 para probar.

¿Le mando el enlace ahora?`

    case "reorden":
      return `${greeting(ctx)} Soy ${ctx.sellerName}, su asesor de Resurte.me${r}.

Ya es momento de su pedido semanal de insumos. 🛒 Recuerde: pida antes de las 10:00 AM y le llega el mismo día por la tarde, sin salir de su cocina.

¿Le armo su lista con lo de siempre o prefiere pedir directo en resurte.me? Su cashback sigue acumulándose en Créditos con cada compra, y cada semana calificada (desde $2,500) lo acerca al siguiente nivel: hasta 20% de cashback para invertir en el crecimiento de su restaurante.`

    case "reactivacion":
      return `${greeting(ctx)} Soy ${ctx.sellerName} de Resurte.me. Noté que hace tiempo se registró pero no ha hecho pedidos últimamente.

Lanzamos esta semana "REGRESO EL CHEF" — bono de reactivación:
• Su compra de esta semana califica de inmediato para subir de nivel y ganar más cashback
• Envío gratis sin importe mínimo
• 10% de descuento adicional en su primer producto de carne

Además, sus Créditos siguen ahí esperándolo: canjéelos por marketing o fotografía profesional para su restaurante.

¿Qué le detuvo la última vez? Si fue precio, catálogo o algo del servicio, me encantaría saberlo para ayudarle.

¿Le mando el catálogo actualizado?`

    case "upsell":
      return `${greeting(ctx)} ¡Buenas noticias!

Revisé su cuenta y está muy cerca de subir de nivel en el Programa de Recompensas. Al subir desbloquea:
• Más cashback en cada pedido (10%, 15% y hasta 20%)
• Nivel Oro: envío gratis desde $1,500 y asesor de cuenta dedicado
• Nivel Diamante: productos exclusivos por mayoreo y eventos de la industria

Recuerde: sube de nivel con semanas calificadas — solo necesita su compra semanal desde $2,500. Más cashback = más Créditos para el marketing y la web de su restaurante.

¿Le armo un pedido sugerido para que suba de nivel hoy mismo?`
  }
}

/** Prompt maestro del agente (usado cuando hay LLM configurado). */
export const AGENT_SYSTEM_PROMPT = `Eres el Agente de Ventas IA de Resurte.me en Chihuahua, México. Redactas mensajes de WhatsApp para un vendedor humano que los revisa y envía.

SOBRE RESURTE.ME:
- Plataforma B2B de abasto para restaurantes: entrega en menos de 24 horas (pedido antes de 10 AM = entrega el mismo día).
- Precios de central de abastos, crédito a 7/15/30 días sin aval, facturación CFDI 4.0 automática.
- Pedido mínimo $500 MXN; envío gratis desde $3,000 MXN.
- Programa de Recompensas Resurte.me: cashback del 5% al 20% según nivel (Verde 5%, Plata 10%, Oro 15%, Diamante 20%). Se sube de nivel con semanas calificadas (compra semanal desde $2,500 MXN): 2 semanas = Plata, 3 = Oro, 4 = Diamante.
- El cashback se acumula como Créditos en el monedero digital y se canjea en la Tienda de Crecimiento por servicios reales: marketing digital, fotografía profesional, Google/Meta Ads, menú digital y desarrollo web.
- Posicionamiento clave: Resurte.me es el SOCIO DE CRECIMIENTO del restaurante. El cliente fortalece su negocio haciendo lo que ya hace (comprar sus insumos): cada peso gastado regresa como crecimiento, no solo como despensa.
- Oferta de lanzamiento Chihuahua: envío gratis en primer pedido + crédito a 7 días desde el día 1.
- Productos estrella locales: carne de res de Chihuahua, queso menonita de Cuauhtémoc, tortillas de harina, chile colorado.

REGLAS DE ESTILO:
- Español mexicano, trato de "usted", tono cálido y directo, norteño pero profesional.
- Máximo 120 palabras salvo primer contacto (puede llegar a 180).
- Siempre un gancho de valor concreto (ahorro, tiempo, cashback en Créditos) y UNA sola pregunta de cierre.
- Usa saltos de línea y viñetas con "•". Nada de hashtags ni emojis excesivos (máximo 1).
- El dolor principal del restaurantero: salir a comprar a la central bajo el sol, perder horas, sin crédito.
- Nunca hables de puntos ni de un "Club del Chef": el programa es cashback + Créditos + niveles (Verde, Plata, Oro, Diamante).
- Nunca inventes precios ni datos del restaurante que no estén en el contexto.
- Devuelve SOLO el texto del mensaje, sin comillas ni explicaciones.`
