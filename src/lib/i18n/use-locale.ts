"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useSyncedStorage } from "@/hooks/use-synced-storage"
import { getActiveLocale, setActiveLocale, type Locale } from "./locale"
// Side-effect import: registers the English dictionary so the panel bundle
// is the only one that ships it.
import "./en"

const STORAGE_KEY = "config-locale"

/**
 * Active locale preference for the panel, persisted like any other panel
 * config key (useSyncedStorage → panel_entries `config-locale`).
 *
 * On change (or on first mount with a stored non-default locale) it updates
 * the module-level locale store, syncs `<html lang>` and calls
 * `router.refresh()` — layout state changes don't re-render `children`, so a
 * refresh is the reliable way to re-render the whole tree with new strings.
 */
export function useLocale(): { locale: Locale; setLocale: (next: Locale) => void } {
  const router = useRouter()
  const [stored, setStored] = useSyncedStorage<string>(STORAGE_KEY, "es")
  const locale: Locale = stored === "en" ? "en" : "es"
  const appliedRef = useRef<Locale | null>(null)

  useEffect(() => {
    const changed = appliedRef.current !== null && appliedRef.current !== locale
    const firstNonDefault = appliedRef.current === null && locale !== "es"
    appliedRef.current = locale
    setActiveLocale(locale)
    document.documentElement.lang = locale === "en" ? "en" : "es-MX"
    if ((changed || firstNonDefault) && getActiveLocale() === locale) {
      router.refresh()
    }
  }, [locale, router])

  return { locale, setLocale: setStored }
}
