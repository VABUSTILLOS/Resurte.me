"use client"

import { useEffect } from "react"

/** Cierra un modal/overlay al presionar Escape. */
export function useEscapeKey(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose, active])
}
