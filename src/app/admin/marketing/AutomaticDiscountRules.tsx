"use client"

import { useCallback, useEffect, useState } from "react"
import { Sparkles, Trash2 } from "lucide-react"
import type { AutomaticDiscountRuleRow } from "@/lib/coupon-rules"
import { parseBundleRuleConfig, parseBuyXGetYRuleConfig } from "@/lib/coupon-rules"

/**
 * CRUD mínimo de descuentos automáticos sin código (migración
 * 00231): paquetes (bundle) y «compra X, llévate Y». Las reglas
 * activas las evalúa el servidor al cotizar el carrito y al crear
 * el pedido; aquí solo se administran. Los productos se capturan
 * por ID (el mismo que muestra el admin de productos).
 */
export function AutomaticDiscountRules() {
  const [rules, setRules] = useState<AutomaticDiscountRuleRow[]>([])
  const [migrationPending, setMigrationPending] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  // Formulario de alta
  const [name, setName] = useState("")
  const [ruleType, setRuleType] = useState<"bundle" | "buy_x_get_y">("bundle")
  const [bundleItems, setBundleItems] = useState<{ productId: string; quantity: string }[]>([
    { productId: "", quantity: "1" },
    { productId: "", quantity: "1" },
  ])
  const [discountType, setDiscountType] = useState<"percentage" | "fixed_amount">("percentage")
  const [discountValue, setDiscountValue] = useState("")
  const [buyProductId, setBuyProductId] = useState("")
  const [buyQuantity, setBuyQuantity] = useState("2")
  const [getProductId, setGetProductId] = useState("")
  const [getQuantity, setGetQuantity] = useState("1")
  const [getPercent, setGetPercent] = useState("100")

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/automatic-discounts")
      if (!res.ok) return
      const data = (await res.json()) as {
        rules?: AutomaticDiscountRuleRow[]
        migration_pending?: boolean
      }
      setRules(data.rules ?? [])
      setMigrationPending(Boolean(data.migration_pending))
    } catch {
      // La sección simplemente queda vacía si la red falla.
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/automatic-discounts")
        if (!res.ok || cancelled) return
        const data = (await res.json()) as {
          rules?: AutomaticDiscountRuleRow[]
          migration_pending?: boolean
        }
        if (cancelled) return
        setRules(data.rules ?? [])
        setMigrationPending(Boolean(data.migration_pending))
      } catch {
        // La sección simplemente queda vacía si la red falla.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const describe = (rule: AutomaticDiscountRuleRow): string => {
    if (rule.rule_type === "bundle") {
      const cfg = parseBundleRuleConfig(rule.config)
      if (!cfg) return "Configuración inválida"
      const items = cfg.items.map((i) => `#${i.product_id} ×${i.qty}`).join(" + ")
      const dto =
        cfg.discount_type === "percentage"
          ? `${cfg.discount_value}% de descuento`
          : `$${cfg.discount_value.toFixed(2)} de descuento`
      return `Paquete: ${items} → ${dto} (una vez por pedido)`
    }
    const cfg = parseBuyXGetYRuleConfig(rule.config)
    if (!cfg) return "Configuración inválida"
    return `Compra ${cfg.buy_qty} × #${cfg.buy_product_id} y llévate ${cfg.get_qty} × #${cfg.get_product_id} con ${cfg.discount_pct}% de descuento`
  }

  const create = async () => {
    setError("")
    const config =
      ruleType === "bundle"
        ? {
            items: bundleItems.map((i) => ({
              product_id: Number(i.productId),
              qty: Number(i.quantity),
            })),
            discount_type: discountType,
            discount_value: Number(discountValue),
          }
        : {
            buy_product_id: Number(buyProductId),
            buy_qty: Number(buyQuantity),
            get_product_id: Number(getProductId),
            get_qty: Number(getQuantity),
            discount_pct: Number(getPercent),
          }
    setBusy(true)
    try {
      const res = await fetch("/api/admin/automatic-discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), rule_type: ruleType, config }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(data?.error ?? "No se pudo crear la regla.")
        return
      }
      setName("")
      setDiscountValue("")
      await load()
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (rule: AutomaticDiscountRuleRow) => {
    await fetch(`/api/admin/automatic-discounts/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    })
    await load()
  }

  const remove = async (rule: AutomaticDiscountRuleRow) => {
    if (!window.confirm(`¿Eliminar la regla «${rule.name}» definitivamente?`)) return
    await fetch(`/api/admin/automatic-discounts/${rule.id}`, { method: "DELETE" })
    await load()
  }

  const inputCls =
    "h-9 px-2 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:border-brand-500"

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand-600" />
        Descuentos automáticos (sin código)
      </h2>
      <p className="text-[13px] text-gray-500 mb-3">
        Se aplican solos en el carrito cuando se cumple la condición. El servidor los
        recalcula al crear el pedido; no aplican a pedidos de WhatsApp ni a artículos
        especiales (order bumps).
      </p>

      {migrationPending && (
        <p role="alert" className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
          Falta aplicar la migración <strong>00231_automatic_discount_rules.sql</strong> en
          Supabase para activar esta sección.
        </p>
      )}

      <ul className="divide-y divide-gray-100 mb-4">
        {rules.map((rule) => (
          <li key={rule.id} className="py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{rule.name}</p>
              <p className="text-[13px] text-gray-500">{describe(rule)}</p>
            </div>
            <button
              type="button"
              onClick={() => void toggle(rule)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                rule.is_active
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-gray-50 text-gray-500 border-gray-200"
              }`}
            >
              {rule.is_active ? "Activa" : "Inactiva"}
            </button>
            <button
              type="button"
              onClick={() => void remove(rule)}
              aria-label={`Eliminar la regla ${rule.name}`}
              className="p-1.5 text-gray-500 hover:text-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
        {rules.length === 0 && !migrationPending && (
          <li className="py-3 text-sm text-gray-500">No hay reglas automáticas creadas.</li>
        )}
      </ul>

      {!migrationPending && (
        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm font-medium text-gray-900 mb-2">Nueva regla</p>
          <div className="flex flex-wrap gap-2 mb-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre (ej. Combo hamburguesa)"
              aria-label="Nombre de la regla"
              className={`${inputCls} flex-1 min-w-52`}
            />
            <select
              value={ruleType}
              onChange={(e) => setRuleType(e.target.value as "bundle" | "buy_x_get_y")}
              aria-label="Tipo de regla"
              className={inputCls}
            >
              <option value="bundle">Paquete (bundle)</option>
              <option value="buy_x_get_y">Compra X, llévate Y</option>
            </select>
          </div>

          {ruleType === "bundle" ? (
            <div className="space-y-2">
              {bundleItems.map((item, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <input
                    value={item.productId}
                    onChange={(e) =>
                      setBundleItems((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, productId: e.target.value } : it))
                      )
                    }
                    placeholder="ID de producto"
                    inputMode="numeric"
                    aria-label={`ID de producto ${idx + 1} del paquete`}
                    className={`${inputCls} w-36`}
                  />
                  <span className="text-sm text-gray-500">×</span>
                  <input
                    value={item.quantity}
                    onChange={(e) =>
                      setBundleItems((prev) =>
                        prev.map((it, i) => (i === idx ? { ...it, quantity: e.target.value } : it))
                      )
                    }
                    placeholder="Cantidad"
                    inputMode="numeric"
                    aria-label={`Cantidad del producto ${idx + 1} del paquete`}
                    className={`${inputCls} w-24`}
                  />
                  {bundleItems.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setBundleItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-xs text-red-700 font-medium"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setBundleItems((prev) => [...prev, { productId: "", quantity: "1" }])}
                className="text-xs font-semibold text-brand-700"
              >
                + Agregar producto al paquete
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed_amount")}
                  aria-label="Tipo de descuento del paquete"
                  className={inputCls}
                >
                  <option value="percentage">% de descuento</option>
                  <option value="fixed_amount">Monto fijo $</option>
                </select>
                <input
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder={discountType === "percentage" ? "Ej. 10" : "Ej. 50.00"}
                  inputMode="decimal"
                  aria-label="Valor del descuento del paquete"
                  className={`${inputCls} w-28`}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-600">Compra</span>
              <input
                value={buyQuantity}
                onChange={(e) => setBuyQuantity(e.target.value)}
                inputMode="numeric"
                aria-label="Cantidad que hay que comprar"
                className={`${inputCls} w-20`}
              />
              <span className="text-sm text-gray-600">× producto</span>
              <input
                value={buyProductId}
                onChange={(e) => setBuyProductId(e.target.value)}
                placeholder="ID"
                inputMode="numeric"
                aria-label="ID del producto que se compra"
                className={`${inputCls} w-24`}
              />
              <span className="text-sm text-gray-600">y llévate</span>
              <input
                value={getQuantity}
                onChange={(e) => setGetQuantity(e.target.value)}
                inputMode="numeric"
                aria-label="Cantidad que se lleva"
                className={`${inputCls} w-20`}
              />
              <span className="text-sm text-gray-600">× producto</span>
              <input
                value={getProductId}
                onChange={(e) => setGetProductId(e.target.value)}
                placeholder="ID (puede ser el mismo)"
                inputMode="numeric"
                aria-label="ID del producto que se lleva"
                className={`${inputCls} w-36`}
              />
              <span className="text-sm text-gray-600">con</span>
              <input
                value={getPercent}
                onChange={(e) => setGetPercent(e.target.value)}
                inputMode="decimal"
                aria-label="Porcentaje de descuento del producto que se lleva"
                className={`${inputCls} w-20`}
              />
              <span className="text-sm text-gray-600">% de descuento (100 = gratis)</span>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-700 mt-2">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void create()}
            disabled={busy || !name.trim()}
            className="mt-3 h-9 px-4 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? "Creando…" : "Crear regla"}
          </button>
        </div>
      )}
    </section>
  )
}
