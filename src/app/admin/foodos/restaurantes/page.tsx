"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, Loader2, AlertTriangle, ShieldCheck } from "lucide-react"
import {
  getFoodosReviewQueue,
  type ReviewQueue,
  type ReviewQueueRow,
} from "@/lib/foodos/actions/moderation-admin"
import { MIN_MENU_ITEMS_TO_PUBLISH, type FoodosRestaurantStatus } from "@/lib/foodos-moderation"
import { ReviewActions } from "./review-forms"

/**
 * /admin/foodos/restaurantes — la cola de revisión de los micrositios FoodOS.
 *
 * Antes de 00168 publicar un restaurante era un acto unilateral del dueño:
 * `00023_foodos.sql` le da `FOR ALL USING (auth.uid() = user_id)` sobre su fila
 * y `00160` deja `status` en la lista blanca de columnas que puede escribir. La
 * única puerta a `/r/[slug]` la abría él, sin revisión y sin que nadie se
 * enterara. No era un agujero de permisos: era un modelo de publicación que no
 * existía.
 *
 * `00168` lo cambió por una máquina de estados (`draft → pending_review →
 * active`, más `paused` y el rechazo `pending_review → draft`) donde **sólo un
 * admin escribe `active`**. Esta pantalla es la otra mitad de ese cambio. Sin
 * ella la máquina de estados no sería una solución: sería una traba, porque los
 * restaurantes se quedarían en `pending_review` para siempre.
 *
 * Tres cosas que la pantalla no hace a propósito:
 *
 *   1. **No recalcula la cola.** Lee `foodos_review_queue()`, que ya resuelve en
 *      la base el correo del dueño (vive en `auth.users`; `profiles` no tiene
 *      esa columna), los conteos y el orden de urgencia.
 *   2. **No reimplementa la precondición de publicación.** Aprobar se bloquea
 *      con el conteo que devolvió la base y la misma constante que usa el RPC
 *      (`MIN_MENU_ITEMS_TO_PUBLISH`), para que la pantalla avise antes de que el
 *      admin reciba un error.
 *   3. **No ofrece borrar ni editar.** Revisar es un acto con fecha y autor; el
 *      historial está en la bitácora, no en un formulario.
 */
const STATUS_LABEL: Record<FoodosRestaurantStatus, string> = {
  draft: "Borrador",
  pending_review: "En revisión",
  active: "Publicado",
  paused: "Pausado",
}

const STATUS_BADGE: Record<FoodosRestaurantStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_review: "bg-sky-100 text-sky-800",
  active: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-800",
}

/**
 * Fecha corta de la solicitud. Es un instante que ya viene resuelto del
 * servidor, así que se recorta en vez de reinterpretarlo: reinterpretarlo en el
 * navegador del admin movería el día según su zona horaria.
 */
function shortDate(value: string | null): string {
  return value ? value.slice(0, 10) : "—"
}

export default function AdminFoodosReviewPage() {
  const [queue, setQueue] = useState<ReviewQueue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchQueue = useCallback(() => getFoodosReviewQueue(), [])

  // El efecto no toca estado de forma síncrona: encadena la promesa y sólo
  // escribe cuando ya resolvió (react-hooks/set-state-in-effect). Un
  // `setLoading(true)` suelto al principio del efecto lo dispararía.
  useEffect(() => {
    let cancelled = false
    fetchQueue()
      .then((data) => {
        if (cancelled) return
        setQueue(data)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setQueue(null)
        setError(err instanceof Error ? err.message : "Error al cargar la cola de revisión")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchQueue])

  // El botón sí puede escribir de forma síncrona: no es un efecto.
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setQueue(await fetchQueue())
      setError(null)
    } catch (err) {
      setQueue(null)
      setError(err instanceof Error ? err.message : "Error al cargar la cola de revisión")
    } finally {
      setLoading(false)
    }
  }, [fetchQueue])

  const rows = queue?.rows ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Restaurantes FoodOS</h1>
        <p className="text-sm text-gray-500 mt-1">
          Publicar un micrositio lo decide Resurte.me. El dueño solicita la revisión; aquí se
          aprueba, se piden cambios o se pausa.
        </p>
      </div>

      {queue && queue.pendingCount > 0 && (
        <div className="bg-sky-50 border border-sky-200 text-sky-900 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          {queue.pendingCount === 1
            ? "1 restaurante espera tu decisión."
            : `${queue.pendingCount} restaurantes esperan tu decisión.`}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {loading && !queue && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-[#0E7A0E]" />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center">
          <p className="text-sm text-gray-500">
            No hay restaurantes que revisar. Aparecerán aquí en cuanto un dueño solicite la
            publicación.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {rows.map((row) => (
          <ReviewCard key={row.restaurantId} row={row} onDone={load} />
        ))}
      </div>
    </div>
  )
}

function ReviewCard({ row, onDone }: { row: ReviewQueueRow; onDone: () => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900 truncate">{row.name}</h2>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[row.status]}`}>
              {STATUS_LABEL[row.status]}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1 truncate">
            {row.ownerEmail ?? "Sin correo registrado"} · /r/{row.slug}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {row.menuItems} platillo{row.menuItems === 1 ? "" : "s"} · {row.branches} sucursal
            {row.branches === 1 ? "" : "es"} · solicitado {shortDate(row.submittedAt)}
          </p>
        </div>
        <Link
          href={`/r/${row.slug}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0E7A0E] hover:underline shrink-0"
        >
          Ver micrositio
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {row.blocker && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {row.blocker} Mínimo para publicar: {MIN_MENU_ITEMS_TO_PUBLISH}.
        </div>
      )}

      {row.reviewNote && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl px-3 py-2">
          <p className="font-semibold">Cambios pedidos</p>
          <p className="mt-0.5">{row.reviewNote}</p>
        </div>
      )}

      <ReviewActions row={row} onDone={onDone} />
    </div>
  )
}
