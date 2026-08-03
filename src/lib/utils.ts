import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
