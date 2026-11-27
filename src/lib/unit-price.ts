// ============================================================
// PRECIO POR UNIDAD — comparador entre presentaciones
// ============================================================
// `products.unit` es texto libre escrito por el admin, así que el
// comparador tiene que ser defensivo: si la presentación no se puede
// interpretar, el producto simplemente queda fuera de la comparación.
// Nunca se inventa un precio por kilo a partir de una unidad ambigua
// ("por manojo", "charola", "por cabeza"): un comparativo falso sería
// peor que no mostrar nada.
//
// Los valores reales del catálogo son: "por kilo", "1 kg", "5 kg",
// "500 g", "200 g", "400 g", "100 g", "355 ml", "500 ml", "por pieza".

import { round2 } from "@/lib/money"

/** Base física sobre la que se normaliza el precio unitario. */
export type UnitBase = "kg" | "l" | "pieza"

export interface Presentation {
  /** Cantidad normalizada en la base (`500 g` → `0.5`). */
  quantity: number
  base: UnitBase
}

/**
 * Interpreta el texto libre de `products.unit`.
 *
 * Acepta cantidad + unidad (`1 kg`, `500 g`, `355 ml`) y las formas
 * cualitativas del catálogo (`por kilo`, `por pieza`). Devuelve `null`
 * cuando no hay una base comparable: `por manojo`, `charola`, `por
 * cabeza`, texto vacío o cualquier valor desconocido.
 */
export function parsePresentation(unit: string | null | undefined): Presentation | null {
  if (!unit) return null

  const text = unit.trim().toLowerCase().replace(/\s+/g, " ")
  if (!text) return null

  // Formas cualitativas: "por kilo", "por litro", "por pieza".
  const qualitative = /^por (kilo|kilogramo|litro|pieza|pza)s?$/.exec(text)
  if (qualitative) {
    switch (qualitative[1]) {
      case "kilo":
      case "kilogramo":
        return { quantity: 1, base: "kg" }
      case "litro":
        return { quantity: 1, base: "l" }
      case "pieza":
      case "pza":
        return { quantity: 1, base: "pieza" }
    }
  }

  // Formas con cantidad: "1 kg", "500 g", "1.5 l", "355 ml", "12 piezas".
  const quantified = /^(\d+(?:[.,]\d+)?)\s*(kg|kilos?|g|gr|gramos?|l|lt|litros?|ml|piezas?|pzas?)$/.exec(text)
  if (!quantified) return null

  const amount = Number(quantified[1]?.replace(",", "."))
  if (!Number.isFinite(amount) || amount <= 0) return null

  const token = quantified[2] ?? ""
  const factor = UNIT_FACTORS[token]
  if (!factor) return null

  return { quantity: amount * factor.quantity, base: factor.base }
}

/**
 * Multiplicadores hacia la base. `kg` y `l` son la base; los
 * submúltiplos se expresan como fracción para que `500 g` sea `0.5 kg`.
 */
const UNIT_FACTORS: Record<string, { quantity: number; base: UnitBase }> = {
  kg: { quantity: 1, base: "kg" },
  kilo: { quantity: 1, base: "kg" },
  kilos: { quantity: 1, base: "kg" },
  g: { quantity: 0.001, base: "kg" },
  gr: { quantity: 0.001, base: "kg" },
  gramo: { quantity: 0.001, base: "kg" },
  gramos: { quantity: 0.001, base: "kg" },
  l: { quantity: 1, base: "l" },
  lt: { quantity: 1, base: "l" },
  litro: { quantity: 1, base: "l" },
  litros: { quantity: 1, base: "l" },
  ml: { quantity: 0.001, base: "l" },
  pieza: { quantity: 1, base: "pieza" },
  piezas: { quantity: 1, base: "pieza" },
  pza: { quantity: 1, base: "pieza" },
  pzas: { quantity: 1, base: "pieza" },
}

/** Etiqueta legible de cada base, para el sufijo "$28.50 / kg". */
const BASE_LABELS: Record<UnitBase, string> = {
  kg: "kg",
  l: "l",
  pieza: "pieza",
}

export interface UnitPrice {
  /** Precio normalizado a la base, redondeado a centavos. */
  amount: number
  base: UnitBase
  /** Presentación interpretada de la que salió el cálculo. */
  presentation: Presentation
}

/**
 * Precio por unidad de un producto. `null` si la presentación no es
 * comparable o el precio no es un número positivo.
 */
export function unitPrice(price: number | null | undefined, unit: string | null | undefined): UnitPrice | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null

  const presentation = parsePresentation(unit)
  if (!presentation) return null

  return {
    amount: round2(price / presentation.quantity),
    base: presentation.base,
    presentation,
  }
}

/**
 * Formatea un precio por unidad: `"$28.50 / kg"`.
 *
 * Se usa `toFixed(2)` en lugar de `Intl.NumberFormat` con estilo moneda
 * porque el resultado va incrustado en badges y tablas donde el símbolo
 * y los decimales deben ser estables y no depender del locale del runtime.
 */
export function formatUnitPrice(price: UnitPrice): string {
  return `$${price.amount.toFixed(2)} / ${BASE_LABELS[price.base]}`
}

/**
 * Nombre sin el token de presentación, para reconocer que dos productos
 * son la misma cosa en distinto tamaño ("Jitomate Saladette 1 kg" y
 * "Jitomate Saladette 5 kg" → "jitomate saladette").
 */
