"use client"

import { useEffect, useState } from "react"
import {
  Truck,
  MessageCircle,
  Phone,
  Mail,
  Globe,
  MapPin,
  FileText,
  Eye,
  EyeOff,
  RefreshCw,
  Download,
  Plus,
  Pencil,
  Trash2,
  Link2,
  Star,
} from "lucide-react"
import { toCsv, downloadCsv } from "@/lib/csv"
import { DEFAULT_TIMEZONE, dayKeyOf } from "@/lib/local-date"
import type { SupplierStatus } from "@/lib/supplier-admin"
import {
  ProductLinkForm,
  SupplierForm,
  type LinkFormValues,
  type SupplierFormValues,
} from "./supplier-forms"

// ============================================================
// /admin/proveedores — Directorio de proveedores con costos de
// lista y contacto directo por WhatsApp (tablas suppliers y
// product_suppliers, migración 00066).
// Los costos solo salen por /api/admin/suppliers (service role +
// requireAdmin); RLS no expone estas tablas al público.
// ============================================================

interface SupplierProduct {
  id: number
  product_id: number
  supplier_sku: string | null
  presentation: string | null
  cost: number | null
  list_date: string | null
  is_primary: boolean
  notes: string | null
  products: {
    id: number
    name: string
    slug: string
    price: number
    is_visible: boolean
    stock_status: string
  } | null
}

interface Supplier {
  id: number
  name: string
  slug: string
  contact_name: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  status: SupplierStatus
  notes: string | null
  products: SupplierProduct[]
}

const STATUS_STYLE: Record<SupplierStatus, { label: string; classes: string }> = {
  prospecto: { label: "Prospecto", classes: "bg-gray-100 text-gray-600" },
  localizado: { label: "Localizado", classes: "bg-gray-100 text-gray-700" },
  verificado: { label: "Verificado", classes: "bg-blue-100 text-blue-700" },
  contactado: { label: "Contactado", classes: "bg-amber-100 text-amber-700" },
  cotizado: { label: "Cotizado", classes: "bg-purple-100 text-purple-700" },
  aprobado: { label: "Aprobado", classes: "bg-green-100 text-green-700" },
  activo: { label: "Activo", classes: "bg-green-700 text-white" },
}

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
})

function whatsappUrl(supplier: Supplier): string | null {
  if (!supplier.whatsapp) return null
  const digits = supplier.whatsapp.replace(/\D/g, "")
  if (!digits) return null
  const text = encodeURIComponent(
    `Hola ${supplier.name}, te contacto de Resurte.me (central de abastos digital en Chihuahua). Quiero confirmar precios y disponibilidad de su lista de mayoreo.`
  )
  return `https://wa.me/${digits}?text=${text}`
}

