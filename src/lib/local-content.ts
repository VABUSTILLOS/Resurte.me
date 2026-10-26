import { BUSINESS_HOURS_SUMMARY, BUSINESS_LOCATION_LABEL, HOME_CITY } from "./business"
import {
  CREDIT_DAYS_PROSE,
  DELIVERY_COVERAGE_PROSE,
  FREE_SHIPPING_MXN,
  INVOICING,
  MIN_ORDER_MXN,
  formatMxn,
} from "./commercial-facts"

/**
 * Contenido local de la ciudad sede.
 *
 * Las señales de "operamos en Chihuahua" estaban repartidas en prosa suelta
 * (o ausentes). Aquí viven las piezas que necesitan ser citables y
 * consistentes: el listado de zonas de entrega y las preguntas locales que
 * alimentan el `FAQPage` de la landing.
 *
 * Todo se deriva de `business.ts` y `commercial-facts.ts` para que un cambio
 * de dato comercial no deje el contenido local desactualizado.
 */

/**
 * Colonias y distritos de Chihuahua capital que se usan como **ejemplos** de
 * cobertura en la landing, en `/zonas-de-entrega` y en el `areaServed` del
 * JSON-LD.
 *
 * La cobertura real es **toda la ciudad de Chihuahua** (`LOCAL_COVERAGE_SCOPE`),
 * así que esta lista no es una promesa exhaustiva ni una frontera: es la
 * muestra concreta que un buscador puede emparejar con una colonia. Si una
 * zona deja de cubrirse hay que quitarla de aquí, porque se publica como
 * ejemplo de servicio.
 */
export const CHIHUAHUA_DELIVERY_ZONES: readonly string[] = [
  "Centro Histórico",
  "Cuauhtémoc",
  "Obrera",
  "Zaragoza",
  "Santa Rosa",
  "San Felipe",
  "Del Valle",
  "Campestre",
  "Panamericana",
  "Las Granjas",
  "Cerro de la Cruz",
  "Revolución",
  "Nombre de Dios",
  "Vistas del Norte",
  "Riberas de Sacramento",
  "Chihuahua 2000",
  "Complejo Industrial Chihuahua",
  "El Rejón",
] as const

/** Nombre corto de la ciudad para títulos y anclas. */
export const LOCAL_CITY_NAME = HOME_CITY.name

/**
 * Alcance real de la cobertura. Es la frase que debe citarse cuando alguien
 * pregunte "¿hasta dónde entregan?": no hay colonias excluidas dentro del
 * municipio, así que la lista de colonias es una muestra, no una frontera.
 */
export const LOCAL_COVERAGE_SCOPE =
  `Entregamos en toda la ciudad de ${LOCAL_CITY_NAME}: no hay colonias ` +
  `excluidas dentro del municipio.`

/**
 * Párrafo de posicionamiento local. Es el texto que responde "¿dónde operan?"
 * sin que el lector tenga que inferirlo del pie de página.
 */
export const LOCAL_OPERATION_PROSE =
  `Resurte.me opera desde ${BUSINESS_LOCATION_LABEL}. Ahí está el centro de ` +
  `operación, ahí surtimos y ahí entregamos: el catálogo, los precios y las ` +
  `rutas de reparto son de ${DELIVERY_COVERAGE_PROSE}, no de una cobertura ` +
  `nacional genérica. La entrega cubre toda la ciudad de ${LOCAL_CITY_NAME}.`

/** Segundo párrafo: qué significa "central de abastos digital" en la práctica. */
export const LOCAL_MODEL_PROSE =
  `Una central de abastos digital es el mismo surtido de la central física —` +
  `abarrotes, frutas, verduras, carnes, lácteos, bebidas y desechables— pero ` +
  `pedido en línea y entregado en tu negocio. Sin membresía, pedido mínimo ` +
  `${formatMxn(MIN_ORDER_MXN)} y envío gratis desde ${formatMxn(FREE_SHIPPING_MXN)}.`

export interface LocalFaqItem {
  question: string
  answer: string
}

/**
 * Preguntas locales. Se renderizan visibles y como `FAQPage`, así que la
 * respuesta tiene que ser autocontenida: se cita sin el resto de la página.
 */
export function getLocalFaq(): LocalFaqItem[] {
  return [
    {
      question: `¿Dónde opera Resurte.me?`,
      answer:
        `En ${BUSINESS_LOCATION_LABEL}. Es la única ciudad con entrega activa: ` +
        `el catálogo, los precios y las rutas de reparto corresponden a ` +
        `${DELIVERY_COVERAGE_PROSE}. Las demás ciudades del selector están ` +
        `marcadas como "próximamente" y todavía no tienen cobertura.`,
    },
    {
      question: `¿A qué colonias de Chihuahua entregan?`,
      answer:
        `A toda la ciudad de Chihuahua. No hay colonias excluidas dentro del ` +
        `municipio: si tu negocio está en Chihuahua capital, tienes cobertura. ` +
        `Entre las colonias donde ya tenemos ruta están ` +
        `${CHIHUAHUA_DELIVERY_ZONES.slice(0, 6).join(", ")} y el corredor ` +
        `industrial. Si la tuya no aparece en la lista, también llegamos: solo ` +
        `confirma el horario de reparto por WhatsApp.`,
    },
    {
      question: `¿Cuánto cuesta el envío en Chihuahua?`,
      answer:
        `El envío es gratis desde ${formatMxn(FREE_SHIPPING_MXN)} de compra. El ` +
        `pedido mínimo es ${formatMxn(MIN_ORDER_MXN)}, así que en la práctica ` +
        `todo pedido que pasa el mínimo va con envío incluido.`,
    },
    {
      question: `¿Puedo comprar sin membresía?`,
      answer:
        `Sí. No hay cuota de membresía ni suscripción: compras por mayoreo con ` +
        `pedido mínimo de ${formatMxn(MIN_ORDER_MXN)} y pagas solo los insumos.`,
    },
    {
      question: `¿Facturan en Chihuahua?`,
      answer:
        `Sí, emitimos ${INVOICING} a solicitud, sin costo extra. La factura se ` +
        `genera con los datos fiscales que registres al hacer el pedido.`,
    },
    {
      question: `¿Dan crédito a negocios de Chihuahua?`,
      answer:
        `Sí, a ${CREDIT_DAYS_PROSE} días para clientes frecuentes, sujeto a ` +
        `aprobación según tu historial de compras. No se pide aval ni consulta ` +
        `a buró para abrir la línea.`,
    },
    {
      question: `¿Cuál es el horario de atención?`,
      answer:
        `${BUSINESS_HOURS_SUMMARY}. El carrito sigue abierto 24/7: el pedido se ` +
        `prepara y se surte en el siguiente horario hábil.`,
    },
  ]
}

/**
 * `FAQPage` de la landing local. Va separado del `LocalBusiness` para que
 * Google pueda emparejar cada pregunta con su respuesta sin ambigüedad.
 */
export function getLocalFaqSchema(pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${pageUrl}#faq`,
    inLanguage: "es-MX",
    mainEntity: getLocalFaq().map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  }
}
