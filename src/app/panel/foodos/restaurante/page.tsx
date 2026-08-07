"use client"

// ============================================================
// Mi restaurante — alta de perfil, slug público, sucursales y QR.
// ============================================================

import { useCallback, useEffect, useState } from "react"
import { toDataURL } from "qrcode"
import {
  getMyRestaurant,
  upsertRestaurant,
  setRestaurantStatus,
  listBranches,
  upsertBranch,
  deleteBranch,
} from "../actions"
import { publicRestaurantUrl } from "@/lib/foodos"
import type { FoodosRestaurant, FoodosBranch } from "@/types/foodos"
import {
  Store, MapPin, Plus, Trash2, QrCode, Copy, Check, ExternalLink, Loader2, Building2,
} from "lucide-react"

export default function RestaurantePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [branches, setBranches] = useState<FoodosBranch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Formulario
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const [currency, setCurrency] = useState("MXN")

  // Nueva sucursal
  const [branchName, setBranchName] = useState("")
  const [branchAddress, setBranchAddress] = useState("")
  const [branchPhone, setBranchPhone] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await getMyRestaurant()
      setRestaurant(r)
      if (r) {
        setName(r.name)
        setSlug(r.slug)
        setDescription(r.description ?? "")
        setLogoUrl(r.logo_url ?? "")
        setCurrency(r.currency)
        const b = await listBranches(r.id)
        setBranches(b)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar tu restaurante")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Regenera el QR cuando cambia el slug
  useEffect(() => {
    if (!restaurant) return
    const url = publicRestaurantUrl(restaurant.slug)
    toDataURL(url, { width: 320, margin: 2 })
      .then(setQrUrl)
      .catch(() => setQrUrl(null))
  }, [restaurant])

  async function handleSaveRestaurant(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const saved = await upsertRestaurant({
        id: restaurant?.id,
        name,
        slug,
        description,
        logo_url: logoUrl || null,
        currency,
      })
      setRestaurant(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus() {
    if (!restaurant) return
    const next = restaurant.status === "active" ? "paused" : "active"
    await setRestaurantStatus(restaurant.id, next)
    setRestaurant({ ...restaurant, status: next })
  }

  async function handleAddBranch(e: React.FormEvent) {
    e.preventDefault()
    if (!restaurant) return
    await upsertBranch({
      restaurant_id: restaurant.id,
      name: branchName,
      address: branchAddress || null,
      phone: branchPhone || null,
      pickup_active: true,
      delivery_active: true,
      delivery_fee: 0,
      min_order: 0,
    })
    setBranchName("")
    setBranchAddress("")
    setBranchPhone("")
    setBranches(await listBranches(restaurant.id))
  }

  async function handleRemoveBranch(id: string) {
    await deleteBranch(id)
    setBranches((prev) => prev.filter((b) => b.id !== id))
  }

  function handleCopyUrl() {
    if (!restaurant) return
    navigator.clipboard.writeText(publicRestaurantUrl(restaurant.slug))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#108910]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mi restaurante</h1>
          <p className="text-sm text-gray-500 mt-1">
            Activa tu canal de pedidos directo: menú digital, QR y checkout sin comisiones.
          </p>
        </div>
        {restaurant && (
          <button
            onClick={handleToggleStatus}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              restaurant.status === "active"
                ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                : "bg-[#108910] text-white hover:bg-[#0e7a0e]"
            }`}
          >
            {restaurant.status === "active" ? "Pausar" : "Activar tienda"}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Perfil */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-5">
            <Store className="w-5 h-5 text-[#108910]" />
            <h2 className="font-semibold text-gray-900">Perfil público</h2>
          </div>
          <form onSubmit={handleSaveRestaurant} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nombre del restaurante *</label>
                <input
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (!restaurant) setSlug(e.target.value) }}
                  placeholder="Taquería El Compa"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#108910]/30 focus:border-[#108910]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  Slug público (aparece en la URL) *
                </label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="taqueria-el-compa"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#108910]/30 focus:border-[#108910]"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Tu menú quedará en {publicRestaurantUrl(slug || "...")}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Descripción</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Cocina mexicana, hecha en casa, delivery a toda la colonia…"
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#108910]/30 focus:border-[#108910]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">URL del logo</label>
                <input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://…/logo.png"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#108910]/30 focus:border-[#108910]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Moneda</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#108910]/30 focus:border-[#108910]"
                >
                  <option value="MXN">MXN — Peso mexicano</option>
                  <option value="USD">USD — Dólar</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="px-5 py-2.5 rounded-xl bg-[#108910] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Guardando…" : restaurant ? "Guardar cambios" : "Crear mi tienda"}
              </button>
              {restaurant?.status === "draft" && (
                <span className="text-xs text-gray-400">
                  El QR y la URL se activan cuando actives la tienda.
                </span>
              )}
            </div>
          </form>
        </div>

        {/* QR + URL pública */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-4 self-start">
            <QrCode className="w-5 h-5 text-[#108910]" />
            <h2 className="font-semibold text-gray-900">Tu código QR</h2>
          </div>
          {restaurant ? (
            <>
              <div className="bg-white rounded-2xl border border-gray-200 p-3 shadow-sm">
                {qrUrl ? (
                  <img src={qrUrl} alt={`QR de ${restaurant.name}`} className="w-52 h-52" />
                ) : (
                  <div className="w-52 h-52 flex items-center justify-center text-gray-300">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-3 text-center">
                Imprímelo y pégalo en mesas, empaques o publicidad. Escanearlo lleva directo a tu menú.
              </p>
              <div className="w-full mt-4">
                <div className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
                  <span className="text-xs text-gray-500 truncate flex-1">
                    {publicRestaurantUrl(restaurant.slug)}
                  </span>
                  <button onClick={handleCopyUrl} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors">
                    {copied ? <Check className="w-4 h-4 text-[#108910]" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a
                    href={publicRestaurantUrl(restaurant.slug)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center text-center py-8">
              <Building2 className="w-12 h-12 text-gray-300 mb-3" />
              <p className="text-sm text-gray-400 max-w-[220px]">
                Crea tu restaurante para generar el QR y tu menú público.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Sucursales */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <MapPin className="w-5 h-5 text-[#108910]" />
          <h2 className="font-semibold text-gray-900">Sucursales</h2>
        </div>

        {!restaurant ? (
          <p className="text-sm text-gray-400">Guarda tu restaurante primero para agregar sucursales.</p>
        ) : (
          <>
            {branches.length > 0 && (
              <div className="space-y-2 mb-4">
                {branches.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{b.name}</p>
                      {b.address && <p className="text-xs text-gray-500 mt-0.5">{b.address}</p>}
                      <div className="flex gap-3 mt-1.5">
                        {b.pickup_active && (
                          <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Para llevar</span>
                        )}
                        {b.delivery_active && (
                          <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Delivery</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveBranch(b.id)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddBranch} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="Sucursal Centro"
                className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#108910]/30 focus:border-[#108910]"
              />
              <input
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
                placeholder="Dirección"
                className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#108910]/30 focus:border-[#108910]"
              />
              <input
                value={branchPhone}
                onChange={(e) => setBranchPhone(e.target.value)}
                placeholder="Teléfono WhatsApp"
                className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#108910]/30 focus:border-[#108910]"
              />
              <button
                type="submit"
                disabled={!branchName.trim()}
                className="sm:col-span-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[#108910]/40 text-[#108910] text-sm font-semibold hover:bg-[#F0FDF4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-4 h-4" /> Agregar sucursal
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
