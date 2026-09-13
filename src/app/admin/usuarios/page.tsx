"use client"

import { useState, useEffect, useCallback } from "react"
import { Search, Loader2, ShieldCheck, Store, User, Download } from "lucide-react"
import { toCsv, downloadCsv } from "@/lib/csv"
import { MANAGED_ROLES } from "@/lib/admin-roles"
import {
  listUsers,
  setUserRole,
  type ManagedUser,
  type ManagedUserRole,
} from "./actions"

const ROLE_META: Record<
  ManagedUserRole,
  { label: string; icon: typeof User; badge: string }
> = {
  admin: {
    label: "Admin",
    icon: ShieldCheck,
    badge: "bg-gray-900 text-white",
  },
  vendedor: {
    label: "Vendedor",
    icon: Store,
    badge: "bg-blue-100 text-blue-700",
  },
  cliente: {
    label: "Cliente",
    icon: User,
    badge: "bg-gray-100 text-gray-600",
  },
}

export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async (query: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await listUsers(query)
      setUsers(result.users)
      setTotal(result.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar usuarios")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300)
    return () => clearTimeout(timer)
  }, [search, load])

  // Exporta a CSV los usuarios cargados (respeta la búsqueda aplicada).
  function exportCsv() {
    const csv = toCsv(
      ["Email", "Nombre", "Rol", "Registro", "Último acceso"],
      users.map((u) => [
        u.email ?? "",
        u.full_name ?? "",
        ROLE_META[u.role].label,
        new Date(u.created_at).toLocaleDateString("es-MX"),
        u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("es-MX") : "",
      ])
    )
    const stamp = new Date().toISOString().slice(0, 10)
    downloadCsv(`usuarios-${stamp}.csv`, csv)
    setNotice(`${users.length} usuario${users.length !== 1 ? "s" : ""} exportados a CSV.`)
  }

  async function handleRoleChange(user: ManagedUser, role: ManagedUserRole) {
    if (role === user.role) return

    const from = ROLE_META[user.role].label
    const to = ROLE_META[role].label
    if (
      !window.confirm(
        `¿Cambiar el rol de ${user.email ?? user.id} de ${from} a ${to}?`
      )
    ) {
      return
    }

    setUpdating(user.id)
    setError(null)
    setNotice(null)
    try {
      await setUserRole(user.id, role)
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role } : u))
      )
      setNotice(`Rol de ${user.email ?? "usuario"} actualizado a ${to}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el rol")
    } finally {
      setUpdating(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="text-sm text-gray-500">
            Gestiona los roles del sitio: admin, vendedor o cliente.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={exportCsv}
            disabled={users.length === 0 || loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por email o nombre"
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Usuario
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Rol
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Registro
              </th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">
                Último acceso
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                  No se encontraron usuarios.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const meta = ROLE_META[user.role]
                const Icon = meta.icon
                return (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">
                        {user.full_name ?? "—"}
                      </div>
                      <div className="text-xs text-gray-500">{user.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badge}`}
                        >
                          <Icon className="h-3 w-3" aria-hidden="true" />
                          {meta.label}
                        </span>
                        <select
                          value={user.role}
                          disabled={updating === user.id}
                          onChange={(e) =>
                            handleRoleChange(
                              user,
                              e.target.value as ManagedUserRole
                            )
                          }
                          aria-label={`Cambiar rol de ${user.email ?? "usuario"}`}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-xs text-gray-700 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                        >
                          {MANAGED_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_META[role].label}
                            </option>
                          ))}
                        </select>
                        {updating === user.id && (
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(user.created_at).toLocaleDateString("es-MX")}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {user.last_sign_in_at
                        ? new Date(user.last_sign_in_at).toLocaleDateString(
                            "es-MX"
                          )
                        : "Nunca"}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && total > users.length && (
        <p className="mt-3 text-center text-xs text-gray-400">
          Mostrando {users.length} de {total} usuarios. Usa la búsqueda para
          encontrar más.
        </p>
      )}
    </div>
  )
}
