"use client"

import { useState } from "react"

interface AccordionItemProps {
  title: string
  /** Estado inicial. En móvil por defecto se prefiere cerrado para no
   *  empujar el contenido de confianza fuera del pliegue. */
  defaultOpen?: boolean
  children: React.ReactNode
}

/**
 * Item de accordion Erewhon-style, controlado por React.
 * Reemplaza la manipulación directa del DOM (aria-expanded + clase .open)
 * que había en product-detail-client.
 */
export function AccordionItem({ title, defaultOpen = false, children }: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen)

  // Si defaultOpen cambia (p. ej. al rotar de móvil a desktop), lo respeta
  // salvo que el usuario ya haya interactuado. Ajuste de estado durante el
  // render (patrón oficial de React), no en un effect.
  const [touched, setTouched] = useState(false)
  const [prevDefaultOpen, setPrevDefaultOpen] = useState(defaultOpen)
  if (prevDefaultOpen !== defaultOpen) {
    setPrevDefaultOpen(defaultOpen)
    if (!touched) setOpen(defaultOpen)
  }

  return (
    <div className="border-b border-[#ede8df] pb-3 mb-3">
      <button
        type="button"
        className="accordion-header flex items-center justify-between w-full text-left text-sm font-semibold text-[#1a1a1a] py-2 uppercase tracking-wider"
        onClick={() => {
          setTouched(true)
          setOpen((o) => !o)
        }}
        aria-expanded={open}
      >
        {title}
        <span className="accordion-icon text-lg leading-none text-[var(--text-secondary)]">+</span>
      </button>
      <div className={`accordion-body${open ? " open" : ""}`}>
        {children}
      </div>
    </div>
  )
}