export function normalizeBaseName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(PRESENTATION_TOKEN, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/**
 * Tokens de tamaño que se quitan del nombre antes de comparar. Incluye
 * los que `parsePresentation` no interpreta (charola, manojo, caja):
 * aunque no se puedan comparar por precio unitario, sí deben
 * desaparecer del nombre para que dos presentaciones se reconozcan
 * como el mismo producto. El conector "por" se quita también porque
 * sobrevive al token ("Aguacate por kilo" → "aguacate por").
 */
const PRESENTATION_TOKEN =
  /\bpor\b|\b\d+(?:[.,]\d+)?\s*(?:kg|kilos?|g|gr|gramos?|l|lt|litros?|ml|piezas?|pzas?|charolas?|manojos?|cajas?|bolsas?|paquetes?|docenas?)\b|\b(?:kilo|litro|pieza|charola|manojo|caja|bolsa|paquete|docena)s?\b/g

// ============================================================
// PRECIO DE CAJA COMPLETA — por kilo, pero se surte por caja
// ============================================================
// Hay productos cuyo precio es POR KILO pero que el cliente pide
// por caja: "Pollo entero congelado Pilgrim's (caja 14.5 kg)".
// Sin el total de la caja, quien atiende (la ficha, el asistente
// de WhatsApp) presenta el precio del kilo como si fuera el de
// la caja — y el cliente cree que la caja cuesta $74.
// El peso de la caja vive en el nombre del producto: es el único
// dato que existe. El total se CALCULA siempre, nunca se guarda:
// si el precio por kilo cambia, la caja se mueve sola.

export interface BoxPrice {
  /** Peso de la caja en kg, tal como lo declara el nombre. */
  kg: number
  /** Total de la caja completa: precio por kilo × kg, a centavos. */
  total: number
}

const BOX_WEIGHT_RE = /caja\s+(?:de\s+)?(\d+(?:[.,]\d+)?)\s*kg\b/i

/** Peso de la caja declarado en el nombre ("(caja 14.5 kg)"), o null. */
export function parseBoxWeightKg(name: string | null | undefined): number | null {
  if (!name) return null
  const match = BOX_WEIGHT_RE.exec(name)
  if (!match) return null
  const kg = Number(match[1]?.replace(",", "."))
  return Number.isFinite(kg) && kg > 0 ? kg : null
}

/**
 * ¿El precio del producto es por kilo? `products.unit` es texto
 * libre: el catálogo trae "por kilo" (lo interpreta
 * `parsePresentation`) y también "Kilo" a secas, que el parser de
 * presentaciones no acepta pero que la ficha pinta como
 * "Precio por kilo". Ambas formas cuentan.
 */
export function isPerKiloUnit(unit: string | null | undefined): boolean {
  if (!unit) return false
  const presentation = parsePresentation(unit)
  if (presentation) return presentation.base === "kg" && presentation.quantity === 1
  return /^(por\s+)?(kilo|kilogramo|kg)s?$/i.test(unit.trim())
}

/**
 * Precio de la caja completa de un producto que se vende por kilo
 * y cuyo nombre declara el peso de la caja. `null` en cualquier
 * otro caso: el nombre no trae caja en kg (las cajas de piezas no
 * se calculan: su precio ya es por caja) o el precio no es por
 * kilo (si la unidad ya es la caja, el precio ES el de la caja).
 */
export function boxPriceFor(product: {
  name: string
  unit?: string | null
  price: number
}): BoxPrice | null {
  if (!Number.isFinite(product.price) || product.price <= 0) return null
  if (!isPerKiloUnit(product.unit)) return null
  const kg = parseBoxWeightKg(product.name)
  if (kg == null) return null
  return { kg, total: round2(product.price * kg) }
}

export interface PresentationCandidate<T> {
  product: T
  unitPrice: UnitPrice
  /** Variación porcentual del precio unitario vs el producto actual. */
  deltaPct: number
  /** El más barato por unidad de la comparación (incluido el actual). */
  best: boolean
}

export interface ComparableProduct {
  id: number
  name: string
  price: number
  unit?: string | null
}

export const PRESENTATION_LIMIT = 4

/**
 * Compara las presentaciones de un producto contra candidatos del mismo
 * catálogo.
 *
 * Reglas:
 *  - Solo entran candidatos con la MISMA base que el producto actual
 *    (comparar $/kg contra $/pieza no significa nada).
 *  - Se descarta el propio producto y los duplicados por id.
 *  - El nombre base debe coincidir para no mezclar productos distintos
 *    que casualmente se venden por kilo.
 *  - Se ordena de más barato a más caro por precio unitario y se marca
 *    `best` al primero de la lista completa (incluido el actual).
 */
export function comparePresentations<T extends ComparableProduct>(
  current: T,
  candidates: T[],
  limit = PRESENTATION_LIMIT,
): PresentationCandidate<T>[] {
  const currentUnit = unitPrice(current.price, current.unit)
  if (!currentUnit) return []

  const baseName = normalizeBaseName(current.name)
  if (!baseName) return []

  const comparable: PresentationCandidate<T>[] = []
  const seen = new Set<number>([current.id])

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue
    if (normalizeBaseName(candidate.name) !== baseName) continue

    const candidateUnit = unitPrice(candidate.price, candidate.unit)
    if (!candidateUnit || candidateUnit.base !== currentUnit.base) continue

    seen.add(candidate.id)
    comparable.push({
      product: candidate,
      unitPrice: candidateUnit,
      deltaPct: round2(((candidateUnit.amount - currentUnit.amount) / currentUnit.amount) * 100),
      best: false,
    })
  }

  comparable.sort((a, b) => a.unitPrice.amount - b.unitPrice.amount)

  // `best` se decide con el actual dentro de la contienda: si él es el
  // más barato, ningún candidato se marca.
  const cheapest = comparable[0]
  if (cheapest && cheapest.unitPrice.amount >= currentUnit.amount) {
    return comparable.slice(0, limit)
  }
  if (cheapest) cheapest.best = true

  return comparable.slice(0, limit)
}
