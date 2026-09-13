"use client"

import {
  ArrowLeft, ArrowRight, Banknote, Bike, CreditCard, Landmark, MapPin, MessageCircle,
  Minus, Plus, Sparkles, Store, Ticket, Trash2, UtensilsCrossed,
} from "lucide-react"
import { buildRecommendations, formatMoney, modifiersSummary, type OpenStatus } from "@/lib/foodos"
import type { FoodosBranch, FoodosOrderItem } from "@/types/foodos"

export function CheckoutView({
  branches,
  cart,
  totals,
  deliveryFee,
  recommendations,
  customerName,
  setCustomerName,
  customerPhone,
  setCustomerPhone,
  fulfillment,
  setFulfillment,
  tableNumber,
  setTableNumber,
  branchId,
  setBranchId,
  paymentMethod,
  setPaymentMethod,
  note,
  setNote,
  couponInput,
  setCouponInput,
  appliedCoupon,
  couponError,
  couponLoading,
  onApplyCoupon,
  onRemoveCoupon,
  tipPct,
  setTipPct,
  customTip,
  setCustomTip,
  transferAvailable,
  onChangeQty,
  onRemoveItem,
  onAddRecommendation,
  onBack,
  onSubmit,
  openStatus,
  loading,
  error,
}: {
  branches: FoodosBranch[]
  cart: FoodosOrderItem[]
  totals: { subtotal: number; discount: number; tip: number; total: number }
  deliveryFee: number
  recommendations: ReturnType<typeof buildRecommendations>
  customerName: string
  setCustomerName: (v: string) => void
  customerPhone: string
  setCustomerPhone: (v: string) => void
  fulfillment: "pickup" | "delivery" | "dine_in"
  setFulfillment: (v: "pickup" | "delivery" | "dine_in") => void
  tableNumber: string
  setTableNumber: (v: string) => void
  branchId: string | null
  setBranchId: (v: string) => void
  paymentMethod: "card" | "branch" | "whatsapp" | "transfer"
  setPaymentMethod: (v: "card" | "branch" | "whatsapp" | "transfer") => void
  note: string
  setNote: (v: string) => void
  couponInput: string
  setCouponInput: (v: string) => void
  appliedCoupon: { code: string; discount: number } | null
  couponError: string | null
  couponLoading: boolean
  onApplyCoupon: () => void
  onRemoveCoupon: () => void
  tipPct: 0 | 10 | 15 | "custom"
  setTipPct: (v: 0 | 10 | 15 | "custom") => void
  customTip: string
  setCustomTip: (v: string) => void
  transferAvailable: boolean
  onChangeQty: (index: number, delta: number) => void
  onRemoveItem: (index: number) => void
  onAddRecommendation: (rec: (typeof recommendations)[number]) => void
  onBack: () => void
  onSubmit: () => void
  openStatus: OpenStatus
  loading: boolean
  error: string | null
}) {
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Volver al menú
      </button>

      <div className="grid md:grid-cols-5 gap-6">
        <div className="md:col-span-3 space-y-6">
          {/* Resumen del pedido */}
          <section className="bg-white border border-stone-200 rounded-2xl p-4">
            <h2 className="font-bold text-stone-900 mb-3">Tu pedido</h2>
            {cart.length === 0 ? (
              <p className="text-sm text-stone-500">Tu carrito está vacío.</p>
            ) : (
              <div className="space-y-3">
                {cart.map((item, idx) => (
                  <div key={`${item.item_id}-${idx}`} className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-stone-900 truncate">{item.name}</p>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <p className="text-xs text-stone-500 truncate">{modifiersSummary(item.modifiers)}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <button onClick={() => onChangeQty(idx, -1)} className="w-11 h-11 sm:w-8 sm:h-8 rounded-full bg-stone-100 flex items-center justify-center touch-target" aria-label="Menos">
                          <Minus className="w-4 h-4 sm:w-3 sm:h-3" />
                        </button>
                        <span className="text-sm font-bold">{item.qty}</span>
                        <button onClick={() => onChangeQty(idx, 1)} className="w-11 h-11 sm:w-8 sm:h-8 rounded-full bg-stone-100 flex items-center justify-center touch-target" aria-label="Más">
                          <Plus className="w-4 h-4 sm:w-3 sm:h-3" />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-stone-900">{formatMoney(item.price * item.qty)}</p>
                    <button onClick={() => onRemoveItem(idx)} className="text-stone-400 hover:text-red-600" aria-label="Quitar">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Sugerencias cross-sell */}
          {recommendations.length > 0 && cart.length > 0 && (
            <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <h2 className="flex items-center gap-2 font-bold text-stone-900 mb-3">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Sugerencias para tu pedido
              </h2>
              <div className="space-y-2">
                {recommendations.map((rec) => {
                  const target = rec.kind === "combo" ? rec.combo : rec.item
                  if (!target) return null
                  return (
                    <div key={`${rec.kind}-${target.id}`} className="flex items-center justify-between gap-2 bg-white rounded-xl p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-stone-900 truncate">{target.name}</p>
                        <p className="text-xs text-stone-500">{rec.offerText}</p>
                      </div>
                      <button
                        onClick={() => onAddRecommendation(rec)}
                        className="shrink-0 px-3 py-1.5 rounded-full bg-stone-900 text-white text-xs font-bold hover:bg-stone-700"
                      >
                        Agregar
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Datos del cliente */}
          <section className="bg-white border border-stone-200 rounded-2xl p-4">
            <h2 className="font-bold text-stone-900 mb-3">Tus datos</h2>
            <div className="grid gap-3">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nombre completo"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Teléfono (10 dígitos)"
                inputMode="tel"
                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Notas (opcional): sin cebolla, bien cocido, etc."
                rows={2}
                className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </section>

          {/* Entrega */}
          <section className="bg-white border border-stone-200 rounded-2xl p-4">
            <h2 className="font-bold text-stone-900 mb-3">Entrega</h2>
            <div className={`grid gap-2 mb-4 ${branches.some((b) => b.dine_in_active) ? "grid-cols-3" : "grid-cols-2"}`}>
              <button
                onClick={() => setFulfillment("pickup")}
                className={`flex flex-col items-center gap-1 rounded-xl p-3 border-2 text-sm font-semibold ${
                  fulfillment === "pickup" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500"
                }`}
              >
                <Store className="w-5 h-5" />
                Para llevar
              </button>
              <button
                onClick={() => setFulfillment("delivery")}
                className={`flex flex-col items-center gap-1 rounded-xl p-3 border-2 text-sm font-semibold ${
                  fulfillment === "delivery" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500"
                }`}
              >
                <Bike className="w-5 h-5" />
                A domicilio
              </button>
              {branches.some((b) => b.dine_in_active) && (
                <button
                  onClick={() => setFulfillment("dine_in")}
                  className={`flex flex-col items-center gap-1 rounded-xl p-3 border-2 text-sm font-semibold ${
                    fulfillment === "dine_in" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500"
                  }`}
                >
                  <UtensilsCrossed className="w-5 h-5" />
                  En el local
                </button>
              )}
            </div>

            {fulfillment === "dine_in" && (
              <input
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="Número de mesa"
                inputMode="numeric"
                className="w-full px-4 py-3 mb-4 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            )}

            {branches.length > 0 && (
              <div className="grid gap-2">
                {branches.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setBranchId(b.id)}
                    className={`flex items-center justify-between rounded-xl p-3 border-2 text-left ${
                      branchId === b.id ? "border-emerald-500 bg-emerald-50" : "border-stone-200"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-stone-900">{b.name}</p>
                      {b.address && (
                        <p className="text-xs text-stone-500 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {b.address}
                        </p>
                      )}
                    </div>
                    {fulfillment === "delivery" && b.delivery_fee > 0 && (
                      <span className="text-xs font-bold text-stone-600">{formatMoney(b.delivery_fee)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Cupón */}
          <section className="bg-white border border-stone-200 rounded-2xl p-4">
            <h2 className="font-bold text-stone-900 mb-3 flex items-center gap-2">
              <Ticket className="w-4 h-4 text-emerald-600" /> Cupón
            </h2>
            {appliedCoupon ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                <p className="text-sm font-bold text-emerald-800">
                  {appliedCoupon.code} · −{formatMoney(appliedCoupon.discount)}
                </p>
                <button onClick={onRemoveCoupon} className="text-xs font-semibold text-emerald-700 hover:text-emerald-900">
                  Quitar
                </button>
              </div>
            ) : (
              <div>
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Código de cupón"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-stone-200 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={onApplyCoupon}
                    disabled={couponLoading || !couponInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-bold hover:bg-stone-700 disabled:opacity-50"
                  >
                    {couponLoading ? "…" : "Aplicar"}
                  </button>
                </div>
                {couponError && <p className="mt-2 text-xs text-red-600">{couponError}</p>}
              </div>
            )}
          </section>

          {/* Propina */}
          <section className="bg-white border border-stone-200 rounded-2xl p-4">
            <h2 className="font-bold text-stone-900 mb-3">Propina (opcional)</h2>
            <div className="grid grid-cols-4 gap-2">
              {([0, 10, 15] as const).map((pct) => (
                <button
                  key={pct}
                  onClick={() => setTipPct(pct)}
                  className={`rounded-xl p-2.5 border-2 text-sm font-semibold ${
                    tipPct === pct ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500"
                  }`}
                >
                  {pct === 0 ? "Sin" : `${pct}%`}
                </button>
              ))}
              <button
                onClick={() => setTipPct("custom")}
                className={`rounded-xl p-2.5 border-2 text-sm font-semibold ${
                  tipPct === "custom" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500"
                }`}
              >
                Otra
              </button>
            </div>
            {tipPct === "custom" && (
              <input
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="Monto de propina"
                inputMode="decimal"
                className="mt-2 w-full px-4 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            )}
          </section>

          {/* Pago */}
          <section className="bg-white border border-stone-200 rounded-2xl p-4">
            <h2 className="font-bold text-stone-900 mb-3">Pago</h2>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaymentMethod("branch")}
                className={`flex flex-col items-center gap-1 rounded-xl p-3 border-2 text-sm font-semibold ${
                  paymentMethod === "branch" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500"
                }`}
              >
                <Banknote className="w-5 h-5" />
                Pagar en sucursal
              </button>
              <button
                onClick={() => setPaymentMethod("card")}
                className={`flex flex-col items-center gap-1 rounded-xl p-3 border-2 text-sm font-semibold ${
                  paymentMethod === "card" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500"
                }`}
              >
                <CreditCard className="w-5 h-5" />
                Tarjeta
              </button>
              {transferAvailable && (
                <button
                  onClick={() => setPaymentMethod("transfer")}
                  className={`flex flex-col items-center gap-1 rounded-xl p-3 border-2 text-sm font-semibold ${
                    paymentMethod === "transfer" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500"
                  }`}
                >
                  <Landmark className="w-5 h-5" />
                  Transferencia
                </button>
              )}
              {branches.find((b) => b.id === branchId)?.phone && (
                <button
                  onClick={() => setPaymentMethod("whatsapp")}
                  className={`col-span-2 flex items-center justify-center gap-2 rounded-xl p-3 border-2 text-sm font-semibold ${
                    paymentMethod === "whatsapp" ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-stone-200 text-stone-500"
                  }`}
                >
                  <MessageCircle className="w-5 h-5" />
                  Enviar pedido por WhatsApp
                </button>
              )}
            </div>
            {paymentMethod === "whatsapp" && (
              <p className="mt-3 text-xs text-stone-500">
                Al confirmar se abrirá WhatsApp con tu pedido listo para enviar al restaurante. El pago se acuerda por chat o al recoger.
              </p>
            )}
            {paymentMethod === "transfer" && (
              <p className="mt-3 text-xs text-stone-500">
                Al confirmar verás la CLABE del restaurante. Tu pedido se prepara en cuanto compartas tu comprobante.
              </p>
            )}
          </section>
        </div>

        {/* Resumen */}
        <div className="md:col-span-2">
          <div className="bg-white border border-stone-200 rounded-2xl p-4 sticky top-24">
            <h2 className="font-bold text-stone-900 mb-3">Resumen</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal</span>
                <span>{formatMoney(totals.subtotal)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Descuento{appliedCoupon ? ` (${appliedCoupon.code})` : ""}</span>
                  <span>−{formatMoney(totals.discount)}</span>
                </div>
              )}
              {deliveryFee > 0 && (
                <div className="flex justify-between text-stone-600">
                  <span>Envío</span>
                  <span>{formatMoney(deliveryFee)}</span>
                </div>
              )}
              {totals.tip > 0 && (
                <div className="flex justify-between text-stone-600">
                  <span>Propina</span>
                  <span>{formatMoney(totals.tip)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-black text-stone-900 pt-2 border-t border-stone-200">
                <span>Total</span>
                <span>{formatMoney(totals.total)}</span>
              </div>
            </div>

            {error && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
            )}

            <button
              onClick={onSubmit}
              disabled={loading || cart.length === 0 || !openStatus.isOpen}
              className="mt-4 w-full py-3 rounded-xl foodos-accent bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creando pedido...
                </>
              ) : paymentMethod === "whatsapp" ? (
                <>
                  <MessageCircle className="w-4 h-4" />
                  Confirmar y abrir WhatsApp
                </>
              ) : (
                <>
                  Confirmar pedido
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <p className="mt-2 text-[11px] text-stone-400 text-center">
              Pedidos gestionados con Resurte.me
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
