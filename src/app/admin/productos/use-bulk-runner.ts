"use client"

import { useRef, useState } from "react"

import {
  resolveBulkOutcome,
  type BulkFailureSummary,
  type BulkOptions,
  type BulkRunResult,
} from "@/lib/admin-product-bulk-run"
import { productCount } from "@/lib/admin-product-list"

export interface UseBulkRunnerOptions {
  /** Aviso efímero del panel (toast). */
  notify: (message: string) => void
}

export interface UseBulkRunner {
  bulkProgress: { done: number; total: number } | null
  setBulkProgress: React.Dispatch<React.SetStateAction<{ done: number; total: number } | null>>
  bulkFailures: BulkFailureSummary | null
  setBulkFailures: React.Dispatch<React.SetStateAction<BulkFailureSummary | null>>
  bulkCancelling: boolean
  /** Arranca una acción: progreso a cero, sin cancelar, sin fallos heredados. */
  beginBulk: () => void
  /** Pide cancelar la acción en curso. */
  cancelBulk: () => void
  /** Conecta `bulkPatch*`/`runPerId` con la barra de progreso. */
  bulkRunOptions: () => BulkOptions
  /** Cierra la acción y decide si hay algo que reportar. */
  finishBulk: (result: BulkRunResult) => boolean
  /** `true` una vez pedida la cancelación (para bucles propios, p. ej. SEO). */
  isCancelled: () => boolean
}

/**
 * Progreso, cancelación y fallos parciales de las acciones en lote.
 *
 * Vive fuera de `page.tsx` porque es el único punto donde se decide qué ve el
 * admin al terminar: antes cada acción mostraba su propio toast de éxito aunque
 * el lote hubiera fallado a medias.
 */
export function useBulkRunner({ notify }: UseBulkRunnerOptions): UseBulkRunner {
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)
  const [bulkFailures, setBulkFailures] = useState<BulkFailureSummary | null>(null)
  const [bulkCancelling, setBulkCancelling] = useState(false)
  const cancelledRef = useRef(false)

  function beginBulk() {
    cancelledRef.current = false
    setBulkCancelling(false)
    setBulkProgress({ done: 0, total: 0 })
    setBulkFailures(null)
  }

  /**
   * No aborta la petición ya enviada (deja el servidor terminar ese bloque, que
   * es la unidad atómica); corta antes de enviar el siguiente.
   */
  function cancelBulk() {
    cancelledRef.current = true
    setBulkCancelling(true)
  }

  function bulkRunOptions(): BulkOptions {
    return {
      onProgress: (done, total) => setBulkProgress({ done, total }),
      isCancelled: () => cancelledRef.current,
    }
  }

  /**
   * Devuelve `true` cuando terminó entera y sin fallos: solo entonces el
   * llamador muestra su mensaje de éxito. Si se canceló o hubo fallos, el
   * detalle va al panel de fallos y no a un toast genérico.
   */
  function finishBulk(result: BulkRunResult): boolean {
    setBulkProgress(null)
    setBulkCancelling(false)
    const outcome = resolveBulkOutcome(result)
    if (outcome.kind === "cancelled") {
      notify(`Cancelado · ${productCount(outcome.applied)} ya se habían actualizado`)
      return false
    }
    if (outcome.kind === "failed") {
      setBulkFailures(outcome.failures)
      return false
    }
    return true
  }

  return {
    bulkProgress,
    setBulkProgress,
    bulkFailures,
    setBulkFailures,
    bulkCancelling,
    beginBulk,
    cancelBulk,
    bulkRunOptions,
    finishBulk,
    isCancelled: () => cancelledRef.current,
  }
}
