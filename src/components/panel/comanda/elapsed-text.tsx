"use client"

import { memo } from "react"
import { useNow } from "@/hooks/use-now"
import { t } from "@/lib/i18n/es"

/**
 * Etiqueta de minutos transcurridos. Se suscribe al reloj compartido de
 * 30s para que el tick solo re-renderice esta hoja y no todo el board.
 */
export const ElapsedText = memo(function ElapsedText({
  since,
  variant,
}: {
  since: number
  variant: "waiting" | "age"
}) {
  const now = useNow()
  const min = Math.max(1, Math.round((now - since) / 60000))
  return <>{t(variant === "waiting" ? "comanda.waiting" : "comanda.age", { min })}</>
})
