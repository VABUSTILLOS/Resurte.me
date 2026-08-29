"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Search,
  Plus,
  MoreVertical,
  PhoneCall,
  MessageCircle,
  Link2,
  Trash2,
  ExternalLink,
  Users,
  Upload,
  Download,
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
import { ProspectFormModal } from "./prospect-form"
import { ActivityFormModal } from "./activity-form"
import { PipelineView } from "./pipeline-view"
import { ImportCsvModal } from "./import-csv-modal"
import { useToast } from "@/components/toast"
import type { Prospect, ProspectStatus } from "@/lib/comercializacion/types"
import { PROSPECT_STATUS_LABEL } from "@/lib/comercializacion/types"
import { formatDateTime } from "@/lib/comercializacion/dates"
import { buildWhatsappLink } from "@/lib/comercializacion/whatsapp"
import { getProspects, deleteProspect } from "@/lib/comercializacion/actions"
import { toCsv, downloadCsv } from "@/lib/comercializacion/csv"

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
  const { toast } = useToast()

  const [prospects, setProspects] = useState<Prospect[]>(initialProspects)
  const [loading, setLoading] = useState(false)
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
      const data = await getProspects({ q, status, onlyPending: view === "por_contactar" })
      setProspects(data)
      if (view === "contactados") {
        setProspects(data.filter((p) => p.status !== "nuevo"))
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Error al cargar", "error")
    } finally {
      setLoading(false)
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
    const rows = filtered.map((p) => [
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
      `prospectos-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        ["nombre", "restaurante", "telefono", "whatsapp", "email", "ciudad", "estado", "ultimo_contacto", "proximo_seguimiento", "notas"],
        rows
      )
    )
    toast(`${filtered.length} prospecto(s) exportados`)
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
          <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
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
          </div>
        </div>
      </div>

      {/* Lista o pipeline */}
      {layout === "pipeline" ? (
        loading ? (
          <div className="flex justify-center py-12 bg-white rounded-2xl border border-gray-100">
            <Spinner />
          </div>
        ) : (
          <PipelineView prospects={filtered} onChanged={reload} />
        )
      ) : (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No hay prospectos"
            subtitle={
              view === "por_contactar"
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
            {filtered.map((p) => {
              const waLink = buildWhatsappLink(p.whatsapp ?? p.phone, `¡Hola ${p.name.split(" ")[0]}! 👋 Te escribo de Resurte.me.`)
              return (
                <li key={p.id} className="relative">
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
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
                      {p.next_follow_up_at ? (
                        <p className="text-[11px] text-amber-600 mt-0.5">
                          Seguimiento: {formatDateTime(p.next_follow_up_at)}
                        </p>
                      ) : null}
                    </Link>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {waLink ? (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            setActivityFor({
                              ...p,
                              whatsapp: p.whatsapp,
                            } as Prospect)
                          }
                          className="p-2 rounded-xl text-[#128C4A] hover:bg-[#25D366]/10 transition-colors"
                          title="WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </a>
                      ) : null}
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
        onSaved={() => {
          toast(editing ? "Prospecto actualizado" : "Prospecto creado 🎉")
          reload()
        }}
      />

      <ActivityFormModal
        open={!!activityFor}
        onClose={() => setActivityFor(null)}
        prospectId={activityFor?.id ?? 0}
        onSaved={() => {
          toast("Actividad registrada ✅")
          reload()
        }}
      />

      <ImportCsvModal
        open={showImport}
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
