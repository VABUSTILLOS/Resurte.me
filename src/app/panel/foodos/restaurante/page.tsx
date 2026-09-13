"use client"

// ============================================================
// Mi restaurante — alta de perfil, slug público, sucursales y QR.
// ============================================================

import { useCallback, useEffect, useState } from "react"
import {
  getFoodosPanelData,
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
import ToolGuideHost from "@/components/panel/guide/tool-guide-host"
import { t } from "@/lib/i18n/es"

export default function RestaurantePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [restaurant, setRestaurant] = useState<FoodosRestaurant | null>(null)
  const [branches, setBranches] = useState<FoodosBranch[]>([])
  const [error, setError] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // QR por mesa (dine-in)
  const [tableCount, setTableCount] = useState("5")
  const [tableQrs, setTableQrs] = useState<{ mesa: number; url: string }[]>([])

  // Formulario
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [description, setDescription] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  const [currency, setCurrency] = useState("MXN")

  // Nueva sucursal
  const [branchName, setBranchName] = useState("")
  const [branchCity, setBranchCity] = useState("")
  const [branchAddress, setBranchAddress] = useState("")
  const [branchPhone, setBranchPhone] = useState("")

  const load = useCallback(async () => {
    try {
      const { restaurant: r, branches: b } = await getFoodosPanelData()
      setRestaurant(r)
      if (r) {
        setName(r.name)
        setSlug(r.slug)
        setDescription(r.description ?? "")
        setLogoUrl(r.logo_url ?? "")
        setCurrency(r.currency)
        setBranches(b)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("foodos.restaurante.loadError"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const run = async () => { await load() }
    run()
  }, [load])

  // Regenera el QR cuando cambia el slug. `qrcode` se carga bajo demanda para
  // no incluirlo en el bundle inicial del panel.
  useEffect(() => {
    if (!restaurant) return
    const url = publicRestaurantUrl(restaurant.slug)
    let cancelled = false
    import("qrcode")
      .then(({ toDataURL }) =>
        toDataURL(url, { width: 320, margin: 2 })
          .then((dataUrl) => {
            if (!cancelled) setQrUrl(dataUrl)
          })
          .catch(() => {
            if (!cancelled) setQrUrl(null)
          })
      )
      .catch(() => {
        if (!cancelled) setQrUrl(null)
      })
    return () => {
      cancelled = true
    }
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
      setError(err instanceof Error ? err.message : t("foodos.restaurante.saveError"))
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
      city: branchCity || null,
      address: branchAddress || null,
      phone: branchPhone || null,
      pickup_active: true,
      delivery_active: true,
      delivery_fee: 0,
      min_order: 0,
    })
    setBranchName("")
    setBranchCity("")
    setBranchAddress("")
    setBranchPhone("")
    setBranches(await listBranches(restaurant.id))
  }

  async function handleRemoveBranch(id: string) {
    await deleteBranch(id)
    setBranches((prev) => prev.filter((b) => b.id !== id))
  }

  async function handleToggleDineIn(branch: FoodosBranch) {
    await upsertBranch({
      id: branch.id,
      restaurant_id: branch.restaurant_id,
      name: branch.name,
      city: branch.city,
      address: branch.address,
      phone: branch.phone,
      pickup_active: branch.pickup_active,
      delivery_active: branch.delivery_active,
      dine_in_active: !branch.dine_in_active,
      delivery_fee: branch.delivery_fee,
      min_order: branch.min_order,
    })
    setBranches((prev) =>
      prev.map((b) => (b.id === branch.id ? { ...b, dine_in_active: !b.dine_in_active } : b))
    )
  }

  // Genera un QR por mesa apuntando a /r/[slug]?mesa=N (dine-in estilo take.app).
  async function handleGenerateTableQrs() {
    if (!restaurant) return
    const count = Math.min(Math.max(Number(tableCount) || 0, 1), 50)
    const { toDataURL } = await import("qrcode")
    const base = publicRestaurantUrl(restaurant.slug)
    const results: { mesa: number; url: string }[] = []
    for (let mesa = 1; mesa <= count; mesa++) {
      results.push({ mesa, url: await toDataURL(`${base}?mesa=${mesa}`, { width: 256, margin: 2 }) })
    }
    setTableQrs(results)
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
        <Loader2 className="w-6 h-6 animate-spin text-[#0E7A0E]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("foodos.restaurante.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("foodos.restaurante.subtitle")}
          </p>
        </div>
        {restaurant && (
          <button
            onClick={handleToggleStatus}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              restaurant.status === "active"
                ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                : "bg-[#0E7A0E] text-white hover:bg-[#0e7a0e]"
            }`}
          >
            {restaurant.status === "active" ? t("foodos.restaurante.pauseStore") : t("foodos.restaurante.activateStore")}
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
            <Store className="w-5 h-5 text-[#0E7A0E]" />
            <h2 className="font-semibold text-gray-900">{t("foodos.restaurante.profileTitle")}</h2>
          </div>
          <form onSubmit={handleSaveRestaurant} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t("foodos.restaurante.nameLabel")}</label>
                <input
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (!restaurant) setSlug(e.target.value) }}
                  placeholder={t("foodos.restaurante.namePlaceholder")}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  {t("foodos.restaurante.slugLabel")}
                </label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder={t("foodos.restaurante.slugPlaceholder")}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  {t("foodos.restaurante.slugHelp", { url: publicRestaurantUrl(slug || "...") })}
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t("foodos.restaurante.descriptionLabel")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("foodos.restaurante.descriptionPlaceholder")}
                rows={3}
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t("foodos.restaurante.logoLabel")}</label>
                <input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://…/logo.png"
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t("foodos.restaurante.currencyLabel")}</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
                >
                  <option value="MXN">{t("foodos.restaurante.currencyMxn")}</option>
                  <option value="USD">{t("foodos.restaurante.currencyUsd")}</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="px-5 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? t("foodos.restaurante.saving") : restaurant ? t("foodos.restaurante.saveChanges") : t("foodos.restaurante.createStore")}
              </button>
              {restaurant?.status === "draft" && (
                <span className="text-xs text-gray-400">
                  {t("foodos.restaurante.draftHint")}
                </span>
              )}
            </div>
          </form>
        </div>

        {/* QR + URL pública */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-4 self-start">
            <QrCode className="w-5 h-5 text-[#0E7A0E]" />
            <h2 className="font-semibold text-gray-900">{t("foodos.restaurante.qrTitle")}</h2>
          </div>
          {restaurant ? (
            <>
              <div className="bg-white rounded-2xl border border-gray-200 p-3 shadow-sm">
                {qrUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- QR generado en cliente como data URL (qrcode.toDataURL); next/image no optimiza data URLs
                  <img src={qrUrl} alt={t("foodos.restaurante.qrAlt", { name: restaurant.name })} width={208} height={208} className="w-52 h-52" />
                ) : (
                  <div className="w-52 h-52 flex items-center justify-center text-gray-300">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-3 text-center">
                {t("foodos.restaurante.qrHint")}
              </p>
              <div className="w-full mt-4">
                <div className="flex items-center gap-2 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
                  <span className="text-xs text-gray-500 truncate flex-1">
                    {publicRestaurantUrl(restaurant.slug)}
                  </span>
                  <button onClick={handleCopyUrl} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-500 transition-colors">
                    {copied ? <Check className="w-4 h-4 text-[#0E7A0E]" /> : <Copy className="w-4 h-4" />}
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
                {t("foodos.restaurante.qrEmpty")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Sucursales */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-5">
          <MapPin className="w-5 h-5 text-[#0E7A0E]" />
          <h2 className="font-semibold text-gray-900">{t("foodos.restaurante.branchesTitle")}</h2>
        </div>

        {!restaurant ? (
          <p className="text-sm text-gray-400">{t("foodos.restaurante.branchesEmpty")}</p>
        ) : (
          <>
            {branches.length > 0 && (
              <div className="space-y-2 mb-4">
                {branches.map((b) => (
                  <div key={b.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{b.name}</p>
                      {b.city && <p className="text-xs text-gray-500 mt-0.5">📍 {b.city}</p>}
                      {b.address && <p className="text-xs text-gray-500">{b.address}</p>}
                      <div className="flex gap-3 mt-1.5">
                        {b.pickup_active && (
                          <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t("foodos.common.fulfillmentPickup")}</span>
                        )}
                        {b.delivery_active && (
                          <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{t("foodos.restaurante.deliveryBadge")}</span>
                        )}
                        <button
                          onClick={() => handleToggleDineIn(b)}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                            b.dine_in_active
                              ? "bg-purple-100 text-purple-700"
                              : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                          }`}
                          title="Activar/desactivar pedidos en mesa (dine-in)"
                        >
                          🍽️ En mesa {b.dine_in_active ? "activo" : "inactivo"}
                        </button>
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
                placeholder={t("foodos.restaurante.branchNamePlaceholder")}
                className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
              />
              <input
                value={branchCity}
                onChange={(e) => setBranchCity(e.target.value)}
                placeholder={t("foodos.restaurante.branchCityPlaceholder")}
                className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
              />
              <input
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
                placeholder={t("foodos.restaurante.branchAddressPlaceholder")}
                className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
              />
              <input
                value={branchPhone}
                onChange={(e) => setBranchPhone(e.target.value)}
                placeholder={t("foodos.restaurante.branchPhonePlaceholder")}
                className="rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
              />
              <button
                type="submit"
                disabled={!branchName.trim()}
                className="sm:col-span-3 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-[#0E7A0E]/40 text-[#0E7A0E] text-sm font-semibold hover:bg-[#F0FDF4] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-4 h-4" /> {t("foodos.restaurante.addBranch")}
              </button>
            </form>
          </>
        )}
      </div>
      {/* QR por mesa (dine-in) */}
      {restaurant && branches.some((b) => b.dine_in_active) && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-1">
            <QrCode className="w-5 h-5 text-[#0E7A0E]" />
            <h2 className="font-semibold text-gray-900">QR por mesa</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Cada QR abre el menú en modo &quot;En el local&quot; con la mesa pre-seleccionada. Imprime y pega uno por mesa.
          </p>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="number" min="1" max="50"
              value={tableCount}
              onChange={(e) => setTableCount(e.target.value)}
              className="w-24 rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E7A0E]/30 focus:border-[#0E7A0E]"
            />
            <button
              onClick={handleGenerateTableQrs}
              className="px-4 py-2.5 rounded-xl bg-[#0E7A0E] text-white text-sm font-semibold hover:bg-[#0e7a0e]"
            >
              Generar QRs
            </button>
          </div>
          {tableQrs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-4">
              {tableQrs.map((q) => (
                <div key={q.mesa} className="flex flex-col items-center rounded-xl border border-gray-200 p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- QR generado en cliente como data URL */}
                  <img src={q.url} alt={`QR mesa ${q.mesa}`} width={128} height={128} className="w-32 h-32" />
                  <p className="text-xs font-bold text-gray-700 mt-2">Mesa {q.mesa}</p>
                  <a
                    href={q.url}
                    download={`qr-mesa-${q.mesa}.png`}
                    className="text-[11px] text-[#0E7A0E] font-semibold hover:underline mt-1"
                  >
                    Descargar
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ToolGuideHost toolKey="restaurante" pathname="/panel/foodos/restaurante" slug={null} icon="🏪" title={t("foodos.restaurante.guideTitle")} />
    </div>
  )
}
