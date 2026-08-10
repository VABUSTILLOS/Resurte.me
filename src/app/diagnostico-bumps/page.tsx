"use client"

import { useEffect, useState } from "react"
import { useCart } from "@/contexts/cart-context"
import { createClient } from "@/lib/supabase/client"

/**
 * Página de diagnóstico visible para el misterio "no veo los order bumps logueado".
 *
 * El usuario solo navega a /diagnostico-bumps y lee el resultado EN PANTALLA
 * (sin necesidad de abrir la consola). Muestra:
 *   1. Si window.__resurteBumpsDebug existe (sonda eager del bundle nuevo).
 *   2. El carrito real del CONTEXTO React (lo que el usuario ve en el drawer).
 *   3. El carrito crudo de localStorage de ESTE origen.
 *   4. Si hay sesión activa.
 *   5. La respuesta real de POST /api/cart/bumps para el carrito del contexto.
 *   6. Conclusión orientativa.
 */
export default function DiagnosticoBumpsPage() {
  const { cart: contextCart, itemCount, isLoaded } = useCart()
  const [report, setReport] = useState<string>("Cargando…")

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

      let apiResult: unknown = null
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

      const parsedBumps =
        apiResult && typeof apiResult === "object" && "body" in apiResult
          ? tryParseBumps(apiResult.body as string)
          : null

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
        setReport(
          JSON.stringify(
            {
              url: window.location.href,
              origin: window.location.origin,
              ts: new Date().toISOString(),
              sesion,
              debugGlobal,
              carritoContextoReact: {
                isLoaded,
                itemCount,
                items: contextItems,
                totalItems: contextItems.length,
              },
              carritoLocalStorage: {
                existe: !!raw,
                items: storedItems,
                totalItems: storedItems.length,
              },
              api: apiResult,
              apiError,
              bumpsParseados: parsedBumps,
              conclusion,
            },
            null,
            2
          )
        )
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [contextCart, itemCount, isLoaded])

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold">Diagnóstico de order bumps</h1>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Esta página muestra el estado real de los bumps en <b>este navegador y este origen</b>.
        Copia el bloque de abajo y envíalo tal cual.
      </p>
      <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-3">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(report).catch(() => {})
            alert("¡Copiado al portapapeles!")
          }}
          className="rounded bg-[#16a34a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#15803d]"
        >
          📋 Copiar diagnóstico
        </button>
        <span className="ml-2 text-xs text-[var(--text-secondary)]">
          Clic en el botón y pégalo en el chat.
        </span>
      </div>
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded border border-gray-700 bg-gray-950 p-4 text-xs text-green-300">
        {report}
      </pre>
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
    return `La API devuelve ${parsedBumps.bumpCount} bumps para tu carrito del contexto (${contextItems.length} items). Si NO los ves en el carrito, el problema es de montaje/UI (BumpCards no se está mostrando). Si SÍ los ves, ¡ya quedó!`
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
