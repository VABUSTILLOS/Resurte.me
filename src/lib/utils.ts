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

/**
 * Returns the emoji icon for a category. Supports both emoji icons
 * and legacy text-based identifiers (e.g. "apple" → "🥬").
 */
export function getCategoryIcon(icon: string | null | undefined): string {
  if (!icon) return "📦"
  // Already an emoji
  if (/[\p{Emoji}]/u.test(icon)) return icon
  // Legacy text identifier
  return CATEGORY_ICON_MAP[icon] ?? "📦"
}
