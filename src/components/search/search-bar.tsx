"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Search, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { AnalyticsEvents } from "@/lib/analytics"
import { useMediaQuery } from "@/hooks/use-media-query"
import { MOBILE_SEARCH_EVENT } from "@/components/search/mobile-search-overlay"

interface SearchBarProps {
  citySlug: string
  placeholder?: string
  className?: string
  compact?: boolean
  /** En móvil el input abre el overlay de búsqueda en vivo (readOnly). */
  mobileOverlay?: boolean
}

export function SearchBar({
  citySlug,
  placeholder,
  className = "",
  compact = false,
  mobileOverlay = false,
}: SearchBarProps) {
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const isMobile = useMediaQuery("(max-width: 639px)", true)

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = query.trim()
      if (trimmed.length < 2) return
      AnalyticsEvents.search(trimmed)
      router.push(`/${citySlug}/buscar?q=${encodeURIComponent(trimmed)}`)
      setFocused(false)
      inputRef.current?.blur()
    },
    [query, citySlug, router]
  )

  const handleClear = useCallback(() => {
    setQuery("")
    inputRef.current?.focus()
  }, [])

  // Keyboard shortcut: "/" to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && document.activeElement !== inputRef.current) {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === "Escape") {
        inputRef.current?.blur()
        setFocused(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  return (
    <form onSubmit={handleSubmit} className={`relative ${className}`}>
      <div
        className={`flex items-center bg-white border rounded-xl transition-all ${
          focused
            ? "border-[#0E7A0E] ring-2 ring-[#0E7A0E]/10 shadow-[0_0_0_3px_rgba(16,137,16,0.06)]"
            : "border-[#e0dbd2] hover:border-[#c0bab0] shadow-sm"
        } ${compact ? "h-9" : "h-11"}`}
      >
        <Search
          className={`shrink-0 text-[var(--text-secondary)] ${compact ? "w-4 h-4 ml-3" : "w-5 h-5 ml-4"}`}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (mobileOverlay && isMobile) {
              window.dispatchEvent(new CustomEvent(MOBILE_SEARCH_EVENT))
              return
            }
            setFocused(true)
          }}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder={placeholder ?? "Buscar productos..."}
          className="flex-1 bg-transparent px-3 text-[#1a1a1a] placeholder:text-[var(--text-secondary)] focus:outline-none text-sm"
          minLength={2}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 p-1 mr-1 rounded-full hover:bg-[#F7F5F0]"
          >
            <X className="w-4 h-4 text-[var(--text-secondary)]" />
          </button>
        )}
        <button
          type="submit"
          className={`shrink-0 bg-[#0E7A0E] text-white rounded-[10px] hover:bg-[#0D720D] transition-colors font-medium ${
            compact ? "text-xs px-3 py-1 mr-1" : "text-sm px-4 py-1.5 mr-1.5"
          }`}
        >
          Buscar
        </button>
      </div>

      {/* Keyboard hint */}
      {!focused && !query && (
        <div className="absolute right-16 top-1/2 -translate-y-1/2 hidden sm:flex items-center pointer-events-none">
          <kbd className="text-[10px] text-[var(--text-secondary)] bg-[#F7F5F0] border border-[#E8E9EB] rounded px-1.5 py-0.5">
            /
          </kbd>
        </div>
      )}
    </form>
  )
}
