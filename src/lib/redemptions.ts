/**
 * Dominio de las solicitudes de servicio (canjes de créditos).
 *
 * Este módulo es PURO a propósito: lo importan el servidor (API de canje y
 * panel de administración) y los componentes de cliente (/recompensas), así
 * que no puede tocar Supabase ni ningún módulo de servidor.
 *
 * La máquina de estados es un ESPEJO de `public.advance_redemption()`
 * (migraciones 00151/00152), que es la única fuente de verdad. Aquí sólo se
 * usa para no ofrecer al administrador botones que la base va a rechazar;
 * `redemptions.contract.test.ts` comprueba contra el SQL que ambos coinciden.
 */

import { DEFAULT_TIMEZONE } from "@/lib/local-date"

export type RedemptionStatus = "requested" | "in_progress" | "delivered" | "cancelled"

export const REDEMPTION_STATUSES = [
  "requested",
  "in_progress",
  "delivered",
  "cancelled",
] as const satisfies readonly RedemptionStatus[]

export const REDEMPTION_STATUS_LABEL: Record<RedemptionStatus, string> = {
  requested: "Solicitada",
  in_progress: "En proceso",
  delivered: "Entregada",
  cancelled: "Cancelada",
}

/**
 * Transiciones aceptadas por `advance_redemption()`. `delivered` y `cancelled`
 * son terminales: una vez entregada no se cancela (los créditos ya se
 * consumieron) y una cancelación ya devolvió el saldo.
 */
export const REDEMPTION_TRANSITIONS: Record<RedemptionStatus, readonly RedemptionStatus[]> = {
  requested: ["in_progress", "cancelled"],
  in_progress: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
}

export function isRedemptionStatus(value: unknown): value is RedemptionStatus {
  return typeof value === "string" && (REDEMPTION_STATUSES as readonly string[]).includes(value)
}

/** Estados a los que se puede mover una solicitud en este momento. */
export function nextRedemptionStatuses(from: RedemptionStatus): RedemptionStatus[] {
  return [...REDEMPTION_TRANSITIONS[from]]
}

export function canTransitionRedemption(from: RedemptionStatus, to: RedemptionStatus): boolean {
  return REDEMPTION_TRANSITIONS[from].includes(to)
}

/** Una solicitud abierta es la que todavía consume trabajo del equipo. */
export function isOpenRedemption(status: RedemptionStatus): boolean {
  return status === "requested" || status === "in_progress"
}

// ============================================================
// BRIEF — el contexto que el cliente captura y el equipo ejecuta
// ============================================================

export interface RedemptionBrief {
  restaurant_name: string
  maps_url: string | null
  social_handle: string | null
  notes: string | null
}

export const REDEMPTION_BRIEF_LIMITS = {
  restaurantName: 120,
  mapsUrl: 500,
  social: 80,
  notes: 1000,
} as const

export type BriefValidation =
  | { ok: true; brief: RedemptionBrief }
  | { ok: false; error: string }

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return ""
  // Colapsa saltos de línea y espacios repetidos: el brief se muestra en una
  // ficha de administración, no en un editor de texto libre.
  return value.replace(/\s+/g, " ").trim().slice(0, max)
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Valida y normaliza el brief que envía el cliente. Nunca se escribe el JSONB
 * crudo: todo campo pasa por lista blanca y tope de longitud.
 *
 * El nombre del restaurante es obligatorio porque ningún servicio del catálogo
 * (reseñas, redes, foto, menú digital) se puede ejecutar sin saber sobre qué
 * negocio se trabaja.
 */
export function normalizeRedemptionBrief(input: unknown): BriefValidation {
  const raw = (input ?? {}) as Record<string, unknown>

  const restaurantName = cleanText(raw.restaurant_name, REDEMPTION_BRIEF_LIMITS.restaurantName)
  if (restaurantName.length < 2) {
    return { ok: false, error: "El nombre de tu restaurante es obligatorio" }
  }

  const mapsUrlRaw = cleanText(raw.maps_url, REDEMPTION_BRIEF_LIMITS.mapsUrl)
  if (mapsUrlRaw && !isHttpUrl(mapsUrlRaw)) {
    return { ok: false, error: "El link de Google Maps debe ser una URL http(s) válida" }
  }

  const social = cleanText(raw.social_handle, REDEMPTION_BRIEF_LIMITS.social)
  const notes = cleanText(raw.notes, REDEMPTION_BRIEF_LIMITS.notes)

  return {
    ok: true,
    brief: {
      restaurant_name: restaurantName,
      maps_url: mapsUrlRaw || null,
      social_handle: social || null,
      notes: notes || null,
    },
  }
}

/**
 * Cuántos datos capturó el cliente, 0..1. La ficha de administración lo usa
 * para señalar solicitudes que llegarán incompletas al equipo.
 */
export function briefCompleteness(brief: Partial<RedemptionBrief> | null | undefined): number {
  if (!brief) return 0
  const filled = [brief.restaurant_name, brief.maps_url, brief.social_handle, brief.notes].filter(
    (v) => typeof v === "string" && v.trim().length > 0
  ).length
  return filled / 4
}

// ============================================================
// SLA
// ============================================================

const DAY_MS = 86_400_000

/**
 * Días que faltan para el vencimiento del SLA. Negativo = vencido.
 * Devuelve `null` cuando la solicitud no tiene fecha comprometida.
 */
export function slaDaysRemaining(dueAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!dueAt) return null
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return null
  return Math.ceil((due.getTime() - now.getTime()) / DAY_MS)
}

/** Días transcurridos desde la solicitud, para dimensionar la cola. */
export function redemptionAgeDays(createdAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!createdAt) return null
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return null
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / DAY_MS))
}

/**
 * Una solicitud está vencida cuando sigue abierta y pasó su fecha
 * comprometida. Las entregadas y canceladas nunca se reportan vencidas.
 */
export function isRedemptionOverdue(
  redemption: { status: RedemptionStatus; due_at: string | null },
  now: Date = new Date()
): boolean {
  if (!isOpenRedemption(redemption.status)) return false
  const remaining = slaDaysRemaining(redemption.due_at, now)
  return remaining !== null && remaining < 0
}

/**
 * Fecha comprometida en lenguaje natural ("5 de octubre").
 *
 * Se formatea en el huso de operación, no en el del navegador: un cliente en
 * otro huso vería un día distinto al que el equipo tiene en su cola.
 */
export function formatRedemptionDueDate(dueAt: string | null | undefined): string | null {
  if (!dueAt) return null
  const date = new Date(dueAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("es-MX", {
    timeZone: DEFAULT_TIMEZONE,
    day: "numeric",
    month: "long",
  })
}
