import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Retorna "YYYY-MM" en la zona horaria de México (-06:00), sin DST,
 * para coincidir con el `month_year` que puebla el trigger de cashback
 * (TO_CHAR(NEW.created_at, 'YYYY-MM') en la zona del servidor).
 */
export function localMonthYear(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date)
  const year = parts.find((p) => p.type === "year")?.value ?? String(date.getFullYear())
  const month = parts.find((p) => p.type === "month")?.value ?? String(date.getMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

/**
 * Mínimo acumulado por semana ISO para que cuente como "semana calificada"
 * en el programa de recompensas (igual que la migración 00029).
 */
export const QUALIFYING_WEEK_MIN = 2500

/**
 * Semana ISO de una fecha (1-53), igual que EXTRACT(WEEK ...) en Postgres.
 */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// Maps legacy text-based icon identifiers to emoji icons
const CATEGORY_ICON_MAP: Record<string, string> = {
  apple: "🥬",
  package: "📦",
  milk: "🧀",
  beef: "🥩",
  bread: "🍞",
  cup: "🥤",
  cookie: "🍪",
  spray: "🧹",
  snowflake: "❄️",
}

// Guaranteed correct icons by category slug — overrides whatever is in the database.
// This prevents issues like 🚗 showing for "Carne" or wrong emojis in production.
const CATEGORY_SLUG_ICON_OVERRIDE: Record<string, string> = {
  // Food categories
  "frutas-verduras": "🥬",
  "frutas": "🍎",
  "verduras": "🥬",
  "carnes-aves-pescados": "🥩",
  "carnes-pescados": "🥩",
  "carnes": "🥩",
  "carne": "🥩",
  "abarrotes": "📦",
  "despensa": "🥫",
  "lacteos-huevos": "🧀",
  "lacteos": "🧀",
  "huevos": "🥚",
  "granos-semillas": "🌾",
  "granos": "🌾",
  "bebidas": "🥤",
  "panaderia": "🍞",
  "panaderia-tortilleria": "🍞",
  "limpieza": "🧹",
  "congelados": "❄️",
  "recompensas": "🎁",
  "resurte-me": "🛒",
}

// Emojis that should NEVER appear as category icons
const BLOCKED_EMOJIS = new Set([
  "🚗", "🚙", "🚕", "🚌", "🚛", "🚚", "🚐", "🚑", "🚒", "🚓", "🏍️", "✈️", "🚀", "⛵",
  "😀", "😂", "🤣", "😍", "😡", "💩", "👻", "💀",
  "📱", "💻", "🖥️", "⌚", "⏰",
])

/**
 * Returns the emoji icon for a category. Supports both emoji icons
 * and legacy text-based identifiers (e.g. "apple" → "🥬").
 *
 * Uses a slug-based override map to guarantee correct icons regardless
 * of what's stored in the database (prevents 🚗 for Carne, etc.).
 */
export function getCategoryIcon(icon: string | null | undefined, categorySlug?: string): string {
  // Slug-based override takes priority — guarantees correct icon
  if (categorySlug) {
    const override = CATEGORY_SLUG_ICON_OVERRIDE[categorySlug.toLowerCase()]
    if (override) return override
  }

  if (!icon) return "📦"

  // Already an emoji — validate it's not a blocked one
  if (/[\p{Emoji}]/u.test(icon)) {
    if (BLOCKED_EMOJIS.has(icon)) return "📦"
    return icon
  }

  // Legacy text identifier
  return CATEGORY_ICON_MAP[icon] ?? "📦"
}

/**
 * Extracts a scanning-friendly tagline from a product description.
 * Returns the last sentence of the description as a concise benefit/use-case line.
 */
export function getProductTagline(description: string | null | undefined): string | null {
  if (!description) return null
  // Split on sentence boundaries: period followed by space or end
  const sentences = description.split(/\.\s+/)
  const last = sentences[sentences.length - 1]
  // Only return if it's meaningful and different from the full text
  if (!last || last.length < 5 || last === description) return null
  // Clean trailing period
  return last.replace(/\.$/, "").trim()
}
