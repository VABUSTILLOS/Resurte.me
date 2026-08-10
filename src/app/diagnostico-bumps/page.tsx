"use client"

import { useEffect, useState } from "react"
import { useCart } from "@/contexts/cart-context"
import { createClient } from "@/lib/supabase/client"

/**
 * Página de diagnóstico visible para el misterio "no veo los order bumps logueado".
 *
 * El usuario solo navega a /diagnostico-bumps y LEE EL VEREDICTO EN PANTALLA
 * (sin necesidad de abrir la consola ni copiar JSON). Muestra en texto grande:
 *   1. ¿Estás logueado o no? (el dato clave del misterio).
 *   2. Qué items tiene TU carrito en este navegador/origen.
 *   3. Cuántos order bumps devuelve la API real para ese carrito.
 *   4. Conclusión clara en español.
 * Abajo se conserva el bloque JSON completo para quien quiera copiarlo.
 */

type Report = {
  url: string
  origin: string
  ts: string
  sesion: { logged: boolean; email?: string | null }
  debugGlobal: unknown
  carritoContextoReact: {
    isLoaded: boolean
    itemCount: number
    items: { product_id: number; quantity: number; name: string }[]
  }
  carritoLocalStorage: {
    existe: boolean
    items: { product_id: number | null; quantity: number | null; name: string }[]
  }
  api: { status: number; body: string } | null
  apiError: string | null
  bumpsParseados: unknown
  conclusion: string
}

export default function DiagnosticoBumpsPage() {
  const { cart: contextCart, itemCount, isLoaded } = useCart()
  const [report, setReport] = useState<Report | null>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      const raw = localStorage.getItem("resurte_cart")
      let stored: { cart?: { items?: { product_id?: number; quantity?: number; name?: string }[] } } | null = null
      try {
        stored = raw ? JSON.parse(raw) : null
      } catch {
        stored = null
      }

      const storedItems = (stored?.cart?.items ?? []).map((i) => ({
        product_id: typeof i.product_id === "number" ? i.product_id : null,
        quantity: typeof i.quantity === "number" ? i.quantity : null,
        name: i.name ?? "(sin nombre)",
      }))

      // Carrito real del contexto React (lo que se renderiza en el drawer)
      const contextItems = contextCart.items.map((i) => ({
        product_id: i.product_id,
        quantity: i.quantity,
        name: i.name,
      }))

      const debugGlobal =
        typeof window.__resurteBumpsDebug !== "undefined"
          ? window.__resurteBumpsDebug
          : "NO EXISTE (bundle viejo o caché)"

      // ¿Hay sesión activa?
      let sesion: { logged: boolean; email?: string | null } = { logged: false }
      try {
        const sb = createClient()
        if (sb) {
          const { data } = await sb.auth.getSession()
          sesion = {
            logged: !!data.session,
            email: data.session?.user?.email ?? null,
          }
        }
      } catch {
        sesion = { logged: false, email: null }
      }

      // Llamar a la API con el carrito del CONTEXTO (lo que el usuario ve)
      const apiItems = contextItems
        .filter((i) => i.product_id !== null && i.quantity !== null)
        .map((i) => ({ product_id: i.product_id, quantity: i.quantity }))

      let apiResult: { status: number; body: string } | null = null
      let apiError: string | null = null
      try {
        const resp = await fetch("/api/cart/bumps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: apiItems }),
        })
        apiResult = { status: resp.status, body: await resp.text() }
      } catch (err) {
        apiError = err instanceof Error ? err.message : String(err)
      }

      const parsedBumps = apiResult ? tryParseBumps(apiResult.body) : null

      const conclusion = buildConclusion({
        debugGlobal,
        contextItems,
        storedItems,
        parsedBumps,
        apiError,
        isLoaded,
        sesion,
      })

      if (!cancelled) {
        setReport({
          url: window.location.href,
          origin: window.location.origin,
          ts: new Date().toISOString(),
          sesion,
          debugGlobal,
          carritoContextoReact: {
            isLoaded,
            itemCount,
            items: contextItems,
          },
          carritoLocalStorage: {
            existe: !!raw,
            items: storedItems,
          },
          api: apiResult,
          apiError,
          bumpsParseados: parsedBumps,
          conclusion,
        })
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [contextCart, itemCount, isLoaded])

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">🧪 Diagnóstico de order bumps</h1>
      <p className="mb-5 text-sm text-[var(--text-secondary)]">
        Lee el <b>veredicto</b> de abajo. Si algo falla, el botón «Copiar» te deja enviarme el
        reporte completo al chat.
      </p>

      {!report ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
          Analizando tu carrito y sesión…
        </div>
      ) : (
        <div className="space-y-5">
          {/* ===== VEREDICTO GRANDE ===== */}
          <Verdict report={report} />

          {/* ===== JSON técnico ===== */}
          <details className="rounded-xl border border-gray-200 bg-gray-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">
              📄 Ver reporte técnico completo (para el chat)
            </summary>
            <div className="px-4 pb-4">
              <div className="mb-3">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(JSON.stringify(report, null, 2)).catch(() => {})
                    alert("¡Copiado al portapapeles! Pégalo en el chat.")
                  }}
                  className="rounded bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803d]"
                >
                  📋 Copiar reporte al chat
                </button>
              </div>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded border border-gray-700 bg-gray-950 p-4 text-xs text-green-300">
                {JSON.stringify(report, null, 2)}
              </pre>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}

