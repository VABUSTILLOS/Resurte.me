/**
 * Plantillas deterministas del Plan de Prospección Chihuahua.
 * Se usan como fallback cuando no hay LLM configurado, y como base
 * de estilo en el prompt del agente.
 *
 * Estilo "teaser": los mensajes despiertan interés con los niveles de
 * recompensas (Verde 5% → Diamante 20%) y el gancho de "los únicos que
 * regresan marketing digital por tus compras". La mecánica detallada la
 * explica resurte.me/recompensas — no el mensaje.
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
      return `${greeting(ctx)} Soy ${ctx.sellerName} de Resurte.me. Vi que ${ctx.restaurantName ?? "su restaurante"} está activo y manejan un concepto muy interesante.

Somos la plataforma de abasto que ya usan más de 2,000 restaurantes en México — y los ÚNICOS proveedores que le regresan recompensas de marketing digital por sus compras.

Así de simple: usted ya compra insumos cada semana. Con nosotros, esa misma compra también paga el marketing de su restaurante:

🟢 Verde 5% · 🥈 Plata 10% · 🥇 Oro 15% · 💎 Diamante 20%

Sus recompensas se canjean por reseñas de Google, fotografía profesional, redes sociales y más. Nuestro interés es ayudarle a crecer — para seguir siendo su proveedor.

PROMO DE LANZAMIENTO CHIHUAHUA: envío gratis + crédito a 7 días en su primer pedido.

¿Le mando el enlace para ver su programa? No necesita tarjeta, solo su RFC.

Saludos,
${ctx.sellerName} · Resurte.me y crece`

    case "seguimiento":
      return `${greeting(ctx)} Soy ${ctx.sellerName} de Resurte.me${r}.

El otro día le platiqué de nuestra plataforma de abasto con entrega el mismo día. Solo quería confirmar si pudo revisar la información.

Le recuerdo lo que nos hace únicos: con Resurte.me no tiene que elegir entre surtir su negocio o invertir en mercadotecnia — obtiene ambos. Cada compra genera recompensas canjeables por marketing digital para su restaurante.

Oferta de lanzamiento: envío gratis + crédito a 7 días en su primer pedido, desde solo $500.

¿Le mando el catálogo de esta semana?`

    case "cierre_urgencia":
      return `${greeting(ctx)}

La promo de lanzamiento en Chihuahua — envío gratis + crédito a 7 días en su primer pedido — termina este viernes a medianoche.

Una sola cuenta: con $4,000 de compra semanal empieza en 🟢 Verde y genera $200 en recompensas… desde su primer pedido. Recompensas que se convierten en reseñas de Google, fotos profesionales y clientes nuevos.

Somos los únicos proveedores que le regresan marketing por surtirse. Nuestro interés es simple: que usted crezca, para seguir siendo su proveedor.

¿Le mando el enlace ahora?`

    case "reorden":
      return `${greeting(ctx)} Soy ${ctx.sellerName}, su asesor de Resurte.me${r}.

Ya es momento de su pedido semanal. 🛒 Pida antes de las 10:00 AM y le llega el mismo día, sin salir de su cocina.

Y recuerde: cada pedido hace crecer sus recompensas y lo acerca a su siguiente nivel — hasta 💎 Diamante con 20% en cada compra.

¿Le armo su lista con lo de siempre o prefiere pedir directo en resurte.me?`

    case "reactivacion":
      return `${greeting(ctx)} Soy ${ctx.sellerName} de Resurte.me. Noté que hace tiempo no hace pedidos.

Sus recompensas siguen siendo suyas — y esta semana lanzamos "REGRESO EL CHEF":
• Su compra califica de inmediato para subir de nivel
• Envío gratis sin importe mínimo
• 10% adicional en su primer producto de carne

Recuerde: somos los únicos que le regresan marketing digital por sus compras. ¿Qué le detuvo la última vez? Me encantaría saberlo para ayudarle.

¿Le mando el catálogo actualizado?`

    case "upsell":
      return `${greeting(ctx)} ¡Buenas noticias!

Revisé su cuenta y está a nada de subir de nivel en sus recompensas. El siguiente nivel significa más % en cada pedido — camino a 💎 Diamante con 20% — y más servicios por canjear: Meta Ads, menú digital, tienda en línea.

Entre más compra, más gana. Así de simple. Y si su restaurante crece, mejor para ambos: nuestro interés es seguir siendo su proveedor.

¿Le armo un pedido sugerido para subir de nivel hoy mismo?`
  }
}

/** Prompt maestro del agente (usado cuando hay LLM configurado). */
export const AGENT_SYSTEM_PROMPT = `Eres el Agente de Ventas IA de Resurte.me en Chihuahua, México. Redactas mensajes de WhatsApp para un vendedor humano que los revisa y envía.

SOBRE RESURTE.ME:
- Plataforma B2B de abasto para restaurantes: entrega en menos de 24 horas (pedido antes de 10 AM = entrega el mismo día).
- Precios de central de abastos, crédito a 7/15/30 días sin aval, facturación CFDI 4.0 automática.
- Pedido mínimo $500 MXN; envío gratis desde $3,000 MXN.
- Programa de Recompensas: cada compra genera recompensas según el nivel del cliente: 🟢 Verde 5% (empiezas aquí al registrarte) · 🥈 Plata 10% · 🥇 Oro 15% · 💎 Diamante 20% (se sube comprando con constancia semanal). Entre más compras, más ganas. Así de simple.
- Las recompensas se canjean en la Tienda de Crecimiento por servicios reales: gestión de reseñas Google, optimización de Google Maps, fotografía profesional, gestión de redes sociales, Meta/Google Ads, TikTok, menú digital, tienda en línea, consultoría y desarrollo web.
- Somos los ÚNICOS proveedores que regresan recompensas de marketing digital en las compras. Mensaje central: con Resurte.me no eliges entre surtir tu negocio o invertir en mercadotecnia y crecimiento — obtienes AMBOS.
- Nuestro interés es ayudar al restaurante a crecer para seguir siendo su proveedor: si ellos crecen, nosotros crecemos. Lema de marca: "Resurte.me y crece".
- Oferta de lanzamiento Chihuahua: envío gratis en primer pedido + crédito a 7 días desde el día 1.
- Productos estrella locales: carne de res de Chihuahua, queso menonita de Cuauhtémoc, tortillas de harina, chile colorado.

REGLAS DE ESTILO:
- Español mexicano, trato de "usted", tono cálido y directo, norteño pero profesional.
- Máximo 120 palabras salvo primer contacto (puede llegar a 150). El objetivo es DESPERTAR INTERÉS, no explicar el programa.
- NO expliques la mecánica detallada (semanas calificadas, umbrales, cálculos). Menciona los niveles con su % o UN canje concreto, y deja los detalles para resurte.me/recompensas o la llamada.
- Siempre un gancho de valor concreto (ahorro, tiempo, recompensas de marketing) y UNA sola pregunta de cierre.
- Usa saltos de línea y viñetas con "•". Nada de hashtags ni emojis excesivos (los emojis de nivel 🟢🥈🥇💎 están permitidos; máximo 1 emoji adicional).
- El dolor principal del restaurantero: salir a comprar a la central bajo el sol, perder horas, sin crédito.
- Usa la palabra "recompensas". NUNCA hables de puntos, "cashback" técnico ni de un "Club del Chef".
- Puedes usar el lema "Resurte.me y crece" como cierre cuando caiga natural (máximo una vez).
- Nunca inventes precios ni datos del restaurante que no estén en el contexto.
- Devuelve SOLO el texto del mensaje, sin comillas ni explicaciones.`
