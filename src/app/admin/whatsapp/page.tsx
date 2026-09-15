"use client"

// ============================================================
// Catálogos de WhatsApp de la plataforma — multi-catálogo por
// ciudad con selección y ORDEN exacto (primero: Chihuahua).
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import {
  Search, RefreshCw, ArrowUp, ArrowDown, Plus, Send,
  Loader2, MapPin, Globe, History, ListChecks, AlertTriangle, X,
  ChevronDown, ChevronRight, RotateCcw,
} from "lucide-react"
import { getCategoryIcon } from "@/lib/utils"
import {
  getAdminWhatsappCatalog,
  listWaCatalogs,
  createWaCatalog,
  getWaCatalogItems,
  setWaCatalogProduct,
  reorderWaCatalog,
  syncWaCatalog,
  previewWaCatalogSync,
  sendWaCatalogToPhone,
  getWaCatalogSyncHistory,
  getWaCatalogQueueCount,
  processWaSyncQueueNow,
  getWaRunItems,
  getWaCatalogQueue,
  removeWaQueueItem,
  retryWaSyncProduct,
  retryWaFailedProducts,
  type AdminWhatsappProduct,
  type AdminWhatsappCategory,
  type WaCatalogSummary,
  type WaCatalogDetailItem,
  type WaSyncRunSummary,
  type WaSyncItemDetail,
  type WaQueueItem,
} from "@/app/admin/actions"

// Antigüedad legible para la cola y el historial.
function ageText(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  return `hace ${Math.floor(hours / 24)} d`
}

const QUEUE_REASON_LABELS: Record<string, string> = {
  product_update: "cambio de producto",
  visibility: "visibilidad",
  city_availability: "disponibilidad por ciudad",
  catalog_curation_add: "alta en curaduría",
}