/** Panel de veredicto visual: qué está pasando y qué hacer. */
function Verdict({ report }: { report: Report }) {
  const { sesion, carritoContextoReact: ctx, bumpsParseados, apiError, conclusion } = report

  // Estado de la sesión
  const sesionBadge = sesion.logged ? (
    <span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-4 py-1.5 text-sm font-bold text-green-800">
      ✅ SÍ estás logueado{sesion.email ? ` como ${sesion.email}` : ""}
    </span>
  ) : (
    <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-bold text-amber-800">
      ⚠️ NO estás logueado en este navegador
    </span>
  )

  const bumpCount =
    bumpsParseados &&
    typeof bumpsParseados === "object" &&
    "bumpCount" in bumpsParseados &&
    typeof bumpsParseados.bumpCount === "number"
      ? bumpsParseados.bumpCount
      : null

  const bumpList = (bumpsParseados as { bumps?: { name?: string; price?: number }[] } | null)?.bumps

  // Semáforo final
  let verdictColor = "border-gray-200 bg-gray-50 text-gray-700"
  let verdictTitle = "Resultado"
  if (apiError) {
    verdictColor = "border-red-300 bg-red-50 text-red-800"
    verdictTitle = "❌ Falló la llamada al servidor"
  } else if (bumpCount !== null && bumpCount > 0) {
    verdictColor = "border-green-300 bg-green-50 text-green-900"
    verdictTitle = "✅ El servidor SÍ está devolviendo bumps"
  } else if (bumpCount === 0) {
    verdictColor = "border-amber-300 bg-amber-50 text-amber-900"
    verdictTitle = "⚠️ El servidor devuelve 0 bumps para este carrito"
  } else {
    verdictColor = "border-gray-300 bg-gray-100 text-gray-700"
    verdictTitle = "Sin datos del servidor todavía"
  }

  return (
    <div className="space-y-4">
      {/* Bloque 1: sesión */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          Tu estado
        </h2>
        <div className="flex flex-wrap items-center gap-3">{sesionBadge}</div>
        <p className="mt-3 text-sm text-gray-700">
          Origin: <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{report.origin}</code>{" "}
          — este navegador guarda su carrito separado del otro (con/sin www).
        </p>
      </div>

      {/* Bloque 2: carrito */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          Tu carrito aquí
        </h2>
        {ctx.items.length === 0 ? (
          <p className="text-sm text-gray-500">
            Está <b>vacío</b> en este navegador. Los order bumps solo aparecen cuando el carrito
            tiene productos.
          </p>
        ) : (
          <>
            <p className="mb-2 text-sm text-gray-700">
              <b>{ctx.items.length}</b> {ctx.items.length === 1 ? "producto" : "productos"}:
            </p>
            <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
              {ctx.items.map((i, idx) => (
                <li key={idx}>
                  {i.name} ×{i.quantity}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Bloque 3: resultado del servidor */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--text-secondary)]">
          Qué responde el servidor
        </h2>
        {apiError ? (
          <p className="text-sm font-semibold text-red-700">Error: {apiError}</p>
        ) : bumpCount === null ? (
          <p className="text-sm text-gray-500">Esperando respuesta…</p>
        ) : bumpCount > 0 ? (
          <>
            <p className="mb-2 text-sm font-semibold text-green-700">
              🎉 Devuelve {bumpCount} order bumps para este carrito.
            </p>
            {bumpList && (
              <ul className="list-inside list-disc space-y-1 text-sm text-gray-700">
                {bumpList.map((b, idx) => (
                  <li key={idx}>
                    {b.name ?? "(sin nombre)"} — ${b.price ?? "?"}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm font-semibold text-amber-700">
            0 bumps. Ningún producto de tu carrito dispara una regla de venta cruzada.
          </p>
        )}
      </div>

      {/* Bloque 4: veredicto final */}
      <div className={`rounded-xl border-2 p-5 ${verdictColor}`}>
        <h2 className="mb-2 text-base font-bold">{verdictTitle}</h2>
        <p className="text-sm leading-relaxed">{conclusion}</p>
        {!sesion.logged && (
          <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-sm font-medium">
            💡 Para probar el caso «logueado»: inicia sesión y vuelve a abrir esta página. El
            veredicto de arriba mostrará si el problema está en tu sesión o en los productos del
            carrito.
          </p>
        )}
      </div>
    </div>
  )
}

function tryParseBumps(rawBody: string): unknown {
  try {
    const parsed = JSON.parse(rawBody)
    return {
      bumpCount: Array.isArray(parsed?.bumps) ? parsed.bumps.length : "n/a",
      bumps: parsed?.bumps?.map((b: Record<string, unknown>) => ({
        id: b.id,
        name: b.name,
        price: b.price,
        ruleId: b.ruleId,
        trigger_type: b.trigger_type,
      })),
      raw: parsed,
    }
  } catch {
    return "no se pudo parsear (¿no es JSON?)"
  }
}

function buildConclusion(args: {
  debugGlobal: unknown
  contextItems: { product_id: number; quantity: number; name: string }[]
  storedItems: { product_id: number | null; quantity: number | null; name: string }[]
  parsedBumps: unknown
  apiError: string | null
  isLoaded: boolean
  sesion: { logged: boolean; email?: string | null }
}): string {
  const { debugGlobal, contextItems, storedItems, parsedBumps, apiError, isLoaded, sesion } = args

  if (contextItems.length > 0 && storedItems.length === 0 && isLoaded) {
    return `⚠️ BUG DETECTADO: el carrito del CONTEXTO React tiene ${contextItems.length} items (los ves en el drawer), pero localStorage.resurte_cart está VACÍO. Esto significa que los items no se están persistiendo (o se guardan bajo otra clave/origen). Los bumps se calculan con esos items, así que sí deberían verse — si no los ves, el problema es de montaje de BumpCards, no de datos.`
  }
  if (contextItems.length === 0 && storedItems.length > 0) {
    return "El localStorage tiene items pero el contexto React no los cargó (¿isLoaded=false o hidratación incompleta?). Esto explicaría que no veas el carrito ni los bumps al recargar."
  }
  if (contextItems.length > 0 && storedItems.length > 0 && contextItems.length !== storedItems.length) {
    return `El contexto tiene ${contextItems.length} items y localStorage ${storedItems.length} (difieren). La API se llamó con el carrito del contexto (${contextItems.length}). Si no ves bumps con ${contextItems.length} items, el problema es de reglas o de montaje.`
  }
  if (contextItems.length === 0 && storedItems.length === 0) {
    const origin = typeof window !== "undefined" ? window.location.origin : ""
    return `No hay items en el carrito en ESTE origen (${origin}). Los bumps solo se muestran con items. Si ves tu carrito lleno en la tienda, es porque estás en el OTRO origen: ${
      origin.includes("www.")
        ? "https://resurte.me/diagnostico-bumps"
        : "https://www.resurte.me/diagnostico-bumps"
    } (www y sin-www usan localStorage SEPARADO). ${sesion.logged ? "Estás logueado." : "No estás logueado."}`
  }
  if (typeof debugGlobal === "string" && debugGlobal === "NO EXISTE (bundle viejo o caché)") {
    return "El navegador NO está cargando el bundle nuevo (no existe window.__resurteBumpsDebug). Haz recarga forzada: Cmd+Shift+R (Mac) o Ctrl+Shift+R (Windows), o abre en ventana de incógnito."
  }
  if (apiError) {
    return `La llamada a /api/cart/bumps FALLÓ: ${apiError}. Revisa red/consola.`
  }
  if (
    parsedBumps &&
    typeof parsedBumps === "object" &&
    "bumpCount" in parsedBumps &&
    typeof parsedBumps.bumpCount === "number" &&
    parsedBumps.bumpCount > 0
  ) {
    return `El servidor devuelve ${parsedBumps.bumpCount} bumps para tu carrito del contexto (${contextItems.length} items). Si NO los ves en el carrito, el problema es de montaje/UI (BumpCards no se está mostrando). Si SÍ los ves, ¡ya quedó!`
  }
  if (
    parsedBumps &&
    typeof parsedBumps === "object" &&
    "bumpCount" in parsedBumps &&
    typeof parsedBumps.bumpCount === "number" &&
    parsedBumps.bumpCount === 0
  ) {
    return "La API responde pero con 0 bumps para este carrito (reglas de negocio no aplican, o productos sin regla). Coméntame los items de tu carrito."
  }
  return "No se pudo determinar. Envía el bloque completo al chat."
}
