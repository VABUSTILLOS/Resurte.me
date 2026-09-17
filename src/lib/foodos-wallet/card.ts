/**
 * Tarjeta de lealtad de FoodOS: núcleo **puro**.
 *
 * Aquí vive la forma de la tarjeta (qué dice, de qué color, qué código lleva)
 * y nada más. No hay red, ni base de datos, ni certificados: los adaptadores
 * de Apple (`apple.ts`) y Google (`google.ts`) traducen este objeto a su
 * formato, y el de respaldo (`/api/foodos/wallet/[token]/png`) lo dibuja.
 *
 * Regla: el saldo es una **fotografía**, no una consulta viva. La tarjeta que
 * el comensal ya tiene en el teléfono muestra los puntos del momento en que se
 * emitió o se sincronizó; refrescarla es trabajo del servidor, no del pase.
 */

/** Plataformas de la tarjeta. `web` es la de respaldo, sin certificados. */
export type WalletPlatform = "apple" | "google" | "web"

export const WALLET_PLATFORMS: WalletPlatform[] = ["apple", "google", "web"]

export function isWalletPlatform(value: unknown): value is WalletPlatform {
  return typeof value === "string" && (WALLET_PLATFORMS as string[]).includes(value)
}

/** Color de marca por defecto (verde Resurte). */
export const DEFAULT_CARD_COLOR = "#0E7A0E"

/** Tope de puntos que se muestra en la tarjeta antes de recortar. */
const MAX_POINTS_DISPLAY = 9_999_999

export interface WalletReward {
  /** Texto ya traducido por el llamador (la lib no conoce idiomas). */
  label: string
  threshold: number
  remaining: number
  /** 0..1, recortado. */
  progress: number
  achieved: boolean
}

/**
 * Etiquetas del pase. La lib no conoce idiomas: el llamador pasa las suyas ya
 * traducidas y aquí solo se interpolan.
 */
export interface WalletCardLabels {
  points: string
  value: string
  reward: string
  /** `{n}` = puntos faltantes, `{label}` = recompensa. */
  remaining: string
  /** `{label}` = recompensa. */
  achieved: string
}

export const DEFAULT_CARD_LABELS: WalletCardLabels = {
  points: "PUNTOS",
  value: "EQUIVALEN",
  reward: "RECOMPENSA",
  remaining: "{n} para {label}",
  achieved: "¡{label}!",
}

/** Sustituye `{clave}` por su valor. Sin dependencias ni ICU. */
export function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match)
}

export interface WalletCardInput {
  serial: string
  /** URL con el token de capacidad: es lo que codifica el QR. */
  cardUrl: string
  restaurantName: string
  logoUrl?: string | null
  themeColor?: string | null
  customerName?: string | null
  points: number
  /** Valor en pesos de cada punto. */
  pointValue: number
  /** Recompensa a la que se avanza. Sin etiqueta no hay barra de progreso. */
  rewardLabel?: string | null
  rewardThreshold?: number | null
  /** Etiquetas traducidas. Las que falten caen al español por defecto. */
  labels?: Partial<WalletCardLabels>
}

export interface WalletCard {
  serial: string
  description: string
  organizationName: string
  logoText: string
  logoUrl: string | null
  backgroundColor: string
  foregroundColor: string
  labelColor: string
  header: string
  primary: string
  secondary: string
  auxiliary: string[]
  labels: WalletCardLabels
  /** Línea de recompensa ya compuesta, o `""` si no hay recompensa. */
  rewardText: string
  barcode: { format: "QR"; message: string; altText: string }
  points: number
  pointsValue: number
  reward: WalletReward | null
}

// ------------------------------------------------------------
// Color
// ------------------------------------------------------------

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * Normaliza un color a `#rrggbb`. Acepta `#abc`, `#aabbcc` y `aabbcc`.
 * Cualquier otra cosa (nombres CSS, `rgb()`, basura) cae al color por defecto:
 * un color inválido invalida el pase entero, así que preferimos uno nuestro
 * antes que arriesgarnos.
 */
export function normalizeHex(value: string | null | undefined, fallback = DEFAULT_CARD_COLOR): string {
  const raw = (value ?? "").trim()
  if (!HEX_RE.test(raw)) return fallback
  const hex = raw.replace("#", "").toLowerCase()
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
  }
  return `#${hex}`
}

/** Componentes 0..255 de un color ya normalizado. */
function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

/** `#0e7a0e` → `rgb(14, 122, 14)`. Formato que aceptan Apple y Google. */
export function toRgbString(hex: string): string {
  const [r, g, b] = rgb(normalizeHex(hex))
  return `rgb(${r}, ${g}, ${b})`
}

/** Luminancia relativa (WCAG). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(normalizeHex(hex)).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Umbral donde el texto negro y el blanco empatan en contraste WCAG.
 *
 * No es 0.5 ni 0.45: el contraste con negro es `(L + 0.05) / 0.05` y con
 * blanco `1.05 / (L + 0.05)`, y se igualan en `L ≈ 0.179`. Por debajo, el
 * blanco contrasta más; por encima, el negro. Con un umbral a ojo, un naranja
 * de marca (#E67E22, L ≈ 0.32) recibía texto blanco a 2.9:1 cuando el negro
 * daba 7.4:1.
 */
