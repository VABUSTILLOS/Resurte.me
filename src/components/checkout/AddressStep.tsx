"use client"

import { MapPin, ArrowRight } from "lucide-react"
import Link from "next/link"
import type { City, Address } from "@/types"
import type { AddressForm } from "./checkout-shared"

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
}

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
}: AddressStepProps) {
  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 mb-1">
        <MapPin className="w-5 h-5 inline mr-2 text-brand-600" />
        Dirección de entrega
      </h2>
      <p className="text-gray-500 text-sm mb-6">
        Selecciona o agrega una dirección en {city.name}, {city.state}.
      </p>

      {/* Direcciones guardadas (solo usuarios con sesión) */}
      {isLoggedIn && savedAddresses.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Mis direcciones
            </label>
            <Link
              href={`/${city.slug}/mis-direcciones`}
              className="text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              Gestionar direcciones
            </Link>
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={onNewAddress}
              aria-pressed={selectedAddressId === null}
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
                aria-pressed={selectedAddressId === addr.id}
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
                  <span className="block text-sm font-semibold text-gray-900">{addr.label}</span>
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
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Etiqueta
        </label>
        <div className="flex gap-2">
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
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Calle *
          </label>
          <input
            type="text"
            value={address.street}
            onChange={(e) => onUpdateAddress("street", e.target.value)}
            placeholder="Av. Insurgentes Sur"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Número *
          </label>
          <input
            type="text"
            value={address.number}
            onChange={(e) => onUpdateAddress("number", e.target.value)}
            placeholder="1234"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
      </div>

      {/* Interior + Neighborhood */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Interior (opcional)
          </label>
          <input
            type="text"
            value={address.interior}
            onChange={(e) => onUpdateAddress("interior", e.target.value)}
            placeholder="Depto 4B"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Colonia *
          </label>
          <input
            type="text"
            value={address.neighborhood}
            onChange={(e) => onUpdateAddress("neighborhood", e.target.value)}
            placeholder="Roma Norte"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
          />
        </div>
      </div>

      {/* ZIP code */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Código Postal *
        </label>
        <input
          type="text"
          value={address.zip_code}
          onChange={(e) => onUpdateAddress("zip_code", e.target.value.replace(/\D/g, "").slice(0, 5))}
          placeholder="06700"
          maxLength={5}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        />
      </div>

      {/* References */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Referencias (opcional)
        </label>
        <textarea
          value={address.references}
          onChange={(e) => onUpdateAddress("references", e.target.value)}
          placeholder="Entre calles, color de fachada, etc."
          rows={2}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 resize-none"
        />
      </div>

      {/* Phone — se guarda en orders.customer_phone para la confirmación por WhatsApp */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Teléfono de contacto *
        </label>
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
          placeholder="55 1234 5678"
          maxLength={10}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
        />
        <p className="mt-1 text-xs text-gray-400">
          Lo usamos para enviarte la confirmación de tu pedido por WhatsApp.
        </p>
      </div>

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
