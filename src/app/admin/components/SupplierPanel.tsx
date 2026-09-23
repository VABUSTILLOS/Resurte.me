"use client"

import { useState } from "react"
import { Eye, EyeOff, MapPin, Truck } from "lucide-react"

import { productCount } from "@/lib/admin-product-list"
import {
  SUPPLIER_CITY_MODES,
  supplierCityLabel,
  type SupplierCityMode,
  type SupplierOverview,
} from "@/lib/admin-supplier-panel"
import { MobileCollapsible } from "./MobileCollapsible"

/** Ciudad mínima que necesita el panel (el resto de `cities` no se usa aquí). */
export interface SupplierPanelCity {
  id: number
  name: string
  state: string
}

export interface SupplierPanelProps {
  suppliers: SupplierOverview[]
  loading: boolean
  cities: SupplierPanelCity[]
  /** Hay una acción en curso: se deshabilitan todos los botones. */
  busy: boolean
  /** Publica u oculta todos los productos del proveedor en la tienda. */
  onVisibility: (supplier: SupplierOverview, isVisible: boolean) => void
  /** Aplica un modo de ciudades a todos los productos del proveedor. */
  onCities: (supplier: SupplierOverview, mode: SupplierCityMode, selected: Set<number>) => void
}

/**
 * Apartado "Proveedores" de `/admin/productos`.
 *
 * Deja ver de dónde viene cada producto y prender o apagar **todo un
 * proveedor**, en la tienda o por ciudad. Las escrituras NO viven aquí: el
 * panel solo compone y delega en las rutas que ya existen
 * (`POST /api/admin/products/bulk` y
 * `PATCH /api/admin/products/city-availability`), así que hereda bitácora,
 * purga de caché, fallos por id y Deshacer sin duplicar nada.
 *
 * El estado de "qué proveedor tiene el editor de ciudades abierto" y su
 * borrador de selección son locales: no viajan en la URL ni le sirven a nadie
 * más, a diferencia de los filtros del listado.
 */
export function SupplierPanel({
  suppliers,
  loading,
  cities,
  busy,
  onVisibility,
  onCities,
}: SupplierPanelProps) {
  const [open, setOpen] = useState(false)
  const [openCities, setOpenCities] = useState<number | null>(null)
  const [draftCities, setDraftCities] = useState<Set<number>>(new Set())

  if (suppliers.length === 0 && !loading) return null

  return (
    <MobileCollapsible
      id="panel-proveedores"
      label="Proveedores"
      icon={<Truck className="w-4 h-4 text-gray-600" />}
      open={open}
      onToggle={() => setOpen((v) => !v)}
    >
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Truck className="w-4 h-4 text-gray-600 shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold text-gray-800">Proveedores:</span>
          <span className="text-xs text-gray-600">
            prende o apaga todos los productos de un proveedor, en la tienda o por ciudad.
          </span>
        </div>

        {loading ? (
          <p className="py-3 text-sm text-gray-600">Cargando proveedores…</p>
        ) : (
          <ul className="mt-1 divide-y divide-gray-100">
            {suppliers.map((supplier) => {
              const sinProductos = supplier.productCount === 0
              const citiesOpen = openCities === supplier.id
              return (
                <li key={supplier.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-gray-900">{supplier.name}</span>
                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
                      {supplier.status}
                    </span>
                    <span className="text-xs text-gray-600">
                      {productCount(supplier.productCount)} · {supplier.visibleCount} visible
                      {supplier.visibleCount === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-700">Tienda:</span>
                    <button
                      type="button"
                      onClick={() => onVisibility(supplier, true)}
                      disabled={busy || sinProductos}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Publicar todo
                    </button>
                    <button
                      type="button"
                      onClick={() => onVisibility(supplier, false)}
                      disabled={busy || sinProductos}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                      Ocultar todo
                    </button>
                    {sinProductos && (
                      <span className="text-[11px] text-gray-600">
                        Sin productos vinculados: no hay nada que publicar.
                      </span>
                    )}
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-gray-700">Ciudades:</span>
                    <span className="text-xs text-gray-600">
                      {supplierCityLabel(supplier.cities)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (citiesOpen) {
                          setOpenCities(null)
                          return
                        }
                        setOpenCities(supplier.id)
                        setDraftCities(new Set(supplier.cities.availableCityIds))
                      }}
                      aria-expanded={citiesOpen}
                      aria-controls={`proveedor-ciudades-${supplier.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      {citiesOpen ? "Cerrar" : "Elegir ciudades"}
                    </button>
                  </div>

                  {citiesOpen && (
                    <div
                      id={`proveedor-ciudades-${supplier.id}`}
                      className="mt-2 rounded-lg border border-gray-200 px-3 py-2"
                    >
                      <div className="max-h-56 divide-y divide-gray-50 overflow-y-auto">
                        {cities.map((city) => (
                          <label key={city.id} className="flex cursor-pointer items-center gap-3 py-2">
                            <input
                              type="checkbox"
                              checked={draftCities.has(city.id)}
                              onChange={() =>
                                setDraftCities((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(city.id)) next.delete(city.id)
                                  else next.add(city.id)
                                  return next
                                })
                              }
                              className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                            />
                            <span className="text-sm text-gray-900">
                              {city.name} <span className="text-gray-600">· {city.state}</span>
                            </span>
                          </label>
                        ))}
                        {cities.length === 0 && (
                          <p className="py-4 text-center text-sm text-gray-600">
                            No hay ciudades activas.
                          </p>
                        )}
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setDraftCities(new Set(cities.map((c) => c.id)))}
                          className="text-xs font-semibold text-brand-600 hover:underline"
                        >
                          Todas
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraftCities(new Set())}
                          className="text-xs font-semibold text-gray-500 hover:underline"
                        >
                          Ninguna
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-2 border-t border-gray-100 pt-2">
                        {SUPPLIER_CITY_MODES.map((mode) => {
                          const blocked = mode.needsSelection && draftCities.size === 0
                          return (
                            <button
                              key={mode.value}
                              type="button"
                              onClick={() => onCities(supplier, mode.value, draftCities)}
                              disabled={busy || blocked || sinProductos}
                              title={mode.help}
                              className="inline-flex items-center rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                            >
                              {mode.label}
                            </button>
                          )
                        })}
                      </div>
                      <p className="mt-1.5 text-[11px] text-gray-600">
                        Marcar todas equivale a <strong>Global</strong> (sin restricciones).
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </MobileCollapsible>
  )
}
