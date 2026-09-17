"use client"

import { useMemo, useState } from "react"
import { Calculator, TriangleAlert } from "lucide-react"
import { formatMoney } from "@/lib/money"
import { computeRoi, ROI_DEFAULTS, ROI_LIMITS } from "@/lib/roi-calculator"

/**
 * Calculadora de comisiones para la landing B2B.
 *
 * Todo el cálculo vive en `@/lib/roi-calculator` (puro y testeado); aquí solo
 * hay estado de formulario y presentación. El resultado se recalcula en vivo
 * con `useMemo` — no hay red, no hay promesa, no hay "calculando".
 *
 * Dos cosas que esta calculadora NO hace, a propósito:
 *  - no modela la comisión de procesamiento de pago (se paga en los dos
 *    caminos, así que incluirla solo inflaría la cifra);
 *  - no promete un nivel de FoodOS: el nivel se gana comprando en el
 *    marketplace, no vendiendo.
 */

type FieldKey = keyof typeof ROI_DEFAULTS

interface FieldSpec {
  key: FieldKey
  label: string
  hint: string
  /** Sufijo visible en el input. */
  suffix: string
  step: number
  /** true = el valor se captura en porcentaje (0..100) y el núcleo usa fracción. */
  percent?: boolean
}

const FIELDS: FieldSpec[] = [
  {
    key: "monthlyOrders",
    label: "Pedidos por mes",
    hint: "Todos los canales, no solo la app de delivery.",
    suffix: "pedidos",
    step: 10,
  },
  {
    key: "averageTicket",
    label: "Ticket promedio",
    hint: "Cuánto gasta un cliente en un pedido.",
    suffix: "MXN",
    step: 10,
  },
  {
    key: "commissionPct",
    label: "Comisión de la app",
    hint: "Lo que se queda la app de delivery de cada pedido.",
    suffix: "%",
    step: 1,
  },
  {
    key: "deliveryCostPerOrder",
    label: "Costo de tu propio reparto",
    hint: "Lo que te cuesta repartir un pedido con tus medios.",
    suffix: "MXN",
    step: 5,
  },
  {
    key: "ownDeliveryShare",
    label: "Pedidos a domicilio",
    hint: "La fracción que necesita reparto. El resto es para llevar o en mesa.",
    suffix: "%",
    step: 5,
    percent: true,
  },
]

export function RoiCalculator() {
  const [values, setValues] = useState<Record<FieldKey, number>>({ ...ROI_DEFAULTS })

  const result = useMemo(
    () =>
      computeRoi({
        monthlyOrders: values.monthlyOrders,
        averageTicket: values.averageTicket,
        commissionPct: values.commissionPct,
        deliveryCostPerOrder: values.deliveryCostPerOrder,
        ownDeliveryShare: values.ownDeliveryShare / 100,
      }),
    [values]
  )

  function setField(key: FieldKey, raw: string) {
    const parsed = Number(raw)
    setValues((prev) => ({ ...prev, [key]: Number.isFinite(parsed) ? parsed : 0 }))
  }

  const hasSavings = result.savingsMonthly > 0

  return (
    <div className="rounded-[20px] border border-[#0E7A0E]/20 bg-white shadow-[0_2px_24px_rgba(14,122,14,0.06)] overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[#0E7A0E]/10 bg-[#F0F7F0] px-5 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0E7A0E]">
          <Calculator className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-bold text-[#242529]">
            ¿Cuánto le regalas a la app de delivery?
          </h3>
          <p className="text-xs text-[#5C6068]">
            Mueve los números de tu restaurante. Se calcula aquí mismo, en tu
            navegador.
          </p>
        </div>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-2 lg:gap-8">
        {/* Entradas */}
        <div className="space-y-4">
          {FIELDS.map((field) => {
            const limits = ROI_LIMITS[field.key]
            const max = field.percent ? 100 : limits.max
            return (
              <div key={field.key}>
                <label
                  htmlFor={`roi-${field.key}`}
                  className="flex items-baseline justify-between gap-3 text-sm font-semibold text-[#242529]"
                >
                  <span>{field.label}</span>
                  <span className="font-mono text-xs text-[#5C6068]">
                    {field.percent ? `${values[field.key]}%` : formatMoney(values[field.key])}
                  </span>
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id={`roi-${field.key}`}
                    type="number"
                    inputMode="numeric"
                    min={field.percent ? 0 : limits.min}
                    max={max}
                    step={field.step}
                    value={values[field.key]}
                    onChange={(event) => setField(field.key, event.target.value)}
                    className="touch-target w-full rounded-xl border border-[#E4E1DA] bg-[#FDFCFA] px-3 text-base text-[#242529] focus:border-[#0E7A0E] focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/20"
                  />
                  <span className="w-16 shrink-0 text-xs font-medium text-[#5C6068]">
                    {field.suffix}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[#8A8F98]">{field.hint}</p>
              </div>
            )
          })}
        </div>

        {/* Resultado */}
        <div className="space-y-3 lg:border-l lg:border-[#E4E1DA] lg:pl-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5C6068]">
              Comisión que pagas al año
            </p>
            <p className="text-3xl font-bold text-[#B42318] sm:text-4xl">
              {formatMoney(result.commissionYearly)}
            </p>
            <p className="mt-1 text-xs text-[#5C6068]">
              {formatMoney(result.commissionMonthly)} al mes ·{" "}
              {formatMoney(result.commissionPerOrder)} por pedido
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 rounded-xl bg-[#F7F5F0] p-3 text-sm">
            <div>
              <dt className="text-xs text-[#5C6068]">Ventas por mes</dt>
              <dd className="font-semibold text-[#242529]">{formatMoney(result.gmvMonthly)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#5C6068]">Reparto propio</dt>
              <dd className="font-semibold text-[#242529]">
                {formatMoney(result.ownDeliveryMonthly)}
              </dd>
            </div>
          </dl>

          <div
            className={
              hasSavings
                ? "rounded-xl border border-[#0E7A0E]/25 bg-[#F0F7F0] p-4"
                : "rounded-xl border border-[#E4E1DA] bg-[#F7F5F0] p-4"
            }
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-[#5C6068]">
              {hasSavings ? "Lo que te quedarías" : "Balance mensual"}
            </p>
            <p
              className={
                hasSavings
                  ? "text-2xl font-bold text-[#0E7A0E]"
                  : "text-2xl font-bold text-[#242529]"
              }
            >
              {formatMoney(result.savingsMonthly)}
            </p>
            <p className="mt-1 text-xs text-[#5C6068]">
              {hasSavings
                ? `${formatMoney(result.savingsYearly)} al año · ${result.savingsPctOfGmv.toFixed(1)}% de tus ventas`
                : "Con estos números, tu reparto propio cuesta más que la comisión."}
            </p>
          </div>

          {result.warnings.length > 0 && (
            <ul aria-live="polite" className="space-y-2">
              {result.warnings.map((warning) => (
                <li
                  key={warning}
                  className="flex gap-2 rounded-xl border border-[#F0C36D] bg-[#FEF7E6] p-3 text-xs text-[#7A4E00]"
                >
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
