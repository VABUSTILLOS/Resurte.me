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

function getOsDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
}

export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>("system")
  const [mounted, setMounted] = useState(false)
  const [osDark, setOsDark] = useState<boolean>(false)
  const [pressed, setPressed] = useState<ThemePreference | null>(null)

  // On mount: read stored preference, apply it immediately and render the correct
  // active state. The pre-hydration <script> already set data-theme, so applying
  // the same value again is idempotent (no flash). The setState is deferred to a
  // macrotask so it doesn't run synchronously during the effect body.
  useEffect(() => {
    const stored = getInitialPreference()
    applyTheme(stored)
    const id = setTimeout(() => {
      setPref(stored)
      setOsDark(getOsDark())
      setMounted(true)
    }, 0)
    return () => clearTimeout(id)
  }, [])

  // Track the OS color scheme so the "system" option can show which theme
  // is currently resolved (feedback even when OS == stored preference).
  useEffect(() => {
    if (!mounted) return
    if (!window.matchMedia) return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setOsDark(mq.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [mounted])

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

  // Tapping any option (including the already-active one) gives tactile feedback.
  const handleSelect = (value: ThemePreference) => {
    setPref(value)
    setPressed(value)
    window.setTimeout(() => setPressed(null), 200)
  }

  const resolvedTheme: "light" | "dark" = pref === "system" ? (osDark ? "dark" : "light") : pref
  const resolvedLabel = resolvedTheme === "dark" ? t("theme.dark") : t("theme.light")

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
      title={`Tema: ${pref === "system" ? `según el sistema (ahora ${resolvedLabel.toLowerCase()})` : resolvedLabel}`}
    >
      {options.map((opt) => {
        const active = pref === opt.value
        const isSystem = opt.value === "system"
        const label = isSystem ? `${opt.label} (${resolvedLabel.toLowerCase()})` : opt.label
        const isPressed = pressed === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => handleSelect(opt.value)}
            className={cn(
              "relative flex items-center justify-center w-8 h-8 rounded-full transition-all duration-150",
              active
                ? "bg-[#0E7A0E] text-white"
                : "text-gray-400 hover:text-gray-600 hover:bg-gray-100",
              isPressed && "scale-90"
            )}
          >
            {opt.icon}
            {isSystem && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full ring-1 ring-white/80",
                  resolvedTheme === "dark" ? "bg-indigo-400" : "bg-amber-400"
                )}
              />
            )}
          </button>
        )
      })}
      <span className="sr-only" role="status" aria-live="polite">
        {mounted ? `${t("theme.label")}: ${resolvedLabel}` : ""}
      </span>
    </div>
  )
}
