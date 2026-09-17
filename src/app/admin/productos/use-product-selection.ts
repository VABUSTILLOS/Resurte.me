"use client"

import { useRef, useState } from "react"

import {
  addRange,
  collectFilteredIds,
  isAllFilteredSelected,
  shiftRange,
  toggleSelected,
} from "@/lib/admin-product-selection"

/**
 * Selección de filas del listado de productos.
 *
 * El estado y las reglas están separados: las reglas viven en
 * `@/lib/admin-product-selection` (probadas sin DOM) y aquí solo queda el
 * estado de React y el ancla del Shift+clic.
 *
 * El hook no memoiza sus funciones a propósito: `pageIds` es un array nuevo en
 * cada render, así que un `useCallback` dependería de él y cambiaría igual.
 */
export interface UseProductSelectionOptions {
  /** Ids de la página visible, en el orden en que se muestran (para Shift+clic). */
  pageIds: number[]
  /** Total de resultados del filtro actual, según la API. */
  total: number
  /** Query de la API de listado; el hook añade `idsOnly`/`page`/`pageSize`. */
  buildListQuery: (extra: Record<string, string>) => string
  /** Tope de ids por petición aceptado por la API. */
  idsPerRequest: number
}

export interface UseProductSelection {
  selected: Set<number>
  setSelected: React.Dispatch<React.SetStateAction<Set<number>>>
  toggleSelect: (id: number, shift: boolean) => void
  toggleSelectAllFiltered: () => Promise<void>
  allFilteredSelected: boolean
  clearSelection: () => void
}

export function useProductSelection({
  pageIds,
  total,
  buildListQuery,
  idsPerRequest,
}: UseProductSelectionOptions): UseProductSelection {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const lastSelectedRef = useRef<number | null>(null)

  const toggleSelect = (id: number, shift: boolean) => {
    if (shift && lastSelectedRef.current != null) {
      const range = shiftRange(pageIds, lastSelectedRef.current, id)
      if (range) {
        setSelected((prev) => addRange(prev, pageIds, range.from, range.to))
        return
      }
    }
    lastSelectedRef.current = id
    setSelected((prev) => toggleSelected(prev, id))
  }

  const allFilteredSelected = isAllFilteredSelected(total, selected.size)

  const toggleSelectAllFiltered = async () => {
    if (allFilteredSelected) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(await collectFilteredIds(buildListQuery, idsPerRequest)))
  }

  const clearSelection = () => setSelected(new Set())

  return {
    selected,
    setSelected,
    toggleSelect,
    toggleSelectAllFiltered,
    allFilteredSelected,
    clearSelection,
  }
}
