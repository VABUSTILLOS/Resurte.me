"use server"

import { getUserRole } from "@/lib/roles"
import type { AppRole } from "@/lib/roles"

/**
 * Server action para que los componentes cliente (header, sidebar) sepan
 * qué mostrar según el rol del usuario logueado.
 */
export async function getMyRole(): Promise<AppRole> {
  return getUserRole()
}
