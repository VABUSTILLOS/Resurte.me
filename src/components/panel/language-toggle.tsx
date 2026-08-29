"use client"

import { t } from "@/lib/i18n/es"
import type { Locale } from "@/lib/i18n/locale"

/**
 * ES/EN switcher for the panel header. Presentational: the owning layout
 * (`PanelContent`) holds the locale state via `useLocale()` and passes it
 * down, so there's a single useSyncedStorage instance per preference.
 */
export function LanguageToggle({
  locale,
  setLocale,
}: {
  locale: Locale
  setLocale: (next: Locale) => void
}) {
  return (
    <div
      role="group"
      aria-label={t("common.language")}
      className="flex items-center rounded-xl border border-gray-200 bg-white overflow-hidden text-xs font-semibold"
    >
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={locale === l}
          onClick={() => setLocale(l)}
          className={`px-2.5 py-2 transition-colors ${
            locale === l
              ? "bg-[#0E7A0E] text-white"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}
