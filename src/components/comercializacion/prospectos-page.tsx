"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Search,
  Plus,
  MoreVertical,
  PhoneCall,
  Link2,
  Trash2,
  ExternalLink,
  Users,
  Upload,
  Download,
  Tag,
} from "lucide-react"
import {
  Button,
  Input,
  Select,
  Badge,
  EmptyState,
  StatusBadge,
  Spinner,
  ConfirmDialog,
} from "./ui"
import { ProspectFormModal } from "@/components/crm/ProspectFormModal"
import { ActivityFormModal } from "@/components/crm/ActivityFormModal"
import { PipelineView } from "./pipeline-view"
import { ImportCsvModal } from "@/components/crm/ImportCsvModal"
import { useToast } from "@/components/toast"
import type { Prospect, ProspectStatus } from "@/lib/comercializacion/types"
import { PROSPECT_STATUS_LABEL } from "@/lib/comercializacion/types"
import { formatDateTime } from "@/lib/comercializacion/dates"
import { WhatsappTemplateMenu } from "./whatsapp-templates"
import {
  addActivity,
  bulkCreateProspects,
  bulkTagProspects,
  createProspect,
  deleteProspect,
  findDuplicatesByPhone,
  getProspects,
  updateActivity,
  updateProspect,
} from "@/lib/comercializacion/actions"
import { toCsv, downloadCsv } from "@/lib/comercializacion/csv"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import { CRM_PAGE_SIZE } from "@/lib/crm-filters"
import { parseTagInput, tagLabel, tagMatches } from "@/lib/crm-tags"

/**
 * Filas por página. Es el mismo número que usa el tablero de `/admin/leads`
 * (`CRM_PAGE_SIZE`): la lista del vendedor y el panel del admin tienen que
 * paginar igual para que "Cargar más" signifique lo mismo en las dos.
 */
export const PAGE_SIZE = CRM_PAGE_SIZE

/**
 * Los comandos del formulario compartido, en una constante de módulo para que la
 * identidad de `findDuplicates` no cambie en cada render: el modal la usa como
 * dependencia de efecto y una función nueva por render dispararía la consulta de
 * duplicados en bucle.
 */
const FORM_ACTIONS = {
  create: createProspect,
  update: updateProspect,
  findDuplicates: findDuplicatesByPhone,
}

/** Comandos del formulario de actividad del vendedor. */
const ACTIVITY_ACTIONS = { create: addActivity, update: updateActivity }

/** Comandos de la importación CSV del vendedor. */
const IMPORT_ACTIONS = { import: bulkCreateProspects, findDuplicates: findDuplicatesByPhone }

interface CityOption {
  id: number
  name: string
  state: string
}