export default function ProveedoresPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [linkingSupplierId, setLinkingSupplierId] = useState<number | null>(null)
  const [editingLink, setEditingLink] = useState<{ supplierId: number; link: SupplierProduct } | null>(
    null
  )

  async function fetchSuppliers(): Promise<Supplier[]> {
    const res = await fetch("/api/admin/suppliers")
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error ?? "No autorizado o error del servidor")
    }
    return data.suppliers ?? []
  }

  function load() {
    setLoading(true)
    setError(null)
    fetchSuppliers()
      .then(setSuppliers)
      .catch((e) => {
        setError(e instanceof Error ? e.message : "No se pudo cargar el directorio")
        setSuppliers([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    fetchSuppliers()
      .then((s) => {
        if (!cancelled) setSuppliers(s)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "No se pudo cargar el directorio")
          setSuppliers([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Cerrar los formularios y recargar. La API de edición devuelve sólo
  // unas columnas, así que el estado se reconstruye desde el servidor en
  // vez de parchearse a mano en el cliente y quedar desincronizado.
  function afterSave() {
    setCreating(false)
    setEditingId(null)
    setLinkingSupplierId(null)
    setEditingLink(null)
    load()
  }

  function toFormValues(s: Supplier): SupplierFormValues {
    return {
      name: s.name,
      contact_name: s.contact_name ?? "",
      phone: s.phone ?? "",
      whatsapp: s.whatsapp ?? "",
      email: s.email ?? "",
      website: s.website ?? "",
      address: s.address ?? "",
      city: s.city ?? "",
      state: s.state ?? "",
      status: s.status,
      notes: s.notes ?? "",
    }
  }

  function toLinkValues(p: SupplierProduct): LinkFormValues {
    return {
      supplier_sku: p.supplier_sku ?? "",
      presentation: p.presentation ?? "",
      cost: p.cost != null ? String(p.cost) : "",
      list_date: p.list_date ?? "",
      is_primary: p.is_primary,
      notes: p.notes ?? "",
    }
  }

  async function deleteSupplier(s: Supplier) {
    const linked = s.products.length
    const message =
      linked > 0
        ? `¿Borrar a ${s.name}? Se pierden ${linked} producto(s) vinculado(s) con su costo de lista y presentación. Esto no se puede deshacer.`
        : `¿Borrar a ${s.name}? Esto no se puede deshacer.`
    if (!window.confirm(message)) return

    try {
      // `?confirm=1` porque la API se niega a borrar en silencio un
      // proveedor con costos capturados; el confirm de arriba ya mostró
      // cuántos se pierden.
      const res = await fetch(`/api/admin/suppliers/${s.id}?confirm=1`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "No se pudo borrar el proveedor")
      afterSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar el proveedor")
    }
  }

  async function unlinkProduct(supplier: Supplier, link: SupplierProduct) {
    const name = link.products?.name ?? `producto #${link.product_id}`
    if (!window.confirm(`¿Desvincular ${name} de ${supplier.name}?`)) return
    try {
      const res = await fetch(`/api/admin/suppliers/${supplier.id}/products/${link.id}`, {
        method: "DELETE",
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "No se pudo desvincular el producto")
      afterSave()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo desvincular el producto")
    }
  }


  const totalProductos = suppliers.reduce((acc, s) => acc + s.products.length, 0)
  const conCosto = suppliers.reduce(
    (acc, s) => acc + s.products.filter((p) => p.cost != null).length,
    0
  )

  // Exporta el directorio completo: una fila por producto vinculado (o por
  // proveedor sin productos), con costos de lista para análisis en Excel.
  function exportCsv() {
    const rows: (string | number | null)[][] = []
    for (const s of suppliers) {
      const base = [
        s.name,
        s.contact_name,
        s.phone,
        s.whatsapp,
        s.email,
        s.city,
        s.state,
        STATUS_STYLE[s.status]?.label ?? s.status,
      ]
      if (s.products.length === 0) {
        rows.push([...base, "", "", "", ""])
      } else {
        for (const p of s.products) {
          rows.push([
            ...base,
            p.products?.name ?? `#${p.product_id}`,
            p.presentation,
            p.cost != null ? p.cost.toFixed(2) : "",
            p.is_primary ? "Sí" : "No",
          ])
        }
      }
    }
    const csv = toCsv(
      ["Proveedor", "Contacto", "Teléfono", "WhatsApp", "Email", "Ciudad", "Estado (ubicación)", "Estatus", "Producto", "Presentación", "Costo", "Principal"],
      rows
    )
    const stamp = dayKeyOf(DEFAULT_TIMEZONE)
    downloadCsv(`proveedores-${stamp}.csv`, csv)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gray-900 flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Proveedores</h1>
            <p className="text-sm text-gray-500">
              Directorio con costos de lista y contacto directo por WhatsApp
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setCreating(true)
              setEditingId(null)
            }}
            disabled={creating}
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo proveedor
          </button>
          <button
            onClick={() => {
              setCreating(true)
              setEditingId(null)
            }}
            disabled={creating}
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo proveedor
          </button>
          <button
            onClick={exportCsv}
            disabled={loading || suppliers.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full bg-white border border-gray-200 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>
      </div>

      {creating && (
        <div className="mb-6">
          <SupplierForm onSaved={afterSave} onCancel={() => setCreating(false)} />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{suppliers.length}</p>
          <p className="text-xs text-gray-500">proveedores</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{totalProductos}</p>
          <p className="text-xs text-gray-500">productos vinculados</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{conCosto}</p>
          <p className="text-xs text-gray-500">con costo de lista</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm mb-6">
          {error}
        </div>
      )}

      {!loading && !error && suppliers.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-500">
          Aún no hay proveedores dados de alta.
        </div>
      )}

      <div className="space-y-6">
        {suppliers.map((s) => {
          const wa = whatsappUrl(s)
          const status = STATUS_STYLE[s.status] ?? STATUS_STYLE.prospecto
          return (
            <section
              key={s.id}
              className="bg-white rounded-2xl border border-gray-200 overflow-hidden"
            >
              {/* Supplier header */}
              <div className="p-5 border-b border-gray-100">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-lg font-bold text-gray-900">{s.name}</h2>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${status.classes}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    {(s.address || s.city) && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-gray-500">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        {[s.address, s.city, s.state].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>

                  {/* Contact actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-full bg-[#0F7A3D] px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-[#0F6B3A] transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp
                      </a>
                    )}
                    {s.phone && (
                      <a
                        href={`tel:${s.phone.replace(/\D/g, "")}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        {s.phone}
                      </a>
                    )}
                    {s.email && (
                      <a
                        href={`mailto:${s.email}`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        {s.email}
                      </a>
                    )}
                    {s.website && (
                      <a
                        href={s.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        Sitio web
                      </a>
                    )}
                  </div>
                </div>

                {/* Gestión del proveedor */}
                <div className="mt-4 flex items-center gap-2 flex-wrap border-t border-gray-100 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(editingId === s.id ? null : s.id)
                      setCreating(false)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {editingId === s.id ? "Cerrar edición" : "Editar datos"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkingSupplierId(linkingSupplierId === s.id ? null : s.id)
                      setEditingLink(null)
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Vincular producto
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSupplier(s)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white border border-red-200 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Borrar
                  </button>
                </div>

              {editingId === s.id && (
                <div className="p-5 border-b border-gray-100 bg-gray-50">
                  <SupplierForm
                    initial={toFormValues(s)}
                    supplierId={s.id}
                    onSaved={afterSave}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}

              {linkingSupplierId === s.id && (
                <ProductLinkForm
                  supplierId={s.id}
                  onSaved={afterSave}
                  onCancel={() => setLinkingSupplierId(null)}
                />
              )}

              {editingLink?.supplierId === s.id && (
                <ProductLinkForm
                  supplierId={s.id}
                  link={{
                    id: editingLink.link.id,
                    productName:
                      editingLink.link.products?.name ?? `Producto #${editingLink.link.product_id}`,
                    values: toLinkValues(editingLink.link),
                  }}
                  onSaved={afterSave}
                  onCancel={() => setEditingLink(null)}
                />
              )}


              {s.notes && (
                  <p className="mt-3 flex items-start gap-1.5 text-xs text-gray-500 leading-relaxed">
                    <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {s.notes}
                  </p>
                )}
              </div>

              {/* Products table */}
              {s.products.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500">
                        <th className="px-5 py-2.5 font-semibold">Art.</th>
                        <th className="px-5 py-2.5 font-semibold">Producto</th>
                        <th className="px-5 py-2.5 font-semibold">Presentación</th>
                        <th className="px-5 py-2.5 font-semibold text-right">Costo lista</th>
                        <th className="px-5 py-2.5 font-semibold text-center">En tienda</th>
                        <th className="px-5 py-2.5 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {s.products.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50/60">
                          <td className="px-5 py-2.5 font-mono text-xs text-gray-500">
                            {p.supplier_sku ?? "—"}
                          </td>
                          <td className="px-5 py-2.5 text-gray-900">
                            <span className="inline-flex items-center gap-1.5">
                              {p.products?.name ?? "—"}
                              {p.is_primary && (
                                <span
                                  title="Proveedor principal de este producto"
                                  className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700"
                                >
                                  <Star className="w-2.5 h-2.5" />
                                  Principal
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-5 py-2.5 text-gray-500">{p.presentation ?? "—"}</td>
                          <td className="px-5 py-2.5 text-right font-semibold text-gray-900">
                            {p.cost != null ? money.format(p.cost) : "—"}
                          </td>
                          <td className="px-5 py-2.5 text-center">
                            {p.products?.is_visible ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                                <Eye className="w-3.5 h-3.5" /> Visible
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400">
                                <EyeOff className="w-3.5 h-3.5" /> Oculto
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingLink(
                                    editingLink?.link.id === p.id
                                      ? null
                                      : { supplierId: s.id, link: p }
                                  )
                                  setLinkingSupplierId(null)
                                }}
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
                              >
                                <Pencil className="w-3 h-3" />
                                Costo
                              </button>
                              <button
                                type="button"
                                onClick={() => void unlinkProduct(s, p)}
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-3 h-3" />
                                Quitar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-6 text-sm text-gray-400">
                  Sin productos vinculados. Usa <strong className="text-gray-600">Vincular producto</strong>{" "}
                  para capturar el primer costo de lista.
                </div>
              )}
            </section>
          )
        })}
      </div>

      <p className="mt-6 text-xs text-gray-400 leading-relaxed">
        Los productos vinculados entran ocultos y con precio de venta $0.00: el costo de
        lista es la referencia para definir margen. Actívalos desde /admin/productos
        solo después de capturar el precio de venta.
      </p>
    </div>
  )
}