const LIGHT_TEXT_THRESHOLD = 0.179

/**
 * Texto legible sobre el color de marca. La tarjeta es del restaurante, así
 * que no podemos asumir fondo claro ni oscuro.
 */
export function contrastForeground(hex: string): string {
  return luminance(hex) > LIGHT_TEXT_THRESHOLD ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)"
}

/** Etiquetas del pase: mismo tono que el texto, atenuado. */
export function labelColorFor(hex: string): string {
  return luminance(hex) > LIGHT_TEXT_THRESHOLD
    ? "rgba(0, 0, 0, 0.6)"
    : "rgba(255, 255, 255, 0.75)"
}

// ------------------------------------------------------------
// Formato
// ------------------------------------------------------------

/** Entero seguro y no negativo (los puntos nunca bajan de cero). */
export function safePoints(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : value
  if (typeof n !== "number" || !Number.isFinite(n)) return 0
  return Math.min(MAX_POINTS_DISPLAY, Math.max(0, Math.floor(n)))
}

/** `1234` → `"1,234"`. */
export function formatPoints(points: number): string {
  return safePoints(points).toLocaleString("es-MX")
}

/** `12.5` → `"$12.50"`. */
export function formatMoney(amount: number): string {
  const n = Number.isFinite(amount) ? Math.max(0, amount) : 0
  return `$${n.toFixed(2)}`
}

/** Nombre corto del comensal ("Ana Ruiz" → "Ana"). */
export function shortName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? ""
  return first.slice(0, 24)
}

// ------------------------------------------------------------
// Recompensa
// ------------------------------------------------------------

/**
 * Progreso hacia la recompensa. Sin etiqueta no hay recompensa que anunciar
 * (una barra de progreso sin texto no comunica nada), así que devuelve `null`.
 */
export function rewardFor(
  points: number,
  threshold: number | null | undefined,
  label: string | null | undefined
): WalletReward | null {
  const text = (label ?? "").trim()
  const goal = safePoints(threshold ?? 0)
  if (!text || goal <= 0) return null
  const current = safePoints(points)
  const achieved = current >= goal
  return {
    label: text,
    threshold: goal,
    remaining: Math.max(0, goal - current),
    progress: Math.min(1, current / goal),
    achieved,
  }
}

// ------------------------------------------------------------
// Serial
// ------------------------------------------------------------

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

/** FNV-1a de 32 bits sobre un valor con semilla. */
function fnv32(value: string, seed: number): number {
  let h = seed >>> 0
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, FNV_PRIME) >>> 0
  }
  return h >>> 0
}

/**
 * Hash de 64 bits (dos pasadas de 32 bits con semillas distintas) en hex.
 * Determinista y sin dependencias; no se usa para criptografía, solo para
 * derivar identificadores estables.
 */
export function hash64(value: string): string {
  const a = fnv32(value, FNV_OFFSET)
  const b = fnv32(`${value}#alt`, FNV_OFFSET ^ 0x9e3779b9)
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0")
}

/**
 * Serial del pase: determinista por (restaurante, cliente, plataforma).
 *
 * Reemitir la tarjeta del mismo cliente en la misma plataforma debe dar el
 * mismo serial: si cambiara, Apple y Google acumularían pases duplicados en el
 * teléfono del comensal.
 */
export function walletSerial(
  restaurantId: string,
  customerId: string,
  platform: WalletPlatform
): string {
  return `W${hash64(`${restaurantId}:${customerId}:${platform}`)}`
}

// ------------------------------------------------------------
// Tarjeta
// ------------------------------------------------------------

/**
 * Construye la tarjeta. Todo lo que se muestra sale de aquí: los adaptadores
 * no deciden texto ni color, solo lo traducen.
 */
export function buildWalletCard(input: WalletCardInput): WalletCard {
  const color = normalizeHex(input.themeColor)
  const points = safePoints(input.points)
  const reward = rewardFor(points, input.rewardThreshold, input.rewardLabel)
  const name = shortName(input.customerName)
  const labels: WalletCardLabels = { ...DEFAULT_CARD_LABELS, ...input.labels }
  const value =
    Math.round(points * (Number.isFinite(input.pointValue) ? input.pointValue : 0) * 100) / 100

  const rewardText = reward
    ? applyTemplate(reward.achieved ? labels.achieved : labels.remaining, {
        n: formatPoints(reward.remaining),
        label: reward.label,
      })
    : ""

  return {
    serial: input.serial,
    description: `Tarjeta de lealtad de ${input.restaurantName}`,
    organizationName: input.restaurantName,
    logoText: input.restaurantName.slice(0, 24),
    logoUrl: input.logoUrl?.trim() || null,
    backgroundColor: color,
    foregroundColor: contrastForeground(color),
    labelColor: labelColorFor(color),
    header: name || input.restaurantName,
    primary: `${formatPoints(points)} pts`,
    secondary: value > 0 ? `≈ ${formatMoney(value)}` : "",
    auxiliary: rewardText ? [rewardText] : [],
    labels,
    rewardText,
    barcode: {
      format: "QR",
      message: input.cardUrl,
      altText: input.serial,
    },
    points,
    pointsValue: value,
    reward,
  }
}