export function ProspectosPage({
  initialProspects,
  cities,
}: {
  initialProspects: Prospect[]
  cities: CityOption[]
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const { toast } = useToast()

  const [prospects, setProspects] = useState<Prospect[]>(initialProspects)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialProspects.length === PAGE_SIZE)
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<ProspectStatus | "todos">("todos")
  const [view, setView] = useState<"todos" | "por_contactar" | "contactados">("todos")
  const [layout, setLayout] = useState<"lista" | "pipeline">("lista")
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Prospect | null>(null)
  const [activityFor, setActivityFor] = useState<Prospect | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [copied, setCopied] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Prospect | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showImport, setShowImport] = useState(false)
  // El filtro por etiqueta vive en la URL igual que en `/admin/leads`: un enlace
  // a "mis prospectos vip" tiene que poder pegarse en un chat.
  const [tag, setTag] = useState(() => (searchParams.get("tag") ?? "").trim())
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [bulkTagDraft, setBulkTagDraft] = useState("")
  const [bulkBusy, setBulkBusy] = useState(false)

  // Cerrar el menú "⋯" con click fuera o Escape
  useEffect(() => {
    if (menuFor === null) return
    const onClick = () => setMenuFor(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuFor(null)
    }
    document.addEventListener("click", onClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("click", onClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [menuFor])

  const openCreate = searchParams.get("nuevo") === "1"

  useEffect(() => {
    if (!openCreate) return
    const timeout = setTimeout(() => setShowForm(true), 0)
    return () => clearTimeout(timeout)
  }, [openCreate])

  async function reload() {
    setLoading(true)
    try {
      const data = await getProspects({
        q,
        status,
        onlyPending: view === "por_contactar",
        limit: PAGE_SIZE,
      })
      setProspects(view === "contactados" ? data.filter((p) => p.status !== "nuevo") : data)
      setHasMore(data.length === PAGE_SIZE)
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar", "error")
    } finally {
      setLoading(false)
    }
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const data = await getProspects({
        q,
        status,
        onlyPending: view === "por_contactar",
        limit: PAGE_SIZE,
        offset: prospects.length,
      })
      const more = view === "contactados" ? data.filter((p) => p.status !== "nuevo") : data
      setProspects((prev) => {
        const seen = new Set(prev.map((p) => p.id))
        return [...prev, ...more.filter((p) => !seen.has(p.id))]
      })
      setHasMore(data.length === PAGE_SIZE)
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar más", "error")
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(reload, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, view])

  const filtered = useMemo(() => {
    if (view === "por_contactar") {
      const now = new Date().toISOString()
      return prospects.filter(
        (p) =>
          p.status === "nuevo" || (p.next_follow_up_at && p.next_follow_up_at <= now)
      )
    }
    return prospects
  }, [prospects, view])

  /**
   * El filtro por etiqueta se aplica en memoria, sobre lo ya cargado — igual que
   * en `/admin/leads`. Filtrar en el servidor exigiría un operador de arreglo en
   * PostgREST (`cs`) y dejaría fuera el caso de "sin etiquetas".
   */
  const tagged = useMemo(
    () => (tag ? filtered.filter((p) => (p.tags ?? []).some((t) => tagMatches(t, tag))) : filtered),
    [filtered, tag],
  )

  /** Etiquetas presentes en lo cargado, para el selector. */
  const tagOptions = useMemo(() => {
    const known = new Set<string>()
    for (const p of prospects) for (const t of p.tags ?? []) known.add(t)
    const sorted = [...known].sort((a, b) => a.localeCompare(b, "es"))
    return tag && !known.has(tag) ? [tag, ...sorted] : sorted
  }, [prospects, tag])

  function changeTag(next: string) {
    setTag(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next) params.set("tag", next)
    else params.delete("tag")
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => (prev.length === tagged.length ? [] : tagged.map((p) => p.id)))
  }

  async function applyBulkTags(mode: "add" | "remove") {
    const add = mode === "add" ? parseTagInput(bulkTagDraft) : []
    const remove = mode === "remove" ? parseTagInput(tag) : []
    if (add.length === 0 && remove.length === 0) return
    setBulkBusy(true)
    try {
      const touched = await bulkTagProspects(selectedIds, add, remove)
      toast(
        mode === "add"
          ? `${touched} prospecto(s) etiquetados`
          : `${touched} prospecto(s) sin «${tagLabel(tag)}»`,
      )
      setBulkTagDraft("")
      setSelectedIds([])
      await reload()
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al etiquetar", "error")
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleCopyLink(prospect: Prospect) {
    const code = prospect.referral_code
    if (!code) {
      toast("Este prospecto aún no tiene código de registro", "warning")
      return
    }
    const url = `${window.location.origin}/registro?ref=${code}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(prospect.id)
      toast("Link de registro copiado ✅")
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast("No se pudo copiar", "error")
    }
  }

  async function performDelete() {
    if (!deleting) return
    setDeleteLoading(true)
    try {
      await deleteProspect(deleting.id)
      setProspects((prev) => prev.filter((p) => p.id !== deleting.id))
      toast("Prospecto eliminado")
      setDeleting(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al eliminar", "error")
    } finally {
      setDeleteLoading(false)
    }
  }

  function exportCsv() {
    const rows = tagged.map((p) => [
      p.name,
      p.restaurant_name,
      p.phone,
      p.whatsapp,
      p.email,
      p.city_name,
      PROSPECT_STATUS_LABEL[p.status],
      p.last_contact_at,
      p.next_follow_up_at,
      p.notes,
    ])
    downloadCsv(
      `prospectos-${dayKeyOf(DEFAULT_TIMEZONE)}.csv`,
      toCsv(
        ["nombre", "restaurante", "telefono", "whatsapp", "email", "ciudad", "estado", "ultimo_contacto", "proximo_seguimiento", "notas"],
        rows
      )
    )
    toast(`${tagged.length} prospecto(s) exportados`)
  }

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Prospectos</h1>
          <p className="text-sm text-gray-500">
            Lleva el control de con quién te has comunicado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={tagged.length === 0}>
            <Download className="w-4 h-4" />
            Exportar
          </Button>
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="w-4 h-4" />
            Importar CSV
          </Button>
          <Button
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
          >
            <Plus className="w-4 h-4" />
            Nuevo prospecto
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre, restaurante, teléfono…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select
            className="!w-auto"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProspectStatus | "todos")}
          >
            <option value="todos">Todos los estados</option>
            <option value="nuevo">Nuevo</option>
            <option value="contactado">Contactado</option>
            <option value="en_seguimiento">En seguimiento</option>
            <option value="cliente_activo">Cliente activo</option>
            <option value="inactivo">Inactivo</option>
            <option value="perdido">Perdido</option>
          </Select>
          {tagOptions.length > 0 || tag ? (
            <Select
              className="!w-auto"
              value={tag}
              onChange={(e) => changeTag(e.target.value)}
              aria-label="Filtrar por etiqueta"
            >
              <option value="">Todas las etiquetas</option>
              {tagOptions.map((t) => (
                <option key={t} value={t}>
                  🏷️ {tagLabel(t)}
                </option>
              ))}
            </Select>
          ) : null}
        </div>

        {/* Vistas rápidas + toggle lista/pipeline */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {([
              { key: "todos", label: "Todos" },
              { key: "por_contactar", label: "🕐 Por contactar" },
              { key: "contactados", label: "✅ Contactados" },
            ] as const).map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  view === v.key
                    ? "bg-[#0E7A0E] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {([
              { key: "lista", label: "Lista" },
              { key: "pipeline", label: "Pipeline" },
            ] as const).map((l) => (
              <button
                key={l.key}
                onClick={() => setLayout(l.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  layout === l.key
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {l.label}
              </button>
            ))}
            {layout === "lista" ? (
              <button
                onClick={() => {
                  setSelecting((v) => !v)
                  setSelectedIds([])
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  selecting
                    ? "bg-[#0E7A0E] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                title="Etiquetar varios prospectos a la vez"
              >
                {selecting ? "Cancelar" : "Seleccionar"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {selecting ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-600">
            {selectedIds.length} de {tagged.length} seleccionados
          </span>
          <Button variant="outline" onClick={toggleSelectAll} disabled={tagged.length === 0}>
            {selectedIds.length > 0 && selectedIds.length === tagged.length
              ? "Quitar selección"
              : "Seleccionar todo"}
          </Button>
          <Input
            className="!w-auto flex-1 min-w-[180px]"
            placeholder="Etiquetas separadas por coma"
            value={bulkTagDraft}
            onChange={(e) => setBulkTagDraft(e.target.value)}
            aria-label="Etiquetas a añadir"
          />
          <Button
            disabled={bulkBusy || selectedIds.length === 0 || !bulkTagDraft.trim()}
            onClick={() => void applyBulkTags("add")}
          >
            <Tag className="w-4 h-4" />
            Etiquetar
          </Button>
          <Button
            variant="outline"
            disabled={bulkBusy || selectedIds.length === 0 || !tag}
            title={tag ? undefined : "Elige una etiqueta en el filtro para poder quitarla"}
            onClick={() => void applyBulkTags("remove")}
          >
            {tag ? `Quitar «${tagLabel(tag)}»` : "Quitar etiqueta"}
          </Button>
        </div>
      ) : null}

      {/* Lista o pipeline */}
      {layout === "pipeline" ? (
        loading ? (
          <div className="flex justify-center py-12 bg-white rounded-2xl border border-gray-100">
            <Spinner />
          </div>
        ) : (
          <PipelineView prospects={tagged} onChanged={reload} />
        )
      ) : (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : tagged.length === 0 ? (
          <EmptyState
            title={tag ? "Ningún prospecto con esa etiqueta" : "No hay prospectos"}
            subtitle={
              tag
                ? `Ninguno de los prospectos cargados lleva «${tagLabel(tag)}».`
                : view === "por_contactar"
                  ? "No tienes prospectos por contactar 🎉"
                  : "Crea tu primer prospecto para empezar a hacer seguimiento."
            }
            action={
              <Button
                onClick={() => {
                  setEditing(null)
                  setShowForm(true)
                }}
              >
                <Plus className="w-4 h-4" />
                Crear prospecto
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-gray-50">
            {tagged.map((p) => {
              const waPhone = p.whatsapp ?? p.phone
              return (
                <li key={p.id} className="relative">
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    {selecting ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={() => toggleSelected(p.id)}
                        className="w-4 h-4 shrink-0 rounded border-gray-300 accent-[#0E7A0E]"
                        aria-label={`Seleccionar ${p.name}`}
                      />
                    ) : null}
                    <Link
                      href={`/comercializacion/prospectos/${p.id}`}
                      className="min-w-0 flex-1 group"
                    >
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-[#0E7A0E]">
                          {p.name}
                        </p>
                        <StatusBadge status={p.status} />
                        {p.user_id ? (
                          <Badge color="green">🔗 Cuenta</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {p.restaurant_name ? `${p.restaurant_name} · ` : ""}
                        {p.phone ?? "Sin teléfono"}
                      </p>
                      {p.tags && p.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.tags.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                changeTag(tagMatches(t, tag) ? "" : t)
                              }}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                                tagMatches(t, tag)
                                  ? "bg-[#0E7A0E] text-white border-[#0E7A0E]"
                                  : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                              }`}
                            >
                              {tagLabel(t)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {p.next_follow_up_at ? (
                        <p className="text-[11px] text-amber-600 mt-0.5">
                          Seguimiento: {formatDateTime(p.next_follow_up_at)}
                        </p>
                      ) : null}
                    </Link>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <WhatsappTemplateMenu
                        phone={waPhone}
                        vars={{
                          nombre: p.name,
                          restaurante: p.restaurant_name,
                        }}
                        onUsed={() => setActivityFor(p)}
                      />
                      <button
                        onClick={() => setActivityFor(p)}
                        className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
                        title="Registrar llamada / actividad"
                      >
                        <PhoneCall className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleCopyLink(p)}
                        className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
                        title="Copiar link de registro"
                      >
                        {copied === p.id ? (
                          <span className="text-[#0E7A0E] text-[10px] font-bold">✓</span>
                        ) : (
                          <Link2 className="w-4 h-4" />
                        )}
                      </button>
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setMenuFor(menuFor === p.id ? null : p.id)
                          }}
                          className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
                          title="Más opciones"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {menuFor === p.id ? (
                          <div
                            className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-gray-100 shadow-lg z-20 py-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Link
                              href={`/comercializacion/prospectos/${p.id}`}
                              onClick={() => setMenuFor(null)}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Ver detalle
                            </Link>
                            <button
                              onClick={() => {
                                setEditing(p)
                                setMenuFor(null)
                                setShowForm(true)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <Users className="w-3.5 h-3.5" />
                              Editar
                            </button>
                            <button
                              onClick={() => {
                                setMenuFor(null)
                                setDeleting(p)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Eliminar
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {!loading && tagged.length > 0 && hasMore ? (
          <div className="border-t border-gray-100 px-4 py-3 flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <Spinner className="w-4 h-4" /> : null}
              Cargar más
            </Button>
          </div>
        ) : null}
      </div>
      )}

      <ProspectFormModal
        open={showForm}
        onClose={() => {
          setShowForm(false)
          setEditing(null)
        }}
        prospect={editing}
        cities={cities}
        actions={FORM_ACTIONS}
        onSaved={() => {
          toast(editing ? "Prospecto actualizado" : "Prospecto creado 🎉")
          reload()
        }}
      />

      <ActivityFormModal
        open={!!activityFor}
        onClose={() => setActivityFor(null)}
        prospectId={activityFor?.id ?? 0}
        actions={ACTIVITY_ACTIONS}
        onSaved={() => {
          toast("Actividad registrada ✅")
          reload()
        }}
      />

      <ImportCsvModal
        open={showImport}
        actions={IMPORT_ACTIONS}
        onClose={() => setShowImport(false)}
        onImported={reload}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={performDelete}
        loading={deleteLoading}
        title="Eliminar prospecto"
        message={
          <>
            ¿Eliminar a <strong>{deleting?.name}</strong>? Esta acción no se
            puede deshacer.
          </>
        }
      />
    </div>
  )
}
