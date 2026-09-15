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
  ChevronDown, ChevronRight, RotateCcw, GripVertical, Eye, KeyRound, Radar,
  Pause, Play, Trash2,
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
  bulkAddWaCatalogProducts,
  bulkRemoveWaCatalogProducts,
  getWaCatalogCredentials,
  updateWaCatalogCredentials,
  testWaCatalogConnection,
  getWaMetaCatalog,
  pushWaProductToMeta,
  deleteWaMetaProduct,
  setWaMetaProductAvailability,
  fixAllWaCatalogIssues,
  type AdminWhatsappProduct,
  type AdminWhatsappCategory,
  type WaCatalogSummary,
  type WaCatalogDetailItem,
  type WaSyncRunSummary,
  type WaSyncItemDetail,
  type WaQueueItem,
  type WaMetaCatalogRow,
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

  // WC5 — drag & drop de la curaduría.
  const [dragId, setDragId] = useState<number | null>(null)
  const [dragOverId, setDragOverId] = useState<number | null>(null)

  // WC6 — vista previa como cliente.
  const [showPreview, setShowPreview] = useState(false)

  // WC7 — curaduría masiva.
  const [armBulkAdd, setArmBulkAdd] = useState(false)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // WC8/WC9 — credenciales del catálogo y prueba de conexión.
  const [showCreds, setShowCreds] = useState(false)
  const [credsPhoneId, setCredsPhoneId] = useState("")
  const [credsWabaId, setCredsWabaId] = useState("")
  const [credsCatalogId, setCredsCatalogId] = useState("")
  const [credsToken, setCredsToken] = useState("")
  const [credsHasToken, setCredsHasToken] = useState(false)
  const [credsActive, setCredsActive] = useState(true)
  const [connTest, setConnTest] = useState<{ ok: boolean; text: string } | null>(null)

  // WD4 — explorador del catálogo vivo de Meta.
  const [showExplorer, setShowExplorer] = useState(false)
  const [explorerRows, setExplorerRows] = useState<WaMetaCatalogRow[]>([])
  const [explorerMetaTotal, setExplorerMetaTotal] = useState(0)
  const [explorerLoading, setExplorerLoading] = useState(false)
  const [explorerFilter, setExplorerFilter] = useState<"all" | WaMetaCatalogRow["status"]>("all")
  const [fixingId, setFixingId] = useState<number | null>(null)

  // WE4 — acciones directas sobre Meta desde el explorador.
  const [armDeleteId, setArmDeleteId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [fixingAll, setFixingAll] = useState(false)

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

  // WC6 — secciones del product_list tal como las recibiría el cliente
  // (mismo criterio que buildAdminProductListSections: orden de curaduría,
  // agrupado por categoría, máx 30 ítems).
  const previewSections = useMemo(() => {
    const catName = new Map(categories.map((c) => [c.id, c.name]))
    const byCat = new Map<string, AdminWhatsappProduct[]>()
    let count = 0
    for (const item of curated) {
      if (count >= 30) break
      const p = productById.get(item.product_id)
      if (!p) continue
      count++
      const title = (p.category_id ? catName.get(p.category_id) : null) ?? "Catálogo"
      const list = byCat.get(title) ?? []
      list.push(p)
      byCat.set(title, list)
    }
    return [...byCat.entries()].map(([title, prods]) => ({ title: title.slice(0, 24), products: prods }))
  }, [curated, productById, categories])

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

  // WC7 — agregar toda la vista filtrada (tope 50, doble clic de confirmación).
  const BULK_ADD_CAP = 50
  const handleBulkAdd = () => {
    if (!armBulkAdd) {
      setArmBulkAdd(true)
      return
    }
    setArmBulkAdd(false)
    run(
      async () => {
        if (!selectedCatalog) return 0
        const ids = available.slice(0, BULK_ADD_CAP).map((p) => p.id)
        return bulkAddWaCatalogProducts(selectedCatalog.id, ids)
      },
      (n) => `${n} productos agregados a la curaduría de ${selectedCatalog?.name}.`
    )
  }

  // WC7 — quitar los seleccionados de la curaduría.
  const handleBulkRemove = () =>
    run(
      async () => {
        if (!selectedCatalog) return 0
        const ids = [...selectedIds]
        const n = await bulkRemoveWaCatalogProducts(selectedCatalog.id, ids)
        setSelectedIds(new Set())
        setSelectionMode(false)
        return n
      },
      (n) => `${n} productos quitados de la curaduría.`
    )

  const toggleSelected = (productId: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
      return next
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

  // WC5 — soltar un producto sobre otro reordena la curaduría.
  const handleDrop = (targetId: number) =>
    run(async () => {
      if (!selectedCatalog || dragId == null || dragId === targetId) return
      const ids = curated.map((i) => i.product_id)
      const from = ids.indexOf(dragId)
      const to = ids.indexOf(targetId)
      if (from < 0 || to < 0) return
      ids.splice(to, 0, ...ids.splice(from, 1))
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

  // WC8 — cargar credenciales del catálogo al abrir el panel.
  const openCreds = () => {
    if (!selectedCatalog) return
    setConnTest(null)
    if (showCreds) {
      setShowCreds(false)
      return
    }
    setShowCreds(true)
    getWaCatalogCredentials(selectedCatalog.id)
      .then((c) => {
        setCredsPhoneId(c.phone_number_id ?? "")
        setCredsWabaId(c.waba_id ?? "")
        setCredsCatalogId(c.catalog_id ?? "")
        setCredsHasToken(c.hasToken)
        setCredsActive(c.is_active)
        setCredsToken("")
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar credenciales"))
  }

  const handleSaveCreds = (e: React.FormEvent) => {
    e.preventDefault()
    run(
      async () => {
        if (!selectedCatalog) return
        await updateWaCatalogCredentials(selectedCatalog.id, {
          phone_number_id: credsPhoneId.trim() || null,
          waba_id: credsWabaId.trim() || null,
          catalog_id: credsCatalogId.trim() || null,
          is_active: credsActive,
          ...(credsToken.trim() ? { accessToken: credsToken.trim() } : {}),
        })
        setCredsToken("")
        setCredsHasToken((prev) => prev || Boolean(credsToken.trim()))
      },
      () => "Credenciales guardadas."
    )
  }

  const handleClearToken = () =>
    run(
      async () => {
        if (!selectedCatalog) return
        await updateWaCatalogCredentials(selectedCatalog.id, { accessToken: "" })
        setCredsHasToken(false)
        setCredsToken("")
      },
      () => "Token eliminado: el catálogo usa la WABA de la plataforma."
    )

  // WC9 — probar la conexión a Meta con las credenciales efectivas.
  const handleTestConnection = () =>
    run(async () => {
      if (!selectedCatalog) return
      const r = await testWaCatalogConnection(selectedCatalog.id)
      setConnTest(
        r.ok
          ? {
              ok: true,
              text: `Conexión OK en ${r.latencyMs} ms${r.catalogName ? ` — catálogo "${r.catalogName}"` : ""}${r.usingPlatformFallback ? " (WABA plataforma)" : " (credenciales propias)"}.`,
            }
          : { ok: false, text: `Falló la conexión (${r.latencyMs} ms): ${r.error ?? "error desconocido"}` }
      )
    })

  // WD4 — abrir/cargar el explorador del catálogo vivo de Meta.
  const loadExplorer = useCallback(async () => {
    if (!selectedCatalog) return
    setExplorerLoading(true)
    try {
      const data = await getWaMetaCatalog(selectedCatalog.id)
      setExplorerRows(data.rows)
      setExplorerMetaTotal(data.metaTotal)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar el catálogo de Meta")
    } finally {
      setExplorerLoading(false)
    }
  }, [selectedCatalog])

  const toggleExplorer = () => {
    if (showExplorer) {
      setShowExplorer(false)
      return
    }
    setShowExplorer(true)
    setExplorerFilter("all")
    loadExplorer().catch(() => {})
  }

  const handleFixRow = (row: WaMetaCatalogRow) => {
    const productId = Number(row.retailer_id)
    if (!Number.isFinite(productId) || !selectedCatalog) return
    setFixingId(productId)
    run(
      async () => {
        const result = await pushWaProductToMeta(selectedCatalog.id, productId)
        if (!result.ok) throw new Error(result.error ?? "No se pudo corregir")
        await loadExplorer()
      },
      () => `"${row.name}" reenviado a Meta con los datos de la tienda.`
    ).finally(() => setFixingId(null))
  }

  // WD4 — contadores resumen del explorador.
  const explorerCounts = useMemo((): Record<WaMetaCatalogRow["status"], number> & { diffs: number } => {
    const counts: Record<WaMetaCatalogRow["status"], number> = {
      match: 0,
      price_diff: 0,
      sale_price_diff: 0,
      image_missing_meta: 0,
      only_meta: 0,
      only_store: 0,
    }
    for (const row of explorerRows) counts[row.status] += 1
    const diffs = counts.price_diff + counts.sale_price_diff + counts.image_missing_meta
    return { ...counts, diffs }
  }, [explorerRows])

  const filteredExplorerRows = useMemo(
    () => (explorerFilter === "all" ? explorerRows : explorerRows.filter((r) => r.status === explorerFilter)),
    [explorerRows, explorerFilter]
  )

  // WE4 — salud del catálogo (misma fórmula que computeCatalogHealth).
  const healthScore = useMemo(() => {
    const total = explorerRows.length
    if (total === 0) return 100
    return Math.round((explorerCounts.match / total) * 100)
  }, [explorerRows, explorerCounts])

  // WE4 — acciones directas sobre Meta.
  const handleToggleAvailability = (row: WaMetaCatalogRow) => {
    if (!selectedCatalog) return
    const inStock = row.metaAvailability !== "in stock"
    setTogglingId(row.retailer_id)
    run(
      async () => {
        const result = await setWaMetaProductAvailability(selectedCatalog.id, row.retailer_id, inStock)
        if (!result.ok) throw new Error(result.error ?? "No se pudo cambiar la disponibilidad")
        await loadExplorer()
      },
      () => `"${row.name}" ${inStock ? "activado" : "pausado"} en Meta.`
    ).finally(() => setTogglingId(null))
  }

  const handleDeleteMeta = (row: WaMetaCatalogRow) => {
    if (!selectedCatalog) return
    if (armDeleteId !== row.retailer_id) {
      setArmDeleteId(row.retailer_id)
      return
    }
    setArmDeleteId(null)
    run(
      async () => {
        const result = await deleteWaMetaProduct(selectedCatalog.id, row.retailer_id)
        if (!result.ok) throw new Error(result.error ?? "No se pudo eliminar")
        await loadExplorer()
      },
      () => `"${row.name}" eliminado del catálogo de Meta.`
    )
  }

  const handleFixAll = () => {
    if (!selectedCatalog) return
    setFixingAll(true)
    run(
      async () => {
        const result = await fixAllWaCatalogIssues(selectedCatalog.id)
        if (result.error) throw new Error(result.error)
        await loadExplorer()
        return result
      },
      (r) => `Corrección masiva: ${r.fixed} productos actualizados en Meta${r.skipped ? ` (${r.skipped} omitidos)` : ""}.`
    ).finally(() => setFixingAll(false))
  }

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
          <button
            onClick={toggleExplorer}
            disabled={!selectedCatalog}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E8E9EB] text-[var(--text-secondary)] font-semibold rounded-full hover:bg-[#F7F5F0] transition-colors text-sm disabled:opacity-60"
          >
            <Radar className="w-4 h-4" />
            Explorador Meta
          </button>
          <button
            onClick={openCreds}
            disabled={!selectedCatalog}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E8E9EB] text-[var(--text-secondary)] font-semibold rounded-full hover:bg-[#F7F5F0] transition-colors text-sm disabled:opacity-60"
          >
            <KeyRound className="w-4 h-4" />
            Credenciales
          </button>
          <button
            onClick={() => setShowPreview(true)}
            disabled={!selectedCatalog || curated.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E8E9EB] text-[var(--text-secondary)] font-semibold rounded-full hover:bg-[#F7F5F0] transition-colors text-sm disabled:opacity-60"
          >
            <Eye className="w-4 h-4" />
            Vista previa
          </button>
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

      {/* Panel: explorador del catálogo vivo de Meta (WD4) */}
      {showExplorer && selectedCatalog && (
        <div className="mb-6 bg-white rounded-2xl border border-[#E8E9EB] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="font-bold text-[#242529] flex items-center gap-2">
              <Radar className="w-4 h-4 text-[#0E7A0E]" />
              Catálogo vivo en Meta — {selectedCatalog.name}
            </h2>
            <button
              onClick={() => loadExplorer()}
              disabled={explorerLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0E7A0E] hover:bg-[#F2FBF5] rounded-full disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${explorerLoading ? "animate-spin" : ""}`} />
              Actualizar
            </button>
          </div>

          {/* Contadores resumen */}
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            {explorerMetaTotal} productos en Meta · {explorerCounts.match} sincronizados ·{" "}
            <span className={explorerCounts.diffs > 0 ? "text-amber-600 font-semibold" : ""}>
              {explorerCounts.diffs} con diferencias
            </span>
            {explorerCounts.only_meta > 0 && ` · ${explorerCounts.only_meta} solo en Meta`}
            {explorerCounts.only_store > 0 && ` · ${explorerCounts.only_store} solo en tienda`}
          </p>

          {/* Barra de salud + corrección masiva (WE4) */}
          {explorerRows.length > 0 && (
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-2 rounded-full bg-[#F0F1F2] overflow-hidden" role="img" aria-label={`Salud del catálogo: ${healthScore}%`}>
                <div
                  className={`h-full rounded-full transition-all ${
                    healthScore >= 90 ? "bg-emerald-500" : healthScore >= 70 ? "bg-amber-400" : "bg-red-500"
                  }`}
                  style={{ width: `${healthScore}%` }}
                />
              </div>
              <span className="text-xs font-bold text-[#242529] w-10 text-right">{healthScore}%</span>
              {explorerCounts.diffs + explorerCounts.only_store > 0 && (
                <button
                  onClick={handleFixAll}
                  disabled={busy || fixingAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0E7A0E] text-white text-xs font-bold hover:bg-[#0D720D] disabled:opacity-50"
                >
                  {fixingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                  Corregir {explorerCounts.diffs + explorerCounts.only_store} problema(s)
                </button>
              )}
            </div>
          )}

          {/* Filtros por estado */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(
              [
                ["all", "Todos"],
                ["match", "Sincronizados"],
                ["price_diff", "Precio difiere"],
                ["sale_price_diff", "Oferta difiere"],
                ["image_missing_meta", "Sin imagen en Meta"],
                ["only_meta", "Solo en Meta"],
                ["only_store", "Solo en tienda"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setExplorerFilter(value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  explorerFilter === value
                    ? "bg-[#0E7A0E] text-white"
                    : "bg-[#F5F3F0] text-[var(--text-secondary)] hover:bg-[#EDEAE4]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {explorerLoading && explorerRows.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-[#0E7A0E]" />
            </div>
          ) : filteredExplorerRows.length === 0 ? (
            <p className="text-sm text-[#B0B3B8] py-6 text-center">
              {explorerRows.length === 0 ? "El catálogo de Meta está vacío." : "Sin productos con este estado."}
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {filteredExplorerRows.map((row) => {
                const productId = Number(row.retailer_id)
                const fixable = row.status === "price_diff" || row.status === "sale_price_diff" || row.status === "image_missing_meta" || row.status === "only_store"
                return (
                  <li key={row.retailer_id} className="flex items-center gap-3 rounded-xl border border-[#F0F1F2] px-3 py-2">
                    {row.imageUrl ? (
                      <Image src={row.imageUrl} alt={row.name} width={36} height={36} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-[#F5F3F0] shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#242529] truncate">{row.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {row.metaPrice != null && `Meta: $${row.metaPrice.toFixed(2)}`}
                        {row.metaPrice != null && row.storePrice != null && " · "}
                        {row.storePrice != null && `Tienda: $${row.storePrice.toFixed(2)}`}
                        {row.metaReviewStatus && row.metaReviewStatus !== "approved" && (
                          <span className="ml-2 text-amber-600">revisión: {row.metaReviewStatus}</span>
                        )}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        row.status === "match"
                          ? "bg-emerald-50 text-emerald-700"
                          : row.status === "only_meta"
                            ? "bg-sky-50 text-sky-700"
                            : row.status === "only_store"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {row.status === "match" && "✓ sync"}
                      {row.status === "price_diff" && "precio difiere"}
                      {row.status === "sale_price_diff" && "oferta difiere"}
                      {row.status === "image_missing_meta" && "sin imagen"}
                      {row.status === "only_meta" && "solo Meta"}
                      {row.status === "only_store" && "solo tienda"}
                    </span>
                    {fixable && (
                      <button
                        onClick={() => handleFixRow(row)}
                        disabled={busy || fixingId === productId}
                        className="shrink-0 p-1.5 text-[#0E7A0E] hover:bg-[#E7F8EE] rounded-lg disabled:opacity-40"
                        aria-label={`Corregir ${row.name} en Meta`}
                        title="Corregir en Meta"
                      >
                        {fixingId === productId ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    {row.status !== "only_store" && (
                      <>
                        <button
                          onClick={() => handleToggleAvailability(row)}
                          disabled={busy || togglingId === row.retailer_id}
                          className="shrink-0 p-1.5 text-[#B0B3B8] hover:text-[#0E7A0E] hover:bg-[#E7F8EE] rounded-lg disabled:opacity-40"
                          aria-label={`${row.metaAvailability === "in stock" ? "Pausar" : "Activar"} ${row.name} en Meta`}
                          title={row.metaAvailability === "in stock" ? "Pausar en Meta" : "Activar en Meta"}
                        >
                          {togglingId === row.retailer_id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : row.metaAvailability === "in stock" ? (
                            <Pause className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteMeta(row)}
                          disabled={busy}
                          className={`shrink-0 px-1.5 py-1 rounded-lg text-[10px] font-bold disabled:opacity-40 ${
                            armDeleteId === row.retailer_id
                              ? "bg-red-600 text-white"
                              : "text-[#B0B3B8] hover:text-red-600 hover:bg-red-50"
                          }`}
                          aria-label={`Eliminar ${row.name} de Meta`}
                          title={armDeleteId === row.retailer_id ? "Confirmar eliminación" : "Eliminar de Meta"}
                        >
                          {armDeleteId === row.retailer_id ? "¿Eliminar?" : <Trash2 className="w-4 h-4" />}
                        </button>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Panel de credenciales del catálogo (WC8/WC9) */}
      {showCreds && selectedCatalog && (
        <div className="mb-6 bg-white rounded-2xl border border-[#E8E9EB] p-5">
          <h2 className="font-bold text-[#242529] flex items-center gap-2 mb-1">
            <KeyRound className="w-4 h-4 text-[#0E7A0E]" />
            Credenciales de {selectedCatalog.name}
          </h2>
          <p className="text-xs text-[var(--text-secondary)] mb-4">
            Vacías = usa la WABA de la plataforma (variables de entorno). El token se cifra y nunca se muestra.
          </p>
          <form onSubmit={handleSaveCreds} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#242529] mb-1">Phone Number ID</label>
              <input
                value={credsPhoneId}
                onChange={(e) => setCredsPhoneId(e.target.value)}
                placeholder="p. ej. 1234567890"
                className="w-full px-3 py-2 bg-white border border-[#E8E9EB] rounded-xl text-sm focus:outline-none focus:border-[#0E7A0E]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#242529] mb-1">WABA ID</label>
              <input
                value={credsWabaId}
                onChange={(e) => setCredsWabaId(e.target.value)}
                placeholder="p. ej. 9876543210"
                className="w-full px-3 py-2 bg-white border border-[#E8E9EB] rounded-xl text-sm focus:outline-none focus:border-[#0E7A0E]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#242529] mb-1">Catalog ID de Meta</label>
              <input
                value={credsCatalogId}
                onChange={(e) => setCredsCatalogId(e.target.value)}
                placeholder="p. ej. 555666777"
                className="w-full px-3 py-2 bg-white border border-[#E8E9EB] rounded-xl text-sm focus:outline-none focus:border-[#0E7A0E]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#242529] mb-1">
                Access token {credsHasToken && <span className="text-[#0E7A0E]">✓ configurado</span>}
              </label>
              <input
                type="password"
                value={credsToken}
                onChange={(e) => setCredsToken(e.target.value)}
                placeholder={credsHasToken ? "•••••••• (escribe para reemplazar)" : "Pegar token de Meta"}
                autoComplete="off"
                className="w-full px-3 py-2 bg-white border border-[#E8E9EB] rounded-xl text-sm focus:outline-none focus:border-[#0E7A0E]"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-[#242529] sm:col-span-2">
              <input
                type="checkbox"
                checked={credsActive}
                onChange={(e) => setCredsActive(e.target.checked)}
                className="accent-[#0E7A0E]"
              />
              Catálogo activo (participa en syncs automáticos)
            </label>
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 bg-[#0F7A3D] text-white text-sm font-bold rounded-full hover:bg-[#0F6B3A] disabled:opacity-60"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={busy}
                className="px-4 py-2 bg-white border border-[#0E7A0E]/40 text-[#0E7A0E] text-sm font-semibold rounded-full hover:bg-[#F2FBF5] disabled:opacity-60"
              >
                Probar conexión
              </button>
              {credsHasToken && (
                <button
                  type="button"
                  onClick={handleClearToken}
                  disabled={busy}
                  className="px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-full disabled:opacity-60"
                >
                  Quitar token (usar plataforma)
                </button>
              )}
            </div>
          </form>
          {connTest && (
            <p className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${connTest.ok ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-700"}`}>
              {connTest.text}
            </p>
          )}
        </div>
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#B0B3B8]">{curated.length} productos</span>
                {curated.length > 0 && (
                  <button
                    onClick={() => {
                      setSelectionMode((v) => !v)
                      setSelectedIds(new Set())
                    }}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                      selectionMode
                        ? "bg-[#0E7A0E] text-white"
                        : "bg-[#F5F3F0] text-[var(--text-secondary)] hover:bg-[#EDEAE4]"
                    }`}
                  >
                    {selectionMode ? "Listo" : "Seleccionar"}
                  </button>
                )}
              </div>
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
                  if (selectionMode) {
                    const checked = selectedIds.has(item.product_id)
                    return (
                      <label
                        key={item.product_id}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 cursor-pointer transition-colors ${
                          checked ? "border-red-300 bg-red-50" : "border-[#25D366]/20 bg-[#F2FBF5]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSelected(item.product_id)}
                          className="accent-red-600"
                          aria-label={`Seleccionar ${p.name}`}
                        />
                        <span className="w-6 text-xs font-black text-[#0E7A0E]">{idx + 1}</span>
                        <span className="flex-1 min-w-0 text-sm font-semibold text-[#242529] truncate">{p.name}</span>
                      </label>
                    )
                  }
                  return (
                    <div
                      key={item.product_id}
                      draggable
                      onDragStart={() => setDragId(item.product_id)}
                      onDragOver={(e) => {
                        e.preventDefault()
                        if (dragOverId !== item.product_id) setDragOverId(item.product_id)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        handleDrop(item.product_id).catch(() => {})
                      }}
                      onDragEnd={() => {
                        setDragId(null)
                        setDragOverId(null)
                      }}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
                        dragOverId === item.product_id && dragId !== item.product_id
                          ? "border-[#0E7A0E] bg-[#E7F8EE] ring-2 ring-[#0E7A0E]/30"
                          : "border-[#25D366]/20 bg-[#F2FBF5]"
                      } ${dragId === item.product_id ? "opacity-50" : ""}`}
                    >
                      <span
                        className="cursor-grab active:cursor-grabbing text-[#B0B3B8] hover:text-[#0E7A0E] touch-none"
                        aria-label={`Arrastrar para reordenar ${p.name}`}
                      >
                        <GripVertical className="w-4 h-4" />
                      </span>
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

            {/* Barra de acciones de selección múltiple (WC7) */}
            {selectionMode && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={handleBulkRemove}
                  disabled={busy || selectedIds.size === 0}
                  className="px-4 py-2 rounded-full bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-40"
                >
                  Quitar {selectedIds.size} seleccionado(s)
                </button>
                <button
                  onClick={() => {
                    setSelectionMode(false)
                    setSelectedIds(new Set())
                  }}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-[var(--text-secondary)] hover:bg-[#F7F5F0]"
                >
                  Cancelar
                </button>
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

            {/* Agregado masivo de la vista filtrada (WC7) */}
            {available.length > 0 && (
              <button
                onClick={handleBulkAdd}
                disabled={busy}
                className={`w-full mb-3 px-3 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-60 ${
                  armBulkAdd
                    ? "bg-[#0E7A0E] text-white hover:bg-[#0D720D]"
                    : "bg-[#E7F8EE] text-[#0E7A0E] hover:bg-[#D5F1E0]"
                }`}
              >
                {armBulkAdd
                  ? `¿Confirmar? Agregar ${Math.min(available.length, BULK_ADD_CAP)} productos a la curaduría`
                  : `Agregar toda la vista (${Math.min(available.length, BULK_ADD_CAP)}${available.length > BULK_ADD_CAP ? ` de ${available.length}` : ""})`}
              </button>
            )}

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

      {/* Modal: vista previa como cliente (WC6) */}
      {showPreview && selectedCatalog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Vista previa del catálogo"
        >
          <div className="w-full max-w-sm bg-[#ECE5DD] rounded-2xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between bg-[#075E54] text-white px-4 py-3">
              <h3 className="font-bold text-sm">Así lo verá tu cliente</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1 text-white/70 hover:text-white"
                aria-label="Cerrar vista previa"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 max-h-[70vh] overflow-y-auto">
              {/* Burbuja del mensaje product_list */}
              <div className="bg-white rounded-xl rounded-tl-none shadow-sm p-3 max-w-[95%]">
                <p className="font-bold text-[#242529] text-sm">{selectedCatalog.name}</p>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 mb-3">
                  Elige tus productos y te los llevamos:
                </p>
                {previewSections.map((section) => (
                  <div key={section.title} className="mb-3">
                    <p className="text-[11px] font-bold text-[#0E7A0E] uppercase tracking-wide mb-1">
                      {section.title}
                    </p>
                    <ul className="divide-y divide-[#F0F1F2]">
                      {section.products.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 py-1.5">
                          {p.image_url ? (
                            <Image
                              src={p.image_url}
                              alt={p.name}
                              width={32}
                              height={32}
                              className="w-8 h-8 rounded-lg object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-[#F5F3F0] shrink-0" />
                          )}
                          <span className="flex-1 min-w-0 text-xs text-[#242529] truncate">{p.name}</span>
                          <span className="text-xs font-semibold text-[#242529]">
                            ${(p.sale_price ?? p.price ?? 0).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="text-[10px] text-[#B0B3B8] mt-2">Resurte.me</p>
              </div>
              <p className="text-[11px] text-center text-[#8696A0] mt-3">
                Máximo 30 productos por mensaje, en tu orden exacto.
              </p>
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
