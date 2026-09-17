/**
 * Embudo de leads web y métricas de conversión del panel admin.
 *
 * Regla de honestidad de datos: una tasa que no se puede calcular se reporta
 * como `null` ("no medido"), NUNCA como 0. Un embudo con denominador cero no es
 * "0% de conversión", es "todavía no hay nada que medir"; pintar 0 ahí hace que
 * el panel parezca roto cuando en realidad está vacío.
 *
 * Módulo puro: sin Supabase y sin React, para poder probar los bordes.
 */

import { LEAD_STATUSES, matchesSearch, type LeadStatus } from "@/lib/crm-pipeline"

/** Lo mínimo que necesita el embudo de cada lead. */
export interface FunnelLead {
  id: number
  email: string
  phone: string | null
  source: string
  created_at: string
  restaurant_name: string | null
  qualification: { score: number; segment: string } | null
  status: string
  converted_at: string | null
  converted_prospect_id: number | null
}

export interface LeadFilters {
  q?: string
  source?: string
  segment?: string
  /** Estado exacto del lead; un valor fuera del CHECK se ignora. */
  status?: string
  /** Solo la bandeja pendiente (sin atender). */
  pendingOnly?: boolean
}

export function isLeadStatusValue(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value)
}

/**
 * Filtra la bandeja de leads. El texto se compara sin acentos ni mayúsculas,
 * igual que en el CRM de prospectos (`normalizeForSearch`), para que buscar
 * "taqueria" encuentre "Taquería".
 */
export function filterLeads<T extends FunnelLead>(leads: T[], filters: LeadFilters = {}): T[] {
  return leads.filter((lead) => {
    if (filters.pendingOnly && !isPending(lead)) return false
    if (filters.status && isLeadStatusValue(filters.status) && lead.status !== filters.status) {
      return false
    }
    if (filters.source && lead.source !== filters.source) return false
    if (filters.segment && lead.qualification?.segment !== filters.segment) return false
    if (filters.q) {
      if (!matchesSearch(filters.q, [lead.email, lead.restaurant_name, lead.phone], [lead.phone])) {
        return false
      }
    }
    return true
  })
}

/** Un lead sigue en la bandeja si está en `nuevo` y sin prospecto. */
export function isPending(lead: Pick<FunnelLead, "status" | "converted_prospect_id">): boolean {
  return lead.status === "nuevo" && lead.converted_prospect_id === null
}

/** Fuentes presentes en los datos, para poblar el selector sin lista fija. */
export function leadSources(leads: FunnelLead[]): string[] {
  return [...new Set(leads.map((l) => l.source))].sort()
}

export interface FunnelStep {
  key: string
  label: string
  count: number
  /** Porcentaje del paso anterior; `null` si no hay denominador. */
  rateFromPrevious: number | null
}

/**
 * Embudo: capturado → calificado (tiene diagnóstico) → convertido a prospecto.
 *
 * "Calificado" no es un paso que se apruebe o se rechace: es haber pasado por el
 * calificador de la landing. Un lead del checkout no tiene diagnóstico, así que
 * el paso lo cuenta tal cual en vez de darlo por bueno.
 */
export function buildLeadFunnel(leads: FunnelLead[]): FunnelStep[] {
  const total = leads.length
  const qualified = leads.filter((l) => l.qualification !== null).length
  const converted = leads.filter((l) => l.converted_prospect_id !== null).length

  return [
    { key: "captured", label: "Capturados", count: total, rateFromPrevious: null },
    {
      key: "qualified",
      label: "Calificados",
      count: qualified,
      rateFromPrevious: rate(qualified, total),
    },
    {
      key: "converted",
      label: "Convertidos a prospecto",
      count: converted,
      rateFromPrevious: rate(converted, total),
    },
  ]
}

/** Tasa en porcentaje entero, o `null` si el denominador es cero. */
export function rate(part: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((part / total) * 100)
}

/** Formatea una tasa para la UI sin inventar un cero cuando no se midió. */
export function formatRate(value: number | null): string {
  return value === null ? "No medido" : `${value}%`
}

export interface FunnelBySourceRow {
  source: string
  total: number
  qualified: number
  converted: number
  conversionRate: number | null
}

/** Desglose por fuente, de mayor a menor volumen. */
export function buildFunnelBySource(leads: FunnelLead[]): FunnelBySourceRow[] {
  const bySource = new Map<string, FunnelLead[]>()
  for (const lead of leads) {
    const bucket = bySource.get(lead.source)
    if (bucket) bucket.push(lead)
    else bySource.set(lead.source, [lead])
  }

  return [...bySource.entries()]
    .map(([source, group]) => {
      const converted = group.filter((l) => l.converted_prospect_id !== null).length
      return {
        source,
        total: group.length,
        qualified: group.filter((l) => l.qualification !== null).length,
        converted,
        conversionRate: rate(converted, group.length),
      }
    })
    .sort((a, b) => b.total - a.total || a.source.localeCompare(b.source))
}

export interface FunnelBySegmentRow {
  segment: string
  total: number
  converted: number
  conversionRate: number | null
}

/**
 * Desglose por segmento del calificador (A/B/C). Los leads sin diagnóstico se
 * agrupan en "sin diagnóstico" en vez de repartirse a ciegas.
 */
export function buildFunnelBySegment(leads: FunnelLead[]): FunnelBySegmentRow[] {
  const bySegment = new Map<string, FunnelLead[]>()
  for (const lead of leads) {
    const key = lead.qualification?.segment ?? "sin_diagnostico"
    const bucket = bySegment.get(key)
    if (bucket) bucket.push(lead)
    else bySegment.set(key, [lead])
  }

  return [...bySegment.entries()]
    .map(([segment, group]) => {
      const converted = group.filter((l) => l.converted_prospect_id !== null).length
      return {
        segment,
        total: group.length,
        converted,
        conversionRate: rate(converted, group.length),
      }
    })
    .sort((a, b) => b.total - a.total || a.segment.localeCompare(b.segment))
}

export interface LeadAgingBucket {
  key: string
  label: string
  count: number
}

/**
 * Antigüedad de los leads sin atender, en tramos. Sirve para ver de un golpe si
 * la bandeja se está pudriendo: un pendiente de más de una semana ya casi no se
 * contacta.
 */
export function buildPendingAging(leads: FunnelLead[], now: Date = new Date()): LeadAgingBucket[] {
  const buckets: LeadAgingBucket[] = [
    { key: "hoy", label: "Hoy", count: 0 },
    { key: "3d", label: "1 a 3 días", count: 0 },
    { key: "7d", label: "4 a 7 días", count: 0 },
    { key: "30d", label: "8 a 30 días", count: 0 },
    { key: "old", label: "Más de 30 días", count: 0 },
  ]
  const MS_DAY = 24 * 60 * 60 * 1000

  for (const lead of leads) {
    if (!isPending(lead)) continue
    const created = new Date(lead.created_at)
    if (Number.isNaN(created.getTime())) continue
    const days = Math.floor((now.getTime() - created.getTime()) / MS_DAY)
    const idx = days <= 0 ? 0 : days <= 3 ? 1 : days <= 7 ? 2 : days <= 30 ? 3 : 4
    const bucket = buckets[idx]
    if (bucket) bucket.count += 1
  }

  return buckets
}

/** Días completos transcurridos desde el alta; `null` si la fecha es inválida. */
export function daysPending(lead: Pick<FunnelLead, "created_at">, now: Date = new Date()): number | null {
  const created = new Date(lead.created_at)
  if (Number.isNaN(created.getTime())) return null
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / (24 * 60 * 60 * 1000)))
}
