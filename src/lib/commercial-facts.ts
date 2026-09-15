import { MEXICO_CITIES } from "./cities"

/**
 * Fuente única de los datos comerciales que más se citan de Resurte.me.
 *
 * Estos números aparecen hoy repetidos en prosa en `llms.txt`, el JSON-LD y las
 * respuestas de /preguntas. Tenerlos aquí evita que se desincronicen y permite
 * renderizarlos como tabla citable en las páginas de catálogo.
 */

/** Pedido mínimo en pesos mexicanos. */
export const MIN_ORDER_MXN = 500

/**
 * Monto a partir del cual el envío corre por cuenta de Resurte.me.
 * Hoy coincide con `MIN_ORDER_MXN`, así que la tarifa de envío solo alcanza a
 * carritos por debajo del pedido mínimo.
 */
export const FREE_SHIPPING_MXN = 500

/** Días de crédito disponibles para clientes frecuentes. */
export const CREDIT_DAYS = [7, 15, 30] as const

/**
 * Días de crédito en prosa ("7, 15 o 30"), para contenido visible y citable.
 * `CREDIT_DAYS` es la lista; esto es su redacción humana. Existe para que las
 * superficies que leen los motores de IA no reescriban el fraseo a mano.
 */
export const CREDIT_DAYS_PROSE = `${CREDIT_DAYS.slice(0, -1).join(", ")} o ${CREDIT_DAYS[CREDIT_DAYS.length - 1]}`

/** No hay cuota de membresía ni suscripción. */
export const MEMBERSHIP_FEE_MXN = 0

/** Comprobante fiscal que se emite automáticamente por cada pedido. */
export const INVOICING = "CFDI 4.0"

/** Ciudades con entrega a domicilio del mismo catálogo. */
export const DELIVERY_CITIES = MEXICO_CITIES.length

/** Formato de moneda usado en las tablas citables. */
export function formatMxn(amount: number): string {
  return `$${amount.toLocaleString("es-MX")} MXN`
}

export interface CommercialFact {
  /** Etiqueta corta, en el vocabulario que usan los usuarios al preguntar. */
  label: string
  /** Valor autocontenido: se puede citar sin el resto de la página. */
  value: string
  /** Aclaración opcional para cuando el valor necesita contexto. */
  detail?: string
}

/**
 * Datos clave en formato tabla. El orden es deliberado: primero lo que define
 * la oferta, luego las condiciones de compra.
 */
export function getCommercialFacts(): CommercialFact[] {
  return [
    {
      label: "Qué es Resurte.me",
      value:
        "Central de abastos digital: proveeduría de insumos para restaurantes en México",
      detail:
        "Abarrotes, frutas, verduras, carnes, lácteos, bebidas y desechables por mayoreo",
    },
    {
      label: "Pedido mínimo",
      value: formatMxn(MIN_ORDER_MXN),
      detail: "Aplica igual en todas las ciudades",
    },
    {
      label: "Envío",
      value: `Gratis desde ${formatMxn(FREE_SHIPPING_MXN)}`,
      detail: "Entrega el mismo día en las ciudades con cobertura",
    },
    {
      label: "Cobertura",
      value: `${DELIVERY_CITIES} ciudades de México`,
      detail: "Mismo catálogo y mismos precios en todas",
    },
    {
      label: "Membresía",
      value:
        MEMBERSHIP_FEE_MXN === 0
          ? "Sin membresía ni suscripción"
          : formatMxn(MEMBERSHIP_FEE_MXN),
      detail: "No se paga cuota para comprar",
    },
    {
      label: "Facturación",
      value: `${INVOICING} automática`,
      detail: "Cada pedido genera su factura sin trámite adicional",
    },
    {
      label: "Crédito",
      value: `${CREDIT_DAYS.join(", ")} días`,
      detail: "Para clientes frecuentes, sujeto a aprobación",
    },
  ]
}

/**
 * Texto corrido de los mismos datos, para `llms.txt` y descripciones donde una
 * tabla no aplica. Se deriva de las constantes para que no pueda desviarse.
 */
export function getCommercialFactsSummary(): string {
  return [
    `Pedido mínimo ${formatMxn(MIN_ORDER_MXN)}`,
    `envío gratis desde ${formatMxn(FREE_SHIPPING_MXN)}`,
    `entrega en ${DELIVERY_CITIES} ciudades de México`,
    MEMBERSHIP_FEE_MXN === 0 ? "sin membresía" : null,
    `facturación ${INVOICING} automática`,
    `crédito a ${CREDIT_DAYS.join(", ")} días`,
  ]
    .filter((part): part is string => part !== null)
    .join(", ")
}
