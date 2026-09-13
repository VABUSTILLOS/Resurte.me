"use client"

import { useEffect, useRef, useState } from "react"
import { MapPin, ArrowRight, History } from "lucide-react"
import Link from "next/link"
import type { City, Address } from "@/types"
import type { AddressForm } from "./checkout-shared"

interface ColoniasResult {
  neighborhoods: string[]
  municipality: string | null
  state: string | null
}

interface AddressStepProps {
  address: AddressForm
  phone: string
  savedAddresses: Address[]
  selectedAddressId: number | null
  isLoggedIn: boolean | null
  city: City
  isAddressValid: boolean
  onUpdateAddress: (field: keyof AddressForm, value: string) => void
  onSelectSavedAddress: (addr: Address) => void
  onNewAddress: () => void
  onPhoneChange: (value: string) => void
  onContinue: () => void
  /** Email opcional (captura de lead onBlur). Prop retrocompatible. */
  email?: string
  onEmailChange?: (value: string) => void
  onEmailBlur?: (value: string) => void
  /** Guardar la dirección editada como predeterminada (solo logged-in). */
  saveAsDefault?: boolean
  onSaveAsDefaultChange?: (value: boolean) => void
}

/** Última dirección usada (guests): el cliente B2B pide cada semana a la
    misma cocina; no debe reescribirla en cada checkout. Mismo patrón que
    guest-address.ts (direcciones anónimas del navegador). */
const LAST_ADDRESS_KEY = "resurte-last-address"

