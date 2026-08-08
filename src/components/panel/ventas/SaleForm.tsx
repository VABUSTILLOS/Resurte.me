"use client"

import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import { todayStr } from "@/lib/panel-utils"
import { SharedDish } from "@/hooks/use-local-storage"
import {
  Cliente,
  Mesa,
  SaleEntry,
  SaleChannel,
  SALE_CHANNELS,
  PaymentMethod,
  PAYMENT_METHODS,
} from "./ventas-shared"

export interface SaleFormData {
  dishId: string
  qty: number
  date: string
  channel: SaleChannel
  payment: PaymentMethod
  mesaId?: string
  discountType: "monto" | "porcentaje"
  discountValue: string
  giftCode?: string
  mods: string[]
  clienteId?: string
  redeemPts: string
}

type ToastFn = (message: string, type?: "success" | "error" | "warning") => void

interface SaleFormProps {
  sharedDishes: SharedDish[]
  entries: SaleEntry[]
  clientes: Cliente[]
  mesas: Mesa[]
  puntosTasa: number
  puntosCanje: number
  deductStock: boolean
  dishCost: (id: string) => number
  dishPrice: (id: string) => number
  onToggleDeductStock: (value: boolean) => void
  onAdd: (data: SaleFormData) => void
  onEscape: () => void
  toast: ToastFn
}

