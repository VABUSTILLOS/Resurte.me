"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { MoreHorizontal } from "lucide-react"

export interface RowActionItem {
  key: string
  label: string
  icon: ReactNode
  /** Acción en sitio. Se ignora si hay `href`. */
  onSelect?: () => void
  /** Navegación (p. ej. ver el producto en la tienda). */
  href?: string
  destructive?: boolean
  disabled?: boolean
  /** Dibuja un separador antes de este ítem (agrupa lo destructivo al final). */
  separatorBefore?: boolean
}

const MENU_WIDTH = 224
const ITEM_HEIGHT = 40
const MAX_MENU_HEIGHT = 320

/**
 * Menú "⋯" para las acciones secundarias de una fila o tarjeta.
 *
 * El listado tiene ~10 acciones por producto y sólo se descubrían por el
 * `title` del icono. Las primarias siguen visibles; el resto vive aquí, con
 * etiqueta de texto.
 *
 * Se posiciona con `position: fixed` a partir del rect del disparador: el
 * contenedor de la tabla usa `overflow-x-auto` (que fuerza `overflow-y: auto`)
 * y `overflow-hidden`, así que un desplegable absoluto quedaría recortado.
 */
export function RowActionMenu({
  label,
  items,
  align = "end",
}: {
  /** Nombre accesible del disparador, p. ej. `Más acciones para Tomate`. */
  label: string
  items: RowActionItem[]
  align?: "start" | "end"
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      close()
      triggerRef.current?.focus()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    // El menú está anclado a coordenadas fijas: cualquier scroll o resize lo
    // dejaría desalineado de su fila.
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("resize", close)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const first = panelRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"]:not([disabled])'
    )
    first?.focus()
  }, [open])

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      const height = Math.min(items.length * ITEM_HEIGHT + 16, MAX_MENU_HEIGHT)
      const preferred = align === "end" ? rect.right - MENU_WIDTH : rect.left
      const left = Math.max(8, Math.min(preferred, window.innerWidth - MENU_WIDTH - 8))
      const fitsBelow = rect.bottom + height + 8 <= window.innerHeight
      const top = fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - height - 4)
      setPos({ left, top })
    }
    setOpen(true)
  }

  const onPanelKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") {
      return
    }
    e.preventDefault()
    const nodes = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []
    )
    if (nodes.length === 0) return
    const index = nodes.indexOf(document.activeElement as HTMLElement)
    let next = 0
    if (e.key === "End") next = nodes.length - 1
    else if (e.key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % nodes.length
    else if (e.key === "ArrowUp") next = index < 0 ? nodes.length - 1 : (index - 1 + nodes.length) % nodes.length
    nodes[next]?.focus()
  }

  if (items.length === 0) return null

  const itemClass = (item: RowActionItem) =>
    `flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors disabled:opacity-50 ${
      item.destructive
        ? "text-red-600 hover:bg-red-50"
        : "text-gray-700 hover:bg-gray-100"
    }`

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && pos && (
        <div
          ref={panelRef}
          role="menu"
          aria-label={label}
          onKeyDown={onPanelKeyDown}
          style={{ position: "fixed", left: pos.left, top: pos.top, width: MENU_WIDTH }}
          className="z-[60] flex max-h-80 flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
        >
          {items.map((item) => (
            <div key={item.key} className="contents">
              {item.separatorBefore && (
                <div role="separator" className="my-1 h-px bg-gray-100" />
              )}
              {item.href ? (
                <Link
                  role="menuitem"
                  href={item.href}
                  target="_blank"
                  onClick={() => setOpen(false)}
                  className={itemClass(item)}
                >
                  <span aria-hidden="true" className="shrink-0">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false)
                    item.onSelect?.()
                  }}
                  className={itemClass(item)}
                >
                  <span aria-hidden="true" className="shrink-0">
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
