"use client"

import { useState } from "react"
import type { AdminWhatsappCategory } from "@/app/admin/actions"

/**
 * Alta de categoría desde el panel del catálogo de WhatsApp.
 *
 * POR QUÉ ES UN COMPONENTE Y NO DOS BLOQUES COPIADOS
 * -------------------------------------------------
 * El alta se pide desde las DOS tarjetas del panel —"Agregar productos" y
 * "Catálogo de …"—, porque cada una es el sitio natural según lo que se esté
 * haciendo: curar productos o revisar el orden del catálogo. Duplicar el
 * formulario sería duplicar también su validación, su estado de error y el
 * endpoint; aquí vive una sola vez.
 *
 * POR QUÉ HACE EL FETCH ÉL MISMO
 * -----------------------------
 * El endpoint (`POST /api/admin/categories/create`) ya resuelve slug único,
 * invalidación de caché y auditoría. El componente sólo lo llama y entrega la
 * categoría creada; quién la guarda y qué hace con ella lo decide el panel
 * (`onCreated`), que es el único que conoce su propia lista y su filtro.
 *
 * El error se muestra aquí mismo y no en el aviso del panel: si el alta falla,
 * el motivo tiene que estar pegado al campo que lo causó.
 */
export interface NewCategoryControlProps {
  /** Categoría recién creada: el panel la añade a su lista y la preselecciona. */
  onCreated: (category: AdminWhatsappCategory) => void
  /** Hay una acción en curso en el panel: se deshabilita para no pisarla. */
  busy?: boolean
}

export function NewCategoryControl({ onCreated, busy }: NewCategoryControlProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function close() {
    setOpen(false)
    setName("")
    setError(null)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const value = name.trim()
    if (!value || creating) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/categories/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Error al crear la categoría")
      onCreated(data.category as AdminWhatsappCategory)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear la categoría")
    } finally {
      setCreating(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={busy}
        aria-expanded={false}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-[#0E7A0E]/40 text-[#0E7A0E] hover:bg-[#E7F8EE] disabled:opacity-50"
      >
        + Nueva categoría
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre de la nueva categoría…"
        aria-label="Nombre de la nueva categoría"
        autoFocus
        className="flex-1 min-w-[12rem] px-3 py-2 bg-white border border-[#E8E9EB] rounded-xl text-sm focus:outline-none focus:border-[#0E7A0E]"
      />
      <button
        type="submit"
        disabled={creating || !name.trim()}
        className="px-4 py-2 rounded-xl bg-[#0E7A0E] text-white text-xs font-bold hover:bg-[#0D720D] disabled:opacity-50"
      >
        {creating ? "Creando…" : "Crear categoría"}
      </button>
      <button
        type="button"
        onClick={close}
        className="px-3 py-2 rounded-xl text-xs font-semibold text-[var(--text-secondary)] hover:bg-[#EDEAE4]"
      >
        Cancelar
      </button>
      {error && <p className="w-full text-[11px] text-red-700">{error}</p>}
    </form>
  )
}
