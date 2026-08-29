/**
 * Locale store for the panel i18n dictionaries.
 *
 * `t()` (re-exported from `./es`) stays a plain function so the ~30 existing
 * call sites don't change: it translates from the ACTIVE dictionary, falling
 * back to Spanish when a key is missing there. Dictionaries self-register on
 * import (`es` registers as fallback, `en` when the locale hook loads it).
 *
 * Switching locale is a rare user action handled by `use-locale.ts`: it
 * updates this store, persists the preference and calls `router.refresh()`
 * so the route re-renders with the new strings.
 */

export type Locale = "es" | "en"

export const LOCALES: readonly Locale[] = ["es", "en"]

type Dict = Record<string, unknown>

const dictionaries: Partial<Record<Locale, Dict>> = {}
let fallbackDict: Dict = {}
let activeLocale: Locale = "es"

export function registerDictionary(locale: Locale, dict: Dict, options?: { fallback?: boolean }) {
  dictionaries[locale] = dict
  if (options?.fallback) fallbackDict = dict
}

export function getActiveLocale(): Locale {
  return activeLocale
}

export function setActiveLocale(locale: Locale) {
  activeLocale = locale
}

function lookup(dict: Dict, key: string): string | undefined {
  let node: unknown = dict
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }
  return typeof node === "string" ? node : undefined
}

export function translate(key: string, vars?: Record<string, string | number>): string {
  const active = dictionaries[activeLocale]
  const value = (active && lookup(active, key)) ?? lookup(fallbackDict, key)
  if (value === undefined) return key
  if (!vars) return value
  return value.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in vars ? String(vars[name]) : m
  )
}
