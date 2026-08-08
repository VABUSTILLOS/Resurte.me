"use client"

import { useState, useEffect } from "react"
import { Sun, Moon, Monitor } from "lucide-react"
import { t } from "@/lib/i18n/es"
import { cn } from "@/lib/utils"

export type ThemePreference = "light" | "dark" | "system"

const STORAGE_KEY = "resurte-theme"

function getInitialPreference(): ThemePreference {
  if (typeof window === "undefined") return "system"
  const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null
  if (stored === "light" || stored === "dark" || stored === "system") return stored
  return "system"
}

function applyTheme(pref: ThemePreference) {
  const root = document.documentElement
  if (pref === "system") {
    root.removeAttribute("data-theme")
  } else {
    root.setAttribute("data-theme", pref)
  }
}

export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>("system")
  const [mounted, setMounted] = useState(false)

  // On mount: read stored preference, apply it immediately and render the correct
  // active state. The pre-hydration <script> already set data-theme, so applying
  // the same value again is idempotent (no flash). The setState is deferred to a
  // macrotask so it doesn't run synchronously during the effect body.
  useEffect(() => {
    const stored = getInitialPreference()
    applyTheme(stored)
    const id = setTimeout(() => {
      setPref(stored)
      setMounted(true)
    }, 0)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (!mounted) return
    applyTheme(pref)
    try {
      if (pref === "system") {
        localStorage.removeItem(STORAGE_KEY)
      } else {
        localStorage.setItem(STORAGE_KEY, pref)
      }
    } catch {
      // localStorage unavailable — theme still applies for this session
    }
  }, [pref, mounted])

  const options: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: t("theme.light"), icon: <Sun className="w-3.5 h-3.5" /> },
    { value: "dark", label: t("theme.dark"), icon: <Moon className="w-3.5 h-3.5" /> },
    { value: "system", label: t("theme.system"), icon: <Monitor className="w-3.5 h-3.5" /> },
  ]

  return (
    <div
      className="flex items-center gap-0.5 p-1 rounded-full border border-gray-200 bg-white/80"
      role="radiogroup"
      aria-label={t("theme.label")}
      title="Tema: claro, oscuro o según el sistema"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          role="radio"
          aria-checked={pref === opt.value}
          aria-label={opt.label}
          onClick={() => setPref(opt.value)}
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full transition-colors",
            pref === opt.value
              ? "bg-[#0E7A0E] text-white"
              : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          )}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  )
}
