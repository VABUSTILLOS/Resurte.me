/**
 * Alertas operativas del dashboard admin: a dónde lleva cada una y en qué orden
 * se muestran.
 *
 * El dashboard ya calcula *qué* está mal (`getAdminAlerts` en
 * `src/app/admin/actions.ts`); aquí vive el enlace exacto al recurso que hay que
 * atender, para que las páginas destino no reciban rutas sin filtrar ni
 * auto-enlaces. Es la fuente única: la UI y las acciones admin consumen esto en
 * lugar de escribir hrefs a mano.
 */

export type AdminAlertKind =
  | "stale_pending"
  | "out_of_stock"
  | "low_stock"
  | "coupon_expiring"
  | "new_leads"

export type AdminAlertSeverity = "critical" | "warning" | "info"

/** Origen mínimo para resolver un enlace. */
export interface AlertLinkSource {
  kind: AdminAlertKind
  /** Código del cupón; solo lo usa `coupon_expiring`. */
  code?: string | null
}

/**
 * Los leads son el CRM de prospectos: no hay un filtro que aislar, la lista
 * completa es el destino.
 */
export const ADMIN_LEADS_HREF = "/admin/leads"

/**
 * Enlace al recurso concreto de cada alerta. Los parámetros coinciden con los
 * que aceptan las páginas destino (`/admin/pedidos?status=`, `/admin/productos?stock=`,
 * `/admin/marketing?code=`), de modo que aterrizar en la alerta deja el filtro
 * ya aplicado en lugar de una lista sin filtrar.
 */
export function buildAlertHref(alert: AlertLinkSource): string {
  switch (alert.kind) {
    case "stale_pending":
      return "/admin/pedidos?status=pending"
    case "out_of_stock":
      return "/admin/productos?stock=out_of_stock"
    case "low_stock":
      return "/admin/productos?stock=low_stock"
    case "coupon_expiring": {
      const code = alert.code?.trim()
      return code ? `/admin/marketing?code=${encodeURIComponent(code)}` : "/admin/marketing"
    }
    case "new_leads":
      return ADMIN_LEADS_HREF
  }
}

const SEVERITY_RANK: Record<AdminAlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

/**
 * Ordena por severidad (crítica primero). El sort es estable, así que dentro de
 * cada nivel se conserva el orden en que las alertas llegaron.
 */
export function sortAlertsBySeverity<T extends { severity: AdminAlertSeverity }>(
  alerts: readonly T[]
): T[] {
  return alerts
    .map((alert, index) => ({ alert, index }))
    .sort((a, b) => {
      const bySeverity = SEVERITY_RANK[a.alert.severity] - SEVERITY_RANK[b.alert.severity]
      return bySeverity !== 0 ? bySeverity : a.index - b.index
    })
    .map(({ alert }) => alert)
}
