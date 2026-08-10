"use client"

import { useEffect, useState } from "react"

/**
 * Página de diagnóstico visible para el misterio "no veo los order bumps logueado".
 *
 * El usuario solo navega a /diagnostico-bumps y lee el resultado EN PANTALLA
 * (sin necesidad de abrir la consola). Muestra:
 *   1. Si window.__resurteBumpsDebug existe (sonda eager del bundle nuevo).
 *   2. El carrito real de localStorage de ESTE origen.
 *   3. La respuesta real de POST /api/cart/bumps para ese carrito.
 *   4. Conclusión orientativa.
 */
export default function DiagnosticoBumpsPage() {
  const [report, setReport] = useState<string>("Cargando…")

  useEffect(() => {
    let cancelled = false

    async function run() {
      const raw = localStorage.getItem("resurte_cart")
      let cart: { cart?: { items?: { product_id?: number; quantity?: number; name?: string }[] } } | null = null
      try {
        cart = raw ? JSON.parse(raw) : null
      } catch {
        cart = null
      }

      const items = (cart?.cart?.items ?? []).map((i) => ({
        product_id: typeof i.product_id === "number" ? i.product_id : null,
        quantity: typeof i.quantity === "number" ? i.quantity : null,
        name: i.name ?? "(sin nombre)",
      }))

      const debugGlobal =
        typeof window.__resurteBumpsDebug !== "undefined"
          ? window.__resurteBumpsDebug
          : "NO EXISTE (bundle viejo o caché)"

      let apiResult: unknown = null
      let apiError: string | null = null
      try {
        const resp = await fetch("/api/cart/bumps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items
              .filter((i) => i.product_id !== null && i.quantity !== null)
              .map((i) => ({ product_id: i.product_id, quantity: i.quantity })),
          }),
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
        items,
        parsedBumps,
        apiError,
        raw,
      })

      if (!cancelled) {
        setReport(
          JSON.stringify(
            {
              url: window.location.href,
              origin: window.location.origin,
              ts: new Date().toISOString(),
              debugGlobal,
              carritoLocalStorage: {
                existe: !!raw,
                items,
                totalItems: items.length,
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
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold">Diagnóstico de order bumps</h1>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Esta página muestra el estado real de los bumps en <b>este navegador y este origen</b>.
        Copia el bloque de abajo y envíalo tal cual.
      </p>
      <div className="mb-4 rounded border border-[var(--border)] bg-[var(--surface)] p-3">
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
      <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded border border-[var(--border)] bg-black/90 p-4 text-xs text-green-300">
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
  items: { product_id: number | null; quantity: number | null; name: string }[]
  parsedBumps: unknown
  apiError: string | null
  raw: string | null
}): string {
  const { debugGlobal, items, parsedBumps, apiError, raw } = args

  if (!raw) {
    return "No hay carrito guardado en este origen (localStorage.resurte_cart vacío). Los bumps solo se muestran con items en el carrito. Si crees tener items, quizá estás en otro origen (www vs sin www)."
  }
  if (items.length === 0) {
    return "El carrito guardado está VACÍO. Los bumps no se muestran sin items. Agrega productos al carrito y recarga esta página."
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
    return `La API devuelve ${parsedBumps.bumpCount} bumps. Si NO los ves en el carrito, el problema es de montaje/UI (BumpCards no se está mostrando). Si SÍ los ves, ¡ya quedó!`
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
