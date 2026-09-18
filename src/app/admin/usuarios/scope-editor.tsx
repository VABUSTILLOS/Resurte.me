"use client"

import { useState } from "react"
import { ChevronDown, Loader2, Lock, ShieldCheck } from "lucide-react"
import {
  ADMIN_PERMISSIONS,
  ADMIN_PERMISSION_DESCRIPTION,
  ADMIN_PERMISSION_LABEL,
  describeAdminScope,
  type AdminPermission,
  type AdminScope,
} from "@/lib/admin-permissions"

interface ScopeEditorProps {
  userEmail: string | null
  scope: AdminScope
  busy: boolean
  onSave: (scope: AdminScope) => Promise<void>
}

/**
 * Editor del ámbito de /admin de una cuenta.
 *
 * Vive en la fila de la tabla y no en un modal a propósito: el ámbito se lee
 * siempre (la etiqueta resume los tres estados) y solo se despliega cuando se
 * va a cambiar, que es la excepción. Un modal para un dato que casi siempre
 * solo se consulta obliga a abrirlo para saber qué tiene la cuenta.
 */
export default function ScopeEditor({
  userEmail,
  scope,
  busy,
  onSave,
}: ScopeEditorProps) {
  const [open, setOpen] = useState(false)
  const [unrestricted, setUnrestricted] = useState(scope === null)
  const [selected, setSelected] = useState<AdminPermission[]>(scope ?? [])

  function openEditor() {
    // Re-sincroniza con lo que hay en la base: si otro admin cambió el ámbito
    // mientras esta fila estaba en pantalla, editar sobre el valor viejo lo
    // revertiría sin que nadie lo note.
    setUnrestricted(scope === null)
    setSelected(scope ?? [])
    setOpen(true)
  }

  function toggle(permission: AdminPermission) {
    setSelected((prev) =>
      prev.includes(permission)
        ? prev.filter((p) => p !== permission)
        : [...prev, permission]
    )
  }

  const nextScope: AdminScope = unrestricted ? null : selected

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openEditor())}
        aria-expanded={open}
        aria-label={`Permisos de ${userEmail ?? "usuario"}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:border-emerald-500 focus:outline-none"
      >
        {scope === null ? (
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Lock className="h-3 w-3" aria-hidden="true" />
        )}
        {describeAdminScope(scope)}
        <ChevronDown
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="mt-2 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <label className="flex cursor-pointer items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={unrestricted}
              onChange={(e) => setUnrestricted(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-emerald-700 focus:ring-emerald-500"
            />
            <span>
              <span className="font-semibold text-gray-900">
                Sin restringir
              </span>
              <span className="block text-gray-600">
                Acceso a todas las secciones del panel.
              </span>
            </span>
          </label>

          <fieldset
            disabled={unrestricted}
            className={`mt-3 space-y-2 border-t border-gray-100 pt-3 ${
              unrestricted ? "opacity-50" : ""
            }`}
          >
            <legend className="sr-only">Secciones permitidas</legend>
            {ADMIN_PERMISSIONS.map((permission) => (
              <label
                key={permission}
                className="flex cursor-pointer items-start gap-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(permission)}
                  onChange={() => toggle(permission)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-emerald-700 focus:ring-emerald-500"
                />
                <span>
                  <span className="font-medium text-gray-900">
                    {ADMIN_PERMISSION_LABEL[permission]}
                  </span>
                  <span className="block text-gray-600">
                    {ADMIN_PERMISSION_DESCRIPTION[permission]}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="mt-3 flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await onSave(nextScope)
                setOpen(false)
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
              Guardar
            </button>
          </div>

          {!unrestricted && selected.length === 0 && (
            <p className="mt-2 text-xs text-amber-700">
              Sin ninguna sección marcada la cuenta entra a /admin pero no puede
              abrir nada.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
