"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { AnimatePresence, motion, useDragControls } from "framer-motion"
import { useEscapeKey } from "@/hooks/use-escape-key"
import { useMediaQuery } from "@/hooks/use-media-query"

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Etiqueta accesible del diálogo. */
  ariaLabel?: string
  /** Id del elemento que titula el diálogo (aria-labelledby). */
  ariaLabelledby?: string
  /** Ancho del panel en desktop (sm+). Default max-w-md. */
  maxWidthClass?: string
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

/**
 * Diálogo responsivo: bottom sheet con drag-to-dismiss en móvil (<sm) y
 * modal centrado en desktop. Backdrop con cierre por click, Escape cierra,
 * focus trap ligero y padding de safe-area.
 */
export function BottomSheet({
  open,
  onClose,
  children,
  ariaLabel,
  ariaLabelledby,
  maxWidthClass = "max-w-md",
}: BottomSheetProps) {
  const isMobile = useMediaQuery("(max-width: 639px)")
  const dragControls = useDragControls()
  const panelRef = useRef<HTMLDivElement>(null)

  useEscapeKey(onClose, open)

  // Focus inicial + trap ligero mientras está abierto.
  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    panel.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/40"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledby}
            tabIndex={-1}
            initial={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.96 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.96 }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            drag={isMobile ? "y" : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) onClose()
            }}
            className={`relative w-full ${maxWidthClass} bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[88vh] overflow-y-auto pb-[env(safe-area-inset-bottom)] outline-none`}
          >
            {/* Handle de arrastre — solo móvil */}
            <div
              className="sm:hidden sticky top-0 z-10 flex justify-center pt-2 pb-1 bg-white rounded-t-2xl touch-none cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              aria-hidden="true"
            >
              <span className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
