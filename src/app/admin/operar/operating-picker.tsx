"use client"

/**
 * Selector de restaurante para abrir una sesión de soporte (P14).
 *
 * Toda la impersonación pasa por aquí, así que la UI tiene que ser explícita en
 * dos cosas: (1) qué restaurante se está operando ahora mismo, para que nadie
 * entre dos veces sin notarlo, y (2) qué nivel real tiene ese restaurante, para
 * que el admin sepa de antemano qué va a poder hacer adentro — mientras dura la
 * sesión la exención de admin está apagada a propósito.
 *
 * El texto va hardcodeado en español: es la regla de la superficie `/admin`
 * (a diferencia del panel del restaurante, que pasa por `t()`).
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, ExternalLink, RefreshCw, Search, ShieldCheck, Store } from "lucide-react"
import { startOperatingAs, type OperatingErrorCode } from "@/app/panel/foodos/operating-actions"
import type { CashbackTier } from "@/types"

export interface OperatingPickerRow {
  id: string
  name: string
  slug: string
  status: string
  tier: CashbackTier
  ownerEmail: string | null
}

const TIER_TONE: Record<CashbackTier, string> = {
  Verde: "bg-gray-100 text-gray-700",
  Plata: "bg-slate-200 text-slate-800",
  Oro: "bg-amber-100 text-amber-800",
  Diamante: "bg-sky-100 text-sky-800",
}

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  draft: "Borrador",
  paused: "En pausa",
}

const START_ERROR: Record<OperatingErrorCode, string> = {
  noAccess: "Tu cuenta ya no tiene permisos de administrador.",
  notFound: "Ese restaurante ya no existe. Recarga la lista.",
  invalid: "El restaurante no es válido.",
  error: "No pudimos abrir la sesión de soporte. Intenta de nuevo.",
}

export function OperatingPicker({
  rows,
  error,
  ownRestaurantId,
  operatingRestaurantId,
}: {
  rows: OperatingPickerRow[]
  /** Fallo al cargar la lista; se muestra en vez de un estado vacío mentiroso. */
  error: string | null
  ownRestaurantId: string | null
  operatingRestaurantId: string | null
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  // Qué fila está abriendo sesión y cuál falló: `useTransition` daría un estado
  // de "pendiente" compartido y todas las filas se anunciarían a la vez.
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [failedId, setFailedId] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q)
    )
  }, [rows, query])

  const operatingRow = rows.find((r) => r.id === operatingRestaurantId) ?? null

  async function start(id: string) {
    setFailedId(null)
    setFailure(null)
    setPendingId(id)
    try {
      const result = await startOperatingAs(id)
      if (!result.ok) {
        setFailedId(id)
        setFailure(START_ERROR[result.code] ?? START_ERROR.error)
        return
      }
      // Al tablero: es donde el admin comprueba de un vistazo qué restaurante
      // está viendo, y ahí ya aparece la franja de la sesión.
      router.push("/panel/foodos/tablero")
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-[#0E7A0E]" aria-hidden="true" />
          Operar como restaurante
        </h1>
        <p className="text-sm text-gray-600 max-w-3xl">
          Abre las herramientas del panel con los datos de otro restaurante para dar soporte.
          Mientras dure la sesión ves el <strong>nivel real</strong> de ese restaurante (no el
          tuyo) y cada acción que hagas queda registrada en la bitácora con tu cuenta.
        </p>
      </header>

      {operatingRow && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm font-semibold text-amber-900">
            Sesión de soporte abierta: {operatingRow.name}
          </span>
          <Link
            href="/panel/foodos/tablero"
            className="text-sm font-medium text-amber-900 underline hover:no-underline"
          >
            Ir al panel
          </Link>
          <span className="text-sm text-amber-800">
            Para cerrarla, usa el botón <strong>Salir</strong> de la franja superior del panel.
          </span>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="operating-search" className="sr-only">
            Buscar restaurante
          </label>
          <div className="relative flex-1 min-w-[220px]">
            <Search
              className="w-4 h-4 text-gray-600 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              id="operating-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre o dirección del menú"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30"
            />
          </div>
          <span className="text-sm text-gray-500">
            {filtered.length} de {rows.length}
          </span>
        </div>

        {error && (
          <p className="text-sm font-medium text-red-700" role="alert">
            {error}
          </p>
        )}

        {!error && rows.length === 0 && (
          <p className="text-sm text-gray-500 py-6 text-center">
            Todavía no hay restaurantes en la plataforma.
          </p>
        )}

        {!error && rows.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-gray-500 py-6 text-center">
            No encontramos restaurantes con ese texto.
          </p>
        )}

        {filtered.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {filtered.map((row) => {
              const isOwn = row.id === ownRestaurantId
              const isOperating = row.id === operatingRestaurantId
              return (
                <li
                  key={row.id}
                  className="py-3 flex flex-wrap items-center gap-x-3 gap-y-2"
                >
                  <Store className="w-4 h-4 text-gray-600 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{row.name}</span>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-xs font-medium ${TIER_TONE[row.tier]}`}
                      >
                        {row.tier}
                      </span>
                      <span className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-600 text-xs">
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                      {isOwn && (
                        <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-medium">
                          Tu restaurante
                        </span>
                      )}
                      {isOperating && (
                        <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800 text-xs font-medium">
                          Operando aquí
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate">
                      /r/{row.slug}
                      {row.ownerEmail ? ` · ${row.ownerEmail}` : ""}
                    </p>
                  </div>

                  <Link
                    href={`/r/${row.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-600 hover:bg-gray-100"
                  >
                    Ver menú
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </Link>

                  {isOwn ? (
                    <span className="shrink-0 text-xs text-gray-600 px-3 py-1.5">
                      No necesitas soporte aquí
                    </span>
                  ) : isOperating ? (
                    <span className="shrink-0 text-xs font-medium text-amber-800 px-3 py-1.5">
                      Sesión abierta
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => start(row.id)}
                      disabled={pendingId !== null}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-medium hover:bg-[#0A5F0A] disabled:opacity-60 transition-colors motion-reduce:transition-none"
                    >
                      {pendingId === row.id ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" />
                          Abriendo…
                        </>
                      ) : (
                        <>
                          Operar aquí
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </>
                      )}
                    </button>
                  )}

                  {failedId === row.id && failure && (
                    <p className="basis-full text-sm font-medium text-red-700" role="alert">
                      {failure}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
