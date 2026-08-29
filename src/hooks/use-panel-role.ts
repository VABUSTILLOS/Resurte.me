"use client"

import { useEffect, useState } from "react"
import type { PanelRole } from "@/lib/panel-roles"

/**
 * Rol efectivo del usuario en el panel (Fase 4.6). Consulta
 * /api/panel/members?mine=1 una sola vez por sesión de navegador
 * (cache a nivel módulo compartido por todos los consumidores).
 * Sin sesión (guest) o sin membresía → "dueno".
 */

interface RoleState {
  role: PanelRole
  viaMember: boolean
  loading: boolean
}

let cache: RoleState | null = null
let inflight: Promise<RoleState> | null = null

function fetchRole(): Promise<RoleState> {
  if (!inflight) {
    inflight = fetch("/api/panel/members?mine=1", { credentials: "same-origin" })
      .then(async (res): Promise<RoleState> => {
        if (!res.ok) return { role: "dueno", viaMember: false, loading: false }
        const json = (await res.json()) as { role?: string; viaMember?: boolean }
        const role: PanelRole =
          json.role === "gerente" || json.role === "cocina" || json.role === "mesero" ? json.role : "dueno"
        return { role, viaMember: json.viaMember === true && role !== "dueno", loading: false }
      })
      .catch((): RoleState => ({ role: "dueno", viaMember: false, loading: false }))
      .then((s) => {
        cache = s
        return s
      })
  }
  return inflight
}

/** Limpia el cache (p. ej. tras aceptar una invitación o revocar acceso). */
export function resetPanelRoleCache() {
  cache = null
  inflight = null
}

export function usePanelRole(): RoleState {
  const [state, setState] = useState<RoleState>(
    () => cache ?? { role: "dueno", viaMember: false, loading: true },
  )
  useEffect(() => {
    if (cache) return
    let cancelled = false
    void fetchRole().then((s) => {
      if (!cancelled) setState(s)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return cache ?? state
}
