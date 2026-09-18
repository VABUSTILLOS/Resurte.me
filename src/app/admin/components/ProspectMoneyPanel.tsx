"use client"

import { useEffect, useState } from "react"
import { Wallet } from "lucide-react"
import type { CrmProspectRow } from "@/lib/crm-core"
import { formatMoney } from "@/lib/money"
import {
  MONEY_GAP_LABEL,
  prospectMoneyView,
  type MoneyGapTone,
} from "@/lib/crm-money"
import { getAdminProspectClientOrders } from "../actions"

/** Ventas reales del cliente vinculado, o `null` si el prospecto no tiene cuenta. */
interface ClientOrders {
  revenue: number
  commission: number
  orders: Array<{ id: number; payment_status: string; status: string }>
}

const GAP_TONE_CLASS: Record<MoneyGapTone, string> = {
  gain: "text-green-700",
  loss: "text-red-700",
  even: "text-gray-900",
  unknown: "text-gray-500",
}

/**
 * Dinero del prospecto en la ficha del admin: previsto contra real.
 *
 * Se inyecta por `slots.extra`, así que recibe **solo la fila** del prospecto y
 * carga por su cuenta la mitad real. El previsto (`estimated_value`) ya viaja en
 * la fila; el real exige ir a `orders` por el cliente vinculado.
 *
 * La regla que gobierna el panel es que las tres cifras tienen estados distintos
 * de "cero":
 *
 *  - **previsto `null`** — nadie valoró el prospecto. Se dice, no se pinta `$0`.
 *  - **real `null`** — no hay cuenta vinculada (`user_id` nulo): no hay cliente
 *    con el que medir. Tampoco se pinta `$0`.
 *  - **real `0`** — hay cuenta y no ha pagado nada. Ese sí es un cero medido, y
 *    es justo el caso que el vendedor necesita ver.
 *
 * Por eso el panel **no llama** a la acción cuando `user_id` es nulo: una
 * llamada que devuelve `{revenue: 0}` por falta de vínculo es indistinguible de
 * una que devuelve `{revenue: 0}` por falta de pagos, y el panel decide el
 * vínculo leyendo la fila, que sí lo sabe con certeza.
 */
export function ProspectMoneyPanel({ prospect }: { prospect: CrmProspectRow }) {
  const linked = prospect.user_id !== null
  // `null` = todavía no hay respuesta. Un solo estado en vez de dos porque el
  // efecto solo puede escribir dentro de la promesa: llamar a `setState` en el
  // cuerpo del efecto provoca un render en cascada (y el lint lo rechaza).
  const [result, setResult] = useState<{ ok: boolean; data: ClientOrders | null } | null>(null)

  useEffect(() => {
    // Sin cuenta vinculada no se llama: un `{revenue: 0}` por falta de vínculo
    // es indistinguible de un `{revenue: 0}` por falta de pagos, y el vínculo lo
    // sabe la fila, no la consulta.
    if (!linked) return
    let cancelled = false
    void getAdminProspectClientOrders(prospect.id)
      .then((data) => {
        if (cancelled) return
        setResult({ ok: true, data })
      })
      .catch(() => {
        if (cancelled) return
        setResult({ ok: false, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [linked, prospect.id])

  const state: "idle" | "loading" | "done" | "error" = !linked
    ? "idle"
    : result === null
      ? "loading"
      : result.ok
        ? "done"
        : "error"

  // El vínculo se comprueba aquí y no solo en el efecto: si desaparece sin
  // cambiar de prospecto, lo que sobra son las cifras ya cargadas, y basta con
  // no darlas por medidas.
  const measured = linked && state === "done"
  const orders = measured ? result?.data : null

  const view = prospectMoneyView({
    estimatedValue: prospect.estimated_value,
    actualRevenue: orders?.revenue ?? null,
    actualCommission: orders?.commission ?? null,
    paidOrders: (orders?.orders ?? []).filter(
      (o) => o.payment_status === "paid" && o.status !== "cancelled"
    ).length,
  })

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
        <Wallet className="h-3.5 w-3.5" /> Dinero
      </h3>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-gray-200 bg-white p-2.5">
          <p className="text-[11px] text-gray-500">Previsto</p>
          <p
            className={`text-sm font-bold ${
              view.estimated === null ? "text-gray-500" : "text-gray-900"
            }`}
          >
            {view.estimated === null ? "—" : formatMoney(view.estimated)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-2.5">
          <p className="text-[11px] text-gray-500">Ventas pagadas</p>
          <p
            className={`text-sm font-bold ${view.actual === null ? "text-gray-500" : "text-gray-900"}`}
          >
            {state === "loading" || state === "error" || view.actual === null
              ? "—"
              : formatMoney(view.actual)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-2.5">
          <p className="text-[11px] text-gray-500">Diferencia</p>
          <p className={`text-sm font-bold ${GAP_TONE_CLASS[view.gapTone]}`}>
            {view.gap === null
              ? "—"
              : `${view.gap > 0 ? "+" : ""}${formatMoney(view.gap)}`}
          </p>
        </div>
      </div>

      <p className="mt-1.5 text-[11px] text-gray-500">
        {view.gapTone === "unknown"
          ? MONEY_GAP_LABEL.unknown
          : MONEY_GAP_LABEL[view.gapTone]}
        {view.comparable
          ? ` · ${view.paidOrders} pedido${view.paidOrders === 1 ? "" : "s"} pagado${
              view.paidOrders === 1 ? "" : "s"
            }`
          : ""}
      </p>

      {!linked && (
        <p className="mt-1.5 text-[11px] text-gray-500">
          {view.estimated === null
            ? "Sin valor declarado y sin cuenta vinculada: esta ficha todavía no tiene dinero que comparar."
            : "Sin cuenta vinculada: no hay cliente con el que medir ventas reales."}
        </p>
      )}
      {linked && state === "error" && (
        <p className="mt-1.5 text-[11px] text-red-700">
          No se pudieron cargar las ventas del cliente. El previsto sigue siendo válido; el
          real queda sin medir.
        </p>
      )}
    </section>
  )
}
