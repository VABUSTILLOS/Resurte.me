"use client"

import { useEffect, useRef } from "react"
import { useSyncedStorage } from "@/hooks/use-synced-storage"
import type { HubAlert } from "./hub-data"

export interface AlertHistoryEvent {
  id: string
  title: string
  type: HubAlert["type"]
  at: string // ISO timestamp of the firing
}

export const ALERT_HISTORY_KEY = "alertas-historial"
const MAX_EVENTS = 200

/**
 * Registra en el historial sincronizado cada alerta del hub que se dispara.
 * Una alerta se cuenta como "disparada" cuando aparece sin estar activa en la
 * evaluación anterior (primera carga no graba: evita inundar el historial con
 * las alertas ya presentes al abrir el panel).
 */
export function useAlertHistory(alerts: HubAlert[], collectionSlug: string | null) {
  const [, setHistory] = useSyncedStorage<AlertHistoryEvent[]>(ALERT_HISTORY_KEY, [], collectionSlug)
  const prevActiveRef = useRef<Set<string> | null>(null)

  useEffect(() => {
    const currentIds = new Set(alerts.map((a) => a.id))
    const prev = prevActiveRef.current
    prevActiveRef.current = currentIds
    if (prev === null) return // primera evaluación: solo inicializar
    const newFirings = alerts.filter((a) => !prev.has(a.id))
    if (newFirings.length === 0) return
    const now = new Date().toISOString()
    const events: AlertHistoryEvent[] = newFirings.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      at: now,
    }))
    setHistory((h) => [...events, ...h].slice(0, MAX_EVENTS))
  }, [alerts, setHistory])
}