export function AddressStep({
  address,
  phone,
  savedAddresses,
  selectedAddressId,
  isLoggedIn,
  city,
  isAddressValid,
  onUpdateAddress,
  onSelectSavedAddress,
  onNewAddress,
  onPhoneChange,
  onContinue,
  email,
  onEmailChange,
  onEmailBlur,
  saveAsDefault = false,
  onSaveAsDefaultChange,
}: AddressStepProps) {
  // Autocompletado de colonia por CP (catálogo postal_codes; fail-open).
  const [colonias, setColonias] = useState<ColoniasResult | null>(null)

  // Las colonias solo aplican mientras el CP tiene 5 dígitos; si el CP se
  // edita y queda inválido, se ocultan sin necesidad de un setState síncrono.
  const activeColonias = address.zip_code.length === 5 ? colonias : null

  useEffect(() => {
    if (address.zip_code.length !== 5) return
    let cancelled = false
    fetch(`/api/address/colonias?cp=${address.zip_code}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ColoniasResult | null) => {
        if (!cancelled && data && data.neighborhoods.length > 0) {
          setColonias(data)
        } else if (!cancelled) {
          setColonias(null)
        }
      })
      .catch(() => {
        /* fail-open: el formulario sigue en modo manual */
      })
    return () => {
      cancelled = true
    }
  }, [address.zip_code])

  // ── Última dirección usada (autoguardado local) ──
  const [lastSaved, setLastSaved] = useState<(AddressForm & { phone?: string }) | null>(null)
  const hydrated = useRef(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_ADDRESS_KEY)
      if (raw) setLastSaved(JSON.parse(raw))
    } catch {
      /* datos corruptos o storage no disponible */
    }
    hydrated.current = true
  }, [])

  // Autoguardar cada cambio (solo cuando hay algo que valga la pena guardar).
  useEffect(() => {
    if (!hydrated.current) return
    if (!address.street.trim()) return
    try {
      localStorage.setItem(LAST_ADDRESS_KEY, JSON.stringify({ ...address, phone }))
    } catch {
      /* storage lleno */
    }
  }, [address, phone])

  const applyLastAddress = () => {
    if (!lastSaved) return
    const fields = ["label", "street", "number", "interior", "neighborhood", "zip_code", "references"] as const
    for (const f of fields) {
      const v = lastSaved[f]
      if (typeof v === "string") onUpdateAddress(f, v)
    }
    if (typeof lastSaved.phone === "string" && lastSaved.phone && !phone) {
      onPhoneChange(lastSaved.phone)
    }
    setLastSaved(null)
  }

  const showApplyLast =
    !address.street.trim() && !selectedAddressId && lastSaved !== null

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">
        <MapPin className="w-5 h-5 inline mr-2 text-brand-600" />
        Dirección de entrega
      </h2>
      <p className="text-gray-500 text-sm mb-6">
        Selecciona o agrega una dirección en {city.name}, {city.state}.
      </p>

      {/* Rellenar con la última dirección usada (guests recurrentes) */}
      {showApplyLast && (
        <button
          type="button"
          onClick={applyLastAddress}
          className="mb-5 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-50 text-brand-700 text-xs font-semibold hover:bg-brand-100 transition-colors"
        >
          <History className="w-3.5 h-3.5" aria-hidden="true" />
          Usar mi última dirección: {lastSaved.street} {lastSaved.number}
        </button>
      )}

      {/* Direcciones guardadas (solo usuarios con sesión) */}
      {isLoggedIn && savedAddresses.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="block text-sm font-medium text-gray-700">
              Mis direcciones
            </span>
            <Link
              href={`/${city.slug}/mis-direcciones`}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 touch-target -my-[14px]"
            >
              Gestionar direcciones
            </Link>
          </div>
          <div className="space-y-2" role="radiogroup" aria-label="Direcciones guardadas">
            <button
              type="button"
              onClick={onNewAddress}
              role="radio"
              aria-checked={selectedAddressId === null}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                selectedAddressId === null
                  ? "border-brand-500 bg-brand-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <span className="w-4 h-4 rounded-full border-2 border-brand-500 flex items-center justify-center shrink-0">
                {selectedAddressId === null && <span className="w-2 h-2 rounded-full bg-brand-600" />}
              </span>
              <span className="text-sm font-medium text-gray-700">+ Nueva dirección</span>
            </button>
            {savedAddresses.map((addr) => (
              <button
                key={addr.id}
                type="button"
                onClick={() => onSelectSavedAddress(addr)}
                role="radio"
                aria-checked={selectedAddressId === addr.id}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                  selectedAddressId === addr.id
                    ? "border-brand-500 bg-brand-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <span className="w-4 h-4 rounded-full border-2 border-brand-500 flex items-center justify-center shrink-0">
                  {selectedAddressId === addr.id && <span className="w-2 h-2 rounded-full bg-brand-600" />}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="block text-sm font-semibold text-gray-900 truncate">{addr.label}</span>
                    {addr.is_default && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-brand-100 text-brand-700 text-[10px] font-bold uppercase tracking-wide">
                        Predeterminada
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-gray-500 truncate">
                    {addr.street} {addr.number}
                    {addr.neighborhood ? `, ${addr.neighborhood}` : ""}, CP {addr.zip_code}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Address label */}
      <div className="mb-4">
        <span className="block text-sm font-medium text-gray-700 mb-1.5" id="address-label-legend">
          Etiqueta
        </span>
        <div className="flex gap-2" role="group" aria-labelledby="address-label-legend">
          {["Casa", "Oficina", "Otro"].map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => onUpdateAddress("label", l)}
              aria-pressed={address.label === l}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                address.label === l
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Street + Number */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="col-span-2">
          <label htmlFor="addr-street" className="block text-sm font-medium text-gray-700 mb-1.5">
            Calle *
          </label>
          <input
            id="addr-street"
            type="text"
            value={address.street}
            onChange={(e) => onUpdateAddress("street", e.target.value)}
            placeholder="Av. Insurgentes Sur"
            autoComplete="address-line1"
            enterKeyHint="next"
            required
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
        <div>
          <label htmlFor="addr-number" className="block text-sm font-medium text-gray-700 mb-1.5">
            Número *
          </label>
          <input
            id="addr-number"
            type="text"
            value={address.number}
            onChange={(e) => onUpdateAddress("number", e.target.value)}
            placeholder="1234"
            enterKeyHint="next"
            required
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
      </div>

      {/* Interior + Neighborhood */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label htmlFor="addr-interior" className="block text-sm font-medium text-gray-700 mb-1.5">
            Interior (opcional)
          </label>
          <input
            id="addr-interior"
            type="text"
            value={address.interior}
            onChange={(e) => onUpdateAddress("interior", e.target.value)}
            placeholder="Depto 4B"
            autoComplete="address-line2"
            enterKeyHint="next"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
        <div>
          <label htmlFor="addr-neighborhood" className="block text-sm font-medium text-gray-700 mb-1.5">
            Colonia *
          </label>
          <input
            id="addr-neighborhood"
            type="text"
            value={address.neighborhood}
            onChange={(e) => onUpdateAddress("neighborhood", e.target.value)}
            placeholder="Roma Norte"
            list={activeColonias ? "checkout-colonias" : undefined}
            autoComplete="address-level3"
            enterKeyHint="next"
            required
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
          {activeColonias && (
            <datalist id="checkout-colonias">
              {activeColonias.neighborhoods.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          )}
        </div>
      </div>

      {/* ZIP code */}
      <div className="mb-4">
        <label htmlFor="addr-zip" className="block text-sm font-medium text-gray-700 mb-1.5">
          Código Postal *
        </label>
        <input
          id="addr-zip"
          type="text"
          inputMode="numeric"
          value={address.zip_code}
          onChange={(e) => onUpdateAddress("zip_code", e.target.value.replace(/\D/g, "").slice(0, 5))}
          placeholder="06700"
          maxLength={5}
          autoComplete="postal-code"
          enterKeyHint="next"
          required
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        />
        {activeColonias && (activeColonias.municipality || activeColonias.state) && (
          <p className="mt-1.5 text-xs text-gray-500">
            {[activeColonias.municipality, activeColonias.state].filter(Boolean).join(", ")}
          </p>
        )}
      </div>

      {/* References */}
      <div className="mb-6">
        <label htmlFor="addr-references" className="block text-sm font-medium text-gray-700 mb-1.5">
          Referencias (opcional)
        </label>
        <textarea
          id="addr-references"
          value={address.references}
          onChange={(e) => onUpdateAddress("references", e.target.value)}
          placeholder="Entre calles, color de fachada, etc."
          rows={2}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-none"
        />
      </div>

      {/* Guardar como predeterminada (solo usuarios con sesión) */}
      {isLoggedIn && onSaveAsDefaultChange && (
        <label className="flex items-start gap-2.5 mb-6 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={saveAsDefault}
            onChange={(e) => onSaveAsDefaultChange(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm text-gray-700">
            Guardar como mi dirección predeterminada
          </span>
        </label>
      )}

      {/* Phone — se guarda en orders.customer_phone para la confirmación por WhatsApp */}
      <div className="mb-6">
        <label htmlFor="checkout-phone" className="block text-sm font-medium text-gray-700 mb-1.5">
          Teléfono de contacto *
        </label>
        <input
          id="checkout-phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="55 1234 5678"
          maxLength={10}
          autoComplete="tel-national"
          enterKeyHint="next"
          required
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        />
        <p className="mt-1 text-xs text-gray-400">
          Lo usamos para enviarte la confirmación de tu pedido por WhatsApp.
        </p>
      </div>

      {/* Email — captura de lead al salir del campo (onBlur) */}
      {email !== undefined && onEmailChange && (
        <div className="mb-6">
          <label htmlFor="checkout-email" className="block text-sm font-medium text-gray-700 mb-1.5">
            Correo electrónico
          </label>
          <input
            id="checkout-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            enterKeyHint="done"
            value={email}
            onChange={(e) => onEmailChange(e.target.value.trim())}
            onBlur={(e) => onEmailBlur?.(e.target.value.trim())}
            placeholder="tucorreo@ejemplo.com"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Para enviarte tu recibo y cupones de bienvenida.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onContinue}
        disabled={!isAddressValid || phone.trim().length < 10}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Continuar
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  )
}