export default function SaleForm({
  sharedDishes,
  entries,
  clientes,
  mesas,
  puntosTasa,
  puntosCanje,
  deductStock,
  dishCost,
  dishPrice,
  onToggleDeductStock,
  onAdd,
  onEscape,
  toast,
}: SaleFormProps) {
  const [formDishId, setFormDishId] = useState("")
  const [formQty, setFormQty] = useState("1")
  const [formDate, setFormDate] = useState(todayStr())
  const [formPayment, setFormPayment] = useState<PaymentMethod>("efectivo")
  const [formChannel, setFormChannel] = useState<SaleChannel>("comedor")
  const [formDiscountType, setFormDiscountType] = useState<"monto" | "porcentaje">("monto")
  const [formDiscountValue, setFormDiscountValue] = useState("")
  const [formClienteId, setFormClienteId] = useState("")
  const [formRedeemPts, setFormRedeemPts] = useState("")
  const [formMods, setFormMods] = useState<string[]>([])
  const [formMesaId, setFormMesaId] = useState("")
  const [formGiftCode, setFormGiftCode] = useState("")

  // Keyboard: Ctrl+N new sale, Escape closes confirm
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault()
        if (sharedDishes.length === 0) {
          toast("Primero costea tu menú para registrar una venta", "warning")
          return
        }
        setFormDishId(sharedDishes[0]?.id || "")
        setFormQty("1")
        setFormDate(todayStr())
        document.getElementById("venta-dish")?.focus()
      }
      if (e.key === "Escape") onEscape()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [sharedDishes, onEscape, toast])

  const freeMesasForForm = (() => {
    const used = new Set(entries.filter((e) => e.date === formDate && e.mesaId).map((e) => e.mesaId))
    return mesas.filter((m) => !used.has(m.id) || m.id === formMesaId)
  })()

  const submit = () => {
    onAdd({
      dishId: formDishId,
      qty: parseInt(formQty) || 0,
      date: formDate,
      channel: formChannel,
      payment: formPayment,
      mesaId: formMesaId || undefined,
      discountType: formDiscountType,
      discountValue: formDiscountValue,
      giftCode: formGiftCode || undefined,
      mods: formMods,
      clienteId: formClienteId || undefined,
      redeemPts: formRedeemPts,
    })
    setFormRedeemPts("")
    setFormMods([])
    setFormDiscountValue("")
    setFormMesaId("")
    setFormGiftCode("")
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Plus className="w-4 h-4 text-[#108910]" />
        <h3 className="font-semibold text-gray-900 text-sm">Registrar venta</h3>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Platillo</label>
          <select
            id="venta-dish"
            value={formDishId}
            onChange={(e) => setFormDishId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#108910]"
          >
            <option value="">Seleccionar platillo…</option>
            {sharedDishes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} — ${d.sellingPrice.toFixed(0)} · costo ${dishCost(d.id).toFixed(0)}
              </option>
            ))}
          </select>
        </div>
        <div className="w-24">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Cantidad</label>
          <input
            type="number"
            value={formQty}
            onChange={(e) => setFormQty(e.target.value)}
            min="1"
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
          />
        </div>
        <div className="w-40">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Fecha</label>
          <input
            type="date"
            value={formDate}
            onChange={(e) => setFormDate(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#108910]"
          />
        </div>
        <div className="w-36">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Canal</label>
          <select
            value={formChannel}
            onChange={(e) => setFormChannel(e.target.value as SaleChannel)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#108910]"
            aria-label="Canal de venta"
          >
            {SALE_CHANNELS.map((c) => (
              <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
            ))}
          </select>
        </div>
        <div className="w-40">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Pago</label>
          <select
            value={formPayment}
            onChange={(e) => setFormPayment(e.target.value as PaymentMethod)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#108910]"
            aria-label="Método de pago"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.key} value={m.key}>{m.icon} {m.label}</option>
            ))}
          </select>
        </div>
        {mesas.length > 0 && (
          <div className="w-32">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Mesa</label>
            <select
              value={formMesaId}
              onChange={(e) => setFormMesaId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#108910]"
              aria-label="Mesa del salón"
            >
              <option value="">Sin mesa</option>
              {freeMesasForForm.map((m) => (
                <option key={m.id} value={m.id}>🪑 {m.nombre}</option>
              ))}
            </select>
          </div>
        )}
        <div className="w-28">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Descuento</label>
          <select
            value={formDiscountType}
            onChange={(e) => setFormDiscountType(e.target.value as "monto" | "porcentaje")}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#108910]"
            aria-label="Tipo de descuento"
          >
            <option value="monto">$ Monto</option>
            <option value="porcentaje">%</option>
          </select>
        </div>
        <div className="w-24">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Valor</label>
          <input
            type="number"
            value={formDiscountValue}
            onChange={(e) => setFormDiscountValue(e.target.value)}
            min="0"
            placeholder="0"
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
            aria-label="Valor del descuento"
          />
        </div>
        <button
          onClick={submit}
          disabled={!formDishId}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#108910] text-white text-sm font-semibold rounded-xl hover:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
          Registrar
        </button>
      </div>
      {formPayment === "regalo" && (
        <div className="mt-3">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Código de tarjeta de regalo</label>
          <input
            type="text"
            value={formGiftCode}
            onChange={(e) => setFormGiftCode(e.target.value.toUpperCase())}
            placeholder="RT-XXXX-XXXX"
            className="w-full max-w-xs px-3 py-2 rounded-xl border border-gray-200 text-sm uppercase focus:outline-none focus:border-[#108910]"
            aria-label="Código de tarjeta de regalo"
          />
          <p className="text-[10px] text-gray-400 mt-1">El saldo de la tarjeta debe cubrir el total de la venta.</p>
        </div>
      )}
      {formDishId && (() => {
        const dish = sharedDishes.find((d) => d.id === formDishId)
        const mods = dish?.modificadores || []
        const activeMods = mods.filter((m) => formMods.includes(m.id))
        const modTotal = activeMods.reduce((s, m) => s + m.precio, 0)
        const subtotal = (parseInt(formQty) || 1) * (dishPrice(formDishId) + modTotal)
        const redeemPts = formRedeemPts ? Math.max(0, parseInt(formRedeemPts) || 0) : 0
        const redeemValue = formClienteId && redeemPts > 0 ? Math.min(redeemPts * puntosCanje, subtotal) : 0
        const discountValue = Math.max(0, parseFloat(formDiscountValue) || 0)
        const total = redeemValue > 0 ? subtotal - redeemValue : formDiscountType === "porcentaje" ? subtotal * (1 - discountValue / 100) : subtotal - discountValue
        return (
          <>
            <p className="text-[10px] text-gray-400 mt-2">
              El precio y costo se toman del platillo costeado (
              <>
                subtotal ${subtotal.toFixed(0)}
                {modTotal > 0 && <span className="text-amber-600 font-semibold"> (modificadores +${modTotal.toFixed(0)})</span>}
                {(redeemValue > 0 || discountValue > 0) && <> → <span className="text-red-500 font-semibold">${Math.max(0, total).toFixed(0)}</span></>}
                {` · costo $${(dishCost(formDishId) * (parseInt(formQty) || 1)).toFixed(0)}`}
              </>
              ).
            </p>
            {mods.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {mods.map((m) => {
                  const active = formMods.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        setFormMods((prev) =>
                          active ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                        )
                      }
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                        active
                          ? "bg-[#108910] text-white border-[#108910]"
                          : "bg-gray-50 text-gray-600 border-gray-200 hover:border-[#108910]"
                      }`}
                      aria-pressed={active}
                    >
                      {active ? "✓ " : "+ "}{m.nombre} {m.precio > 0 ? `+$${m.precio.toFixed(0)}` : ""}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )
      })()}
      <div className="flex flex-wrap gap-3 mt-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Cliente frecuente</label>
          <select
            value={formClienteId}
            onChange={(e) => { setFormClienteId(e.target.value); setFormRedeemPts("") }}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:border-[#108910]"
            aria-label="Cliente frecuente"
          >
            <option value="">Sin cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre} · {c.puntos} pts</option>
            ))}
          </select>
        </div>
        {formClienteId && (
          <div className="w-36">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase mb-1">Redimir puntos</label>
            <input
              type="number"
              value={formRedeemPts}
              onChange={(e) => setFormRedeemPts(e.target.value)}
              min="0"
              placeholder={`Máx ${(() => clientes.find((c) => c.id === formClienteId)?.puntos || 0)()} pts`}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-center focus:outline-none focus:border-[#108910]"
              aria-label="Puntos a redimir"
            />
          </div>
        )}
        <div className="flex items-end text-[11px] text-gray-400 pb-2">
          <span>1 pt = ${puntosTasa.toFixed(0)} MXN · canje $1 = {puntosCanje.toFixed(0)} MXN</span>
        </div>
      </div>
      <label className="flex items-start gap-2 mt-3 text-[11px] text-gray-500 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={deductStock}
          onChange={(e) => onToggleDeductStock(e.target.checked)}
          className="mt-0.5 accent-[#108910]"
        />
        <span>
          <span className="font-semibold text-gray-700">Descontar insumos del inventario al vender</span>
          <span className="block text-[10px] text-gray-400">
            Al registrar, resta los ingredientes del platillo (kg) del stock y lo registra como salida en el inventario. Al eliminar una venta no se repone el stock.
          </span>
        </span>
      </label>
    </div>
  )
}
