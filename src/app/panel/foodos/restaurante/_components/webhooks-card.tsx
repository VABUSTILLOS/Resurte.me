"use client"

// ============================================================
// Webhooks salientes: URLs externas que reciben order.created
// con firma HMAC (integraciones del restaurante).
// ============================================================

import { useCallback, useEffect, useState } from "react"
import { Webhook, Plus, Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react"
import {
  listWebhooks,
  addWebhook,
  toggleWebhook,
  deleteWebhook,
  listWebhookDeliveries,
} from "../../actions"
import type { FoodosWebhook, FoodosWebhookDelivery } from "@/types/foodos"

export function WebhooksCard({ restaurantId }: { restaurantId: string }) {
  const [hooks, setHooks] = useState<FoodosWebhook[]>([])
  const [deliveries, setDeliveries] = useState<FoodosWebhookDelivery[]>([])
  const [url, setUrl] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [h, d] = await Promise.all([listWebhooks(restaurantId), listWebhookDeliveries(restaurantId)])
    setHooks(h)
    setDeliveries(d)
  }, [restaurantId])

  useEffect(() => {
    const run = async () => { await load() }
    run().catch(() => {})
  }, [load])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setSaving(true)
    setError(null)
    try {
      await addWebhook(restaurantId, url.trim())
      setUrl("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "URL inválida")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-1">
        <Webhook className="w-5 h-5 text-[#0E7A0E]" />
        <h2 className="font-semibold text-gray-900">Webhooks</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Recibe un POST <code className="text-xs bg-gray-100 px-1 rounded">order.created</code> firmado (HMAC-SHA256 en <code className="text-xs bg-gray-100 px-1 rounded">X-FoodOS-Signature</code>) en tu URL por cada pedido nuevo.
      </p>

      {hooks.length > 0 && (
        <div className="space-y-2 mb-4">
          {hooks.map((h) => (
            <div key={h.id} className="rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-mono text-gray-700 truncate flex-1">{h.url}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={async () => { await toggleWebhook(h.id, !h.is_active); await load() }}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${h.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-500"}`}
                  >
                    {h.is_active ? "Activo" : "Pausado"}
                  </button>
                  <button
                    onClick={async () => { await deleteWebhook(h.id); await load() }}
                    className="p-1.5 text-gray-400 hover:text-red-600"
                    aria-label="Eliminar webhook"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1 font-mono">
                secreto: {h.secret.slice(0, 8)}…
              </p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://tu-servidor.com/webhook"
          className="flex-1 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
        />
        <button
          type="submit"
          disabled={saving || !url.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Agregar
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {deliveries.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 mb-2">Entregas recientes</p>
          <div className="space-y-1">
            {deliveries.slice(0, 5).map((d) => (
              <div key={d.id} className="flex items-center justify-between text-xs text-gray-500">
                <span>{new Date(d.attempted_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}</span>
                <span className="flex items-center gap-1 font-semibold">
                  {d.success ? (
                    <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> {d.response_code}</>
                  ) : (
                    <><XCircle className="w-3.5 h-3.5 text-red-500" /> {d.response_code ?? "error"}</>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
