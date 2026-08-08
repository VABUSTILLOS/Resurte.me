"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useCity } from "@/contexts/city-context"
import { createClient } from "@/lib/supabase/client"
import type { Address } from "@/types"
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  Save,
  X,
  CheckCircle2,
} from "lucide-react"

interface AddressForm {
  label: string
  street: string
  number: string
  interior: string
  neighborhood: string
  zip_code: string
  references: string
}

const EMPTY_FORM: AddressForm = {
  label: "Casa",
  street: "",
  number: "",
  interior: "",
  neighborhood: "",
  zip_code: "",
  references: "",
}

export default function MisDireccionesPage() {
  const { city } = useCity()
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  )

  const [addresses, setAddresses] = useState<Address[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(() =>
    typeof window === "undefined" ? true : !createClient()
  )
  const [unauthorized, setUnauthorized] = useState(false)
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadAddresses = useCallback(async () => {
    if (!supabase) return
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user?.id) {
      setUnauthorized(true)
      setLoading(false)
      return
    }
    setUserId(session.user.id)
    const { data, error } = await supabase
      .from("addresses")
      .select("*")
      .order("created_at", { ascending: false })
    if (!error && data) setAddresses(data as Address[])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    let cancelled = false
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (!data.session?.user?.id) {
        setUnauthorized(true)
        setLoading(false)
        return
      }
      setUserId(data.session.user.id)
      return supabase
        .from("addresses")
        .select("*")
        .order("created_at", { ascending: false })
        .then(({ data: rows, error }) => {
          if (cancelled) return
          if (!error && rows) setAddresses(rows as Address[])
          setLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [supabase])

  const updateField = (field: keyof AddressForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setError(null)
  }

  const handleEdit = (addr: Address) => {
    setEditingId(addr.id)
    setForm({
      label: addr.label,
      street: addr.street,
      number: addr.number,
      interior: addr.interior ?? "",
      neighborhood: addr.neighborhood,
      zip_code: addr.zip_code,
      references: addr.references ?? "",
    })
    setNotice(null)
    setError(null)
  }

  const handleNew = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setNotice(null)
    setError(null)
  }

  const handleCancel = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    if (
      !form.street.trim() ||
      !form.number.trim() ||
      !form.neighborhood.trim() ||
      form.zip_code.trim().length < 5
    ) {
      setError("Completa calle, número, colonia y un CP de 5 dígitos.")
      return
    }
    setSaving(true)
    setError(null)

    const payload = {
      // RLS: la policy de INSERT exige user_id = auth.uid() explícito
      user_id: userId,
      label: form.label,
      street: form.street.trim(),
      number: form.number.trim(),
      interior: form.interior.trim() || null,
      neighborhood: form.neighborhood.trim(),
      city: city?.name ?? "",
      state: city?.state ?? "",
      zip_code: form.zip_code.trim(),
      references: form.references.trim() || null,
    }

    let saveError: { message?: string } | null = null
    if (editingId !== null) {
      const { error } = await supabase
        .from("addresses")
        .update(payload)
        .eq("id", editingId)
      saveError = error
    } else {
      const { error } = await supabase.from("addresses").insert(payload)
      saveError = error
    }

    setSaving(false)
    if (saveError) {
      setError(saveError.message || "Error al guardar la dirección.")
      return
    }

    setEditingId(null)
    setForm(EMPTY_FORM)
    setNotice(editingId !== null ? "Dirección actualizada." : "Dirección guardada.")
    await loadAddresses()
  }

  const handleDelete = async (addr: Address) => {
    if (!supabase) return
    if (!window.confirm(`¿Eliminar "${addr.label}" — ${addr.street} ${addr.number}?`)) return
    setDeletingId(addr.id)
    const { error } = await supabase.from("addresses").delete().eq("id", addr.id)
    setDeletingId(null)
    if (error) {
      setError(error.message || "No se pudo eliminar la dirección.")
      return
    }
    if (editingId === addr.id) handleCancel()
    setNotice("Dirección eliminada.")
    await loadAddresses()
  }

  if (unauthorized) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">Inicia sesión</h1>
        <p className="text-gray-500 mb-6">
          Inicia sesión para guardar y gestionar tus direcciones de entrega.
        </p>
        <Link
          href="/auth/login"
          className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-colors"
        >
          Iniciar sesión
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Link href={city ? `/${city.slug}` : "/"} className="p-2 -ml-2 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mis direcciones</h1>
          <p className="text-sm text-gray-500">
            Guarda tus direcciones para usarlas en cada compra sin volver a escribirlas.
          </p>
        </div>
      </div>

      {notice && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {notice}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Lista de direcciones guardadas */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Cargando direcciones...</p>
        </div>
      ) : addresses.length > 0 ? (
        <div className="space-y-3 mb-8">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{addr.label}</p>
                <p className="text-sm text-gray-600">
                  {addr.street} {addr.number}
                  {addr.interior ? `, ${addr.interior}` : ""}
                </p>
                <p className="text-sm text-gray-500">
                  {addr.neighborhood}, CP {addr.zip_code} — {addr.city}, {addr.state}
                </p>
                {addr.references && (
                  <p className="text-xs text-gray-400 mt-0.5">Ref: {addr.references}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleEdit(addr)}
                  aria-label={`Editar ${addr.label}`}
                  className="p-2 rounded-lg text-gray-500 hover:bg-brand-50 hover:text-brand-600 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(addr)}
                  disabled={deletingId === addr.id}
                  aria-label={`Eliminar ${addr.label}`}
                  className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl mb-8">
          <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            Aún no tienes direcciones guardadas. Agrega una para agilizar tu próxima compra.
          </p>
        </div>
      )}

      {/* Formulario agregar / editar */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">
            {editingId !== null ? "Editar dirección" : "Agregar dirección"}
          </h2>
          {editingId !== null && (
            <button
              onClick={handleNew}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Etiqueta</label>
            <div className="flex gap-2">
              {["Casa", "Oficina", "Otro"].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => updateField("label", l)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    form.label === l
                      ? "bg-brand-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Calle *</label>
              <input
                type="text"
                value={form.street}
                onChange={(e) => updateField("street", e.target.value)}
                placeholder="Av. Insurgentes Sur"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Número *</label>
              <input
                type="text"
                value={form.number}
                onChange={(e) => updateField("number", e.target.value)}
                placeholder="1234"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Interior (opcional)
              </label>
              <input
                type="text"
                value={form.interior}
                onChange={(e) => updateField("interior", e.target.value)}
                placeholder="Depto 4B"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Colonia *</label>
              <input
                type="text"
                value={form.neighborhood}
                onChange={(e) => updateField("neighborhood", e.target.value)}
                placeholder="Roma Norte"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Código Postal *
            </label>
            <input
              type="text"
              value={form.zip_code}
              onChange={(e) => updateField("zip_code", e.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="06700"
              maxLength={5}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Referencias (opcional)
            </label>
            <textarea
              value={form.references}
              onChange={(e) => updateField("references", e.target.value)}
              placeholder="Entre calles, color de fachada, etc."
              rows={2}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-none"
            />
          </div>

          {city && (
            <p className="text-xs text-gray-400">
              La dirección se guarda para la ciudad de <strong>{city.name}</strong>, {city.state}.
            </p>
          )}

          <div className="flex gap-3 pt-1">
            {editingId !== null && (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-2.5 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 disabled:opacity-70 transition-colors"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  {editingId !== null ? "Guardar cambios" : "Guardar dirección"}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