export default function AdminWhatsAppPage() {
  const [products, setProducts] = useState<AdminWhatsappProduct[]>([])
  const [categories, setCategories] = useState<AdminWhatsappCategory[]>([])
  const [catalogs, setCatalogs] = useState<WaCatalogSummary[]>([])
  const [selectedCatalog, setSelectedCatalog] = useState<WaCatalogSummary | null>(null)
  const [catalogItems, setCatalogItems] = useState<WaCatalogDetailItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
  const [newCityName, setNewCityName] = useState("")
  const [sendPhone, setSendPhone] = useState("")

  // WA6 — previsualización del diff, historial y cola automática.
  const [syncPreview, setSyncPreview] = useState<{
    diff: { toCreate: string[]; toUpdate: string[]; stale: string[] }
    metaTotal: number
    invalid: { id: string; name: string; reasons: string[] }[]
  } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [history, setHistory] = useState<WaSyncRunSummary[]>([])
  const [queueCount, setQueueCount] = useState(0)

  // WB4 — detalle de corridas y vista de cola.
  const [queueItems, setQueueItems] = useState<WaQueueItem[]>([])
  const [showQueue, setShowQueue] = useState(false)
  const [expandedRun, setExpandedRun] = useState<string | null>(null)
  const [runItems, setRunItems] = useState<Record<string, WaSyncItemDetail[]>>({})
  const [retryingKey, setRetryingKey] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [data, cats] = await Promise.all([getAdminWhatsappCatalog(), listWaCatalogs()])
      setProducts(data.products)
      setCategories(data.categories)
      setCatalogs(cats)
      if (cats.length > 0) {
        const first = cats.find((c) => c.slug === "chihuahua") ?? cats[0] ?? null
        setSelectedCatalog((prev) => prev ?? first)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadItems = useCallback(async () => {
    if (!selectedCatalog) return
    const [items, runs, queued, queueList] = await Promise.all([
      getWaCatalogItems(selectedCatalog.id),
      getWaCatalogSyncHistory(selectedCatalog.id, 5).catch(() => [] as WaSyncRunSummary[]),
      getWaCatalogQueueCount(selectedCatalog.id).catch(() => 0),
      getWaCatalogQueue(selectedCatalog.id).catch(() => [] as WaQueueItem[]),
    ])
    setCatalogItems(items)
    setHistory(runs)
    setQueueCount(queued)
    setQueueItems(queueList)
  }, [selectedCatalog])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  useEffect(() => {
    const run = async () => { await loadItems() }
    run().catch(() => {})
  }, [loadItems])

  const curatedIds = useMemo(() => new Set(catalogItems.map((i) => i.product_id)), [catalogItems])
  const curated = useMemo(
    () => catalogItems.filter((i) => i.is_visible).sort((a, b) => a.position - b.position),
    [catalogItems]
  )
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const available = useMemo(
    () =>
      products.filter((p) => {
        if (curatedIds.has(p.id)) return false
        if (selectedCategory && p.category_id !== selectedCategory) return false
        if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
        return true
      }),
    [products, curatedIds, selectedCategory, search]
  )

  async function run<T>(fn: () => Promise<T>, okText?: (r: T) => string) {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const result = await fn()
      if (okText) setMessage({ ok: true, text: okText(result) })
      await loadItems()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error")
    } finally {
      setBusy(false)
    }
  }

  const handleAdd = (productId: number) =>
    run(async () => {
      if (!selectedCatalog) return
      await setWaCatalogProduct(selectedCatalog.id, productId, true)
    })

  const handleRemove = (productId: number) =>
    run(async () => {
      if (!selectedCatalog) return
      await setWaCatalogProduct(selectedCatalog.id, productId, false)
    })

  const move = (item: WaCatalogDetailItem, delta: -1 | 1) =>
    run(async () => {
      if (!selectedCatalog) return
      const ids = curated.map((i) => i.product_id)
      const idx = ids.indexOf(item.product_id)
      const swap = idx + delta
      if (idx < 0 || swap < 0 || swap >= ids.length) return
      const a = ids[idx]
      const b = ids[swap]
      if (a === undefined || b === undefined) return
      ids[idx] = b
      ids[swap] = a
      await reorderWaCatalog(selectedCatalog.id, ids)
    })

  const handleSync = () =>
    run(async () => {
      if (!selectedCatalog) throw new Error("Selecciona un catálogo")
      const preview = await previewWaCatalogSync(selectedCatalog.id)
      setSyncPreview(preview)
      setConfirmDelete(false)
    })

  const handleConfirmSync = () =>
    run(
      async () => {
        if (!selectedCatalog) throw new Error("Selecciona un catálogo")
        const result = await syncWaCatalog(selectedCatalog.id, { deleteUnknown: confirmDelete })
        setSyncPreview(null)
        return result
      },
      (r) =>
        `Catálogo "${selectedCatalog?.name}" sincronizado: ${r.added} nuevos, ${r.updated} actualizados` +
        (r.removed ? `, ${r.removed} eliminados de Meta` : "") +
        (r.stale.length ? `. ${r.stale.length} productos en Meta fuera de la curaduría (sin borrar)` : "") +
        (r.invalid.length ? `. ${r.invalid.length} excluidos por datos inválidos (revisa el detalle en una nueva previsualización)` : "") +
        "."
    )

  const handleProcessQueue = () =>
    run(
      async () => processWaSyncQueueNow(),
      (r) => `Cola procesada: ${r.synced} productos sincronizados en ${r.catalogs} catálogo(s)${r.failed ? ` (${r.failed} fallidos)` : ""}.`
    )

  // WB4 — expandir corrida y cargar su detalle por producto (lazy).
  const toggleRun = (runId: string) => {
    if (expandedRun === runId) {
      setExpandedRun(null)
      return
    }
    setExpandedRun(runId)
    if (!runItems[runId]) {
      getWaRunItems(runId)
        .then((items) => setRunItems((prev) => ({ ...prev, [runId]: items })))
        .catch(() => {})
    }
  }

  const handleRetryProduct = (runId: string, productId: number) => {
    const key = `${runId}:${productId}`
    setRetryingKey(key)
    run(
      async () => {
        const result = await retryWaSyncProduct(runId, productId)
        if (!result.ok) throw new Error(result.error ?? "Reintento fallido")
        setRunItems((prev) => ({ ...prev, [runId]: [] }))
        getWaRunItems(runId)
          .then((items) => setRunItems((prev) => ({ ...prev, [runId]: items })))
          .catch(() => {})
      },
      () => "Producto reenviado a Meta. El estado se confirmará al resolver el batch."
    ).finally(() => setRetryingKey(null))
  }

  const handleRetryFailed = () =>
    run(
      async () => {
        if (!selectedCatalog) throw new Error("Selecciona un catálogo")
        return retryWaFailedProducts(selectedCatalog.id)
      },
      (r) => `Reintentos enviados: ${r.retried}${r.failed ? ` (${r.failed} con error: ${r.errors[0] ?? ""})` : ""}.`
    )

  const handleRemoveQueueItem = (queueItemId: string) =>
    run(async () => removeWaQueueItem(queueItemId))

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    run(
      async () => {
        if (!selectedCatalog) throw new Error("Selecciona un catálogo")
        await sendWaCatalogToPhone(selectedCatalog.id, sendPhone)
      },
      () => `Catálogo de ${selectedCatalog?.name} enviado a ${sendPhone} en el orden exacto.`
    )
    setSendPhone("")
  }

  const handleCreateCatalog = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCityName.trim()) return
    run(
      async () => {
        await createWaCatalog(newCityName.trim(), null)
        setNewCityName("")
      },
      () => "Catálogo creado."
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#0E7A0E]" />
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#242529]">Catálogos de WhatsApp</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Un catálogo por ciudad, con tu selección y <strong>tu orden exacto</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {queueCount > 0 && (
            <button
              onClick={() => setShowQueue((v) => !v)}
              disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#0E7A0E]/40 text-[#0E7A0E] font-semibold rounded-full hover:bg-[#F2FBF5] transition-colors text-sm disabled:opacity-60"
            >
              <ListChecks className="w-4 h-4" />
              Cola de sync ({queueCount})
            </button>
          )}
          <button
            onClick={handleSync}
            disabled={busy || !selectedCatalog || curated.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F7A3D] text-white font-semibold rounded-full hover:bg-[#0F6B3A] transition-colors text-sm shadow-sm disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
            Sincronizar a WhatsApp
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">{message.text}</div>
      )}
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Panel de cola de sync automático (WB4) */}
      {showQueue && selectedCatalog && (
        <div className="mb-6 bg-white rounded-2xl border border-[#E8E9EB] p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-[#242529] flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-[#0E7A0E]" />
              Cola de {selectedCatalog.name}
            </h2>
            <button
              onClick={handleProcessQueue}
              disabled={busy || queueItems.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F7A3D] text-white text-xs font-bold rounded-full hover:bg-[#0F6B3A] disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} />
              Procesar ahora
            </button>
          </div>
          {queueItems.length === 0 ? (
            <p className="text-sm text-[#B0B3B8] py-4 text-center">Cola vacía.</p>
          ) : (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
              {queueItems.map((q) => (
                <li key={q.id} className="flex items-center gap-3 rounded-xl border border-[#F0F1F2] px-3 py-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#242529] truncate">{q.product_name}</p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {QUEUE_REASON_LABELS[q.reason] ?? q.reason} · {ageText(q.queued_at)}
                      {q.attempts > 0 && <span className="ml-1 text-amber-600">· intento {q.attempts + 1}</span>}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveQueueItem(q.id)}
                    disabled={busy}
                    className="p-1.5 text-[#B0B3B8] hover:text-red-600"
                    aria-label={`Quitar ${q.product_name} de la cola`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-[#B0B3B8] mt-3">
            La cola también se vacía automáticamente con el cron diario.
          </p>
        </div>
      )}

      {/* Selector de catálogo */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {catalogs.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCatalog(c)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              selectedCatalog?.id === c.id
                ? "bg-[#0E7A0E] text-white"
                : "bg-white border border-[#E8E9EB] text-[var(--text-secondary)] hover:bg-[#F7F5F0]"
            }`}
          >
            {c.city_id ? <MapPin className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
            {c.name}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${selectedCatalog?.id === c.id ? "bg-white/20" : "bg-[#F5F3F0]"}`}>
              {c.items_count}
            </span>
          </button>
        ))}
        <form onSubmit={handleCreateCatalog} className="flex items-center gap-1.5">
          <input
            value={newCityName}
            onChange={(e) => setNewCityName(e.target.value)}
            placeholder="Nueva ciudad…"
            className="w-32 px-3 py-2 bg-white border border-dashed border-[#0E7A0E]/40 rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/20"
          />
          <button
            type="submit"
            disabled={busy || !newCityName.trim()}
            className="p-2 rounded-full bg-[#0E7A0E] text-white hover:bg-[#0D720D] disabled:opacity-40"
            aria-label="Crear catálogo"
          >
            <Plus className="w-4 h-4" />
          </button>
        </form>
      </div>

      {selectedCatalog && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Curaduría ordenada */}
          <div className="bg-white rounded-2xl border border-[#E8E9EB] p-5 h-fit">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-[#242529]">
                Catálogo de {selectedCatalog.name}
              </h2>
              <span className="text-xs text-[#B0B3B8]">{curated.length} productos</span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mb-4">
              Este es el orden EXACTO que verá el cliente.
            </p>

            {curated.length === 0 ? (
              <p className="text-sm text-[#B0B3B8] py-8 text-center">
                Catálogo vacío. Agrega productos de la lista de la derecha.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
                {curated.map((item, idx) => {
                  const p = productById.get(item.product_id)
                  if (!p) return null
                  return (
                    <div key={item.product_id} className="flex items-center gap-2 rounded-xl border border-[#25D366]/20 bg-[#F2FBF5] px-3 py-2">
                      <span className="w-6 text-xs font-black text-[#0E7A0E]">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[#242529] truncate">{p.name}</p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          ${(p.sale_price ?? p.price ?? 0).toFixed(2)}
                          {item.available_in_city === false && (
                            <span className="ml-2 text-amber-600 font-semibold">⚠ no disponible en la ciudad</span>
                          )}
                        </p>
                      </div>
                      <button onClick={() => move(item, -1)} disabled={busy || idx === 0} className="p-1.5 text-[#B0B3B8] hover:text-[#242529] disabled:opacity-30" aria-label={`Subir ${p.name}`}>
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button onClick={() => move(item, 1)} disabled={busy || idx === curated.length - 1} className="p-1.5 text-[#B0B3B8] hover:text-[#242529] disabled:opacity-30" aria-label={`Bajar ${p.name}`}>
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleRemove(item.product_id)} disabled={busy} className="p-1.5 text-[#B0B3B8] hover:text-red-600" aria-label={`Quitar ${p.name}`}>
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Enviar a teléfono */}
            <form onSubmit={handleSend} className="mt-4 pt-4 border-t border-[#F0F1F2]">
              <p className="text-xs font-semibold text-[#242529] mb-2">Probar con un cliente</p>
              <div className="flex gap-2">
                <input
                  value={sendPhone}
                  onChange={(e) => setSendPhone(e.target.value)}
                  placeholder="Teléfono (10 dígitos)"
                  inputMode="tel"
                  className="flex-1 px-3 py-2 bg-white border border-[#E8E9EB] rounded-xl text-sm focus:outline-none focus:border-[#0E7A0E]"
                />
                <button
                  type="submit"
                  disabled={busy || curated.length === 0 || !sendPhone.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#25D366] text-white text-sm font-bold hover:bg-[#1fb857] disabled:opacity-40"
                >
                  <Send className="w-4 h-4" /> Enviar
                </button>
              </div>
            </form>

            {/* Historial de syncs */}
            {history.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#F0F1F2]">
                <p className="text-xs font-semibold text-[#242529] mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" /> Historial de sincronización
                </p>
                <ul className="space-y-1.5">
                  {history.map((run) => {
                    const expanded = expandedRun === run.id
                    const items = runItems[run.id]
                    const errorCount = items?.filter((i) => i.status === "error").length ?? 0
                    return (
                      <li key={run.id} className="text-xs">
                        <button
                          onClick={() => toggleRun(run.id)}
                          className="w-full flex items-start gap-2 text-left rounded-lg px-1 py-0.5 hover:bg-[#F7F5F0]"
                          aria-expanded={expanded}
                        >
                          {expanded ? (
                            <ChevronDown className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#B0B3B8]" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#B0B3B8]" />
                          )}
                          <span
                            className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                              run.status === "done"
                                ? "bg-emerald-500"
                                : run.status === "failed"
                                  ? "bg-red-500"
                                  : "bg-amber-400 animate-pulse"
                            }`}
                            aria-hidden="true"
                          />
                          <span className="text-[var(--text-secondary)]">
                            <span className="font-semibold text-[#242529]">
                              {new Date(run.started_at).toLocaleString("es-MX", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {" · "}
                            {run.trigger_kind === "auto" ? "automático" : "manual"}
                            {run.status === "done" &&
                              ` · ${run.added} nuevos, ${run.updated} act.${run.removed ? `, ${run.removed} elim.` : ""}${run.stale_count ? `, ${run.stale_count} ajenos` : ""}`}
                            {run.status === "failed" && " · falló"}
                            {run.status === "running" && " · en curso…"}
                            {run.error && <span className="block text-red-600 mt-0.5">{run.error}</span>}
                          </span>
                        </button>

                        {expanded && (
                          <div className="ml-7 mt-1 mb-2 rounded-xl border border-[#F0F1F2] bg-[#FAFAF8] p-2.5">
                            {!items || items.length === 0 ? (
                              <p className="text-[#B0B3B8] py-1">
                                {items ? "Sin detalle por producto (anterior a WB2)." : "Cargando detalle…"}
                              </p>
                            ) : (
                              <>
                                <ul className="space-y-1 max-h-48 overflow-y-auto">
                                  {items.map((item) => (
                                    <li key={item.product_id} className="flex items-center gap-2">
                                      <span
                                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                          item.status === "ok"
                                            ? "bg-emerald-500"
                                            : item.status === "error"
                                              ? "bg-red-500"
                                              : "bg-amber-400"
                                        }`}
                                        aria-hidden="true"
                                      />
                                      <span className="flex-1 min-w-0 truncate text-[#242529]">
                                        {item.product_name}
                                        <span className="text-[#B0B3B8]"> · {item.action}</span>
                                        {item.error && (
                                          <span className="block text-red-600 truncate">{item.error}</span>
                                        )}
                                      </span>
                                      {item.status === "error" && (
                                        <button
                                          onClick={() => handleRetryProduct(run.id, item.product_id)}
                                          disabled={busy || retryingKey === `${run.id}:${item.product_id}`}
                                          className="p-1 text-[#0E7A0E] hover:bg-[#E7F8EE] rounded disabled:opacity-40"
                                          aria-label={`Reintentar ${item.product_name}`}
                                        >
                                          {retryingKey === `${run.id}:${item.product_id}` ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          ) : (
                                            <RotateCcw className="w-3.5 h-3.5" />
                                          )}
                                        </button>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                                {errorCount > 0 && (
                                  <button
                                    onClick={handleRetryFailed}
                                    disabled={busy}
                                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0E7A0E] text-white font-bold hover:bg-[#0D720D] disabled:opacity-40"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Reintentar {errorCount} fallido(s)
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Productos disponibles */}
          <div className="bg-white rounded-2xl border border-[#E8E9EB] p-5">
            <h2 className="font-bold text-[#242529] mb-3">Agregar productos</h2>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B0B3B8]" />
              <input
                type="text"
                placeholder="Buscar producto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#E8E9EB] rounded-xl text-sm focus:outline-none focus:border-[#0E7A0E]"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${selectedCategory === null ? "bg-[#0E7A0E] text-white" : "bg-[#F5F3F0] text-[var(--text-secondary)]"}`}
              >
                Todas
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium ${selectedCategory === cat.id ? "bg-[#0E7A0E] text-white" : "bg-[#F5F3F0] text-[var(--text-secondary)]"}`}
                >
                  {getCategoryIcon(cat.icon ?? "", cat.slug)} {cat.name}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 max-h-[55vh] overflow-y-auto">
              {available.length === 0 ? (
                <p className="text-sm text-[#B0B3B8] py-8 text-center">Sin productos por agregar.</p>
              ) : (
                available.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-xl border border-[#F0F1F2] px-3 py-2 hover:border-[#25D366]/40 transition-colors">
                    {p.image_url ? (
                      <Image src={p.image_url} alt={p.name} width={36} height={36} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-[#F5F3F0] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#242529] truncate">{p.name}</p>
                      <p className="text-xs text-[#B0B3B8]">${(p.sale_price ?? p.price ?? 0).toFixed(2)}{p.unit ? ` · ${p.unit}` : ""}</p>
                    </div>
                    <button onClick={() => handleAdd(p.id)} disabled={busy} className="p-1.5 text-[#0E7A0E] hover:bg-[#E7F8EE] rounded-lg" aria-label={`Agregar ${p.name}`}>
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: previsualización del sync (WA6) */}
      {syncPreview && selectedCatalog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Previsualización de sincronización"
        >
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <h3 className="font-bold text-[#242529]">
                Sincronizar “{selectedCatalog.name}”
              </h3>
              <button
                onClick={() => setSyncPreview(null)}
                className="p-1 text-[#B0B3B8] hover:text-[#242529]"
                aria-label="Cerrar previsualización"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ul className="space-y-2 text-sm text-[var(--text-secondary)] mb-4">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
                <span><strong className="text-[#242529]">{syncPreview.diff.toCreate.length}</strong> productos nuevos se crearán en Meta</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-sky-500" aria-hidden="true" />
                <span><strong className="text-[#242529]">{syncPreview.diff.toUpdate.length}</strong> productos existentes se actualizarán</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5" aria-hidden="true" />
                <span>
                  <strong className="text-[#242529]">{syncPreview.diff.stale.length}</strong> productos están en Meta pero fuera de la curaduría
                  {syncPreview.diff.stale.length > 0 && (
                    <span className="block text-xs text-[#B0B3B8] mt-0.5">
                      IDs: {syncPreview.diff.stale.slice(0, 10).join(", ")}{syncPreview.diff.stale.length > 10 ? "…" : ""}
                    </span>
                  )}
                </span>
              </li>
            </ul>

            {syncPreview.invalid.length > 0 && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 mb-4">
                <p className="text-xs font-semibold text-red-800 mb-1">
                  {syncPreview.invalid.length} producto(s) excluido(s) del sync por datos inválidos:
                </p>
                <ul className="text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto">
                  {syncPreview.invalid.map((p) => (
                    <li key={p.id}>
                      <strong>{p.name}</strong>: {p.reasons.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {syncPreview.diff.stale.length > 0 && (
              <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.checked)}
                  className="mt-0.5 accent-[#0E7A0E]"
                />
                <span className="text-xs text-amber-800 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Eliminar de Meta los {syncPreview.diff.stale.length} productos fuera de la curaduría. Si no lo marcas, se conservan intactos.
                </span>
              </label>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSyncPreview(null)}
                className="px-4 py-2 rounded-full text-sm font-semibold text-[var(--text-secondary)] hover:bg-[#F7F5F0]"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmSync}
                disabled={busy}
                className="inline-flex items-center gap-2 px-5 py-2 bg-[#0F7A3D] text-white text-sm font-bold rounded-full hover:bg-[#0F6B3A] disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
                Sincronizar ahora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
