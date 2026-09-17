/**
 * Motor puro del embudo de conversión (`/admin/conversion`).
 *
 * Regla de honestidad de datos, la misma del resto del panel: una tasa que no
 * se puede calcular es `null` ("No medido"), NUNCA 0. Un embudo sin pedidos no
 * es "0% de conversión", es "todavía no hay nada que medir".
 *
 * Regla de reconciliación: todo pedido cae en exactamente un desenlace, así que
 * `creados = pagados + fallidos + abandonados + cancelados + otros`. El embudo
 * anterior no cuadraba: contaba pagados y abandonados por separado y los pagos
 * con tarjeta rechazada no entraban en ninguno de los dos.
 *
 * Módulo puro: sin Supabase y sin React, para poder probar los bordes.
 */

import { isAbandonedCartOrder, type AbandonableOrder } from "@/lib/abandoned-cart"
import { compareMetric, type MetricComparison } from "@/lib/analytics-periods"
import { rate } from "@/lib/funnel-metrics"
import { DEFAULT_TIMEZONE } from "@/lib/local-date"
import { PAYMENT_METHOD_LABEL } from "@/lib/order-labels"

const DAY_MS = 24 * 60 * 60 * 1000

/** Lo mínimo que necesita el embudo de cada pedido. */
export interface FunnelOrder extends AbandonableOrder {
  id: number
  total: number
  utm_source?: string | null
}

/**
 * Desenlace de un pedido. Son excluyentes y exhaustivos: la suma de los cinco
 * SIEMPRE es el total de pedidos del periodo.
 *
 * `pending` es exactamente el conjunto que contacta el motor de recuperación
 * (`isAbandonedCartOrder`), no una definición paralela.
 */
export type OrderOutcome = "paid" | "failed" | "pending" | "cancelled" | "other"

/** Orden de presentación: primero el dinero, luego lo que se puede rescatar. */
export const OUTCOMES: readonly OrderOutcome[] = [
  "paid",
  "failed",
  "pending",
  "cancelled",
  "other",
]

export const OUTCOME_LABEL: Record<OrderOutcome, string> = {
  paid: "Pagados",
  failed: "Pago fallido",
  pending: "Abandonados",
  cancelled: "Cancelados",
  other: "Otros",
}

export const OUTCOME_DESCRIPTION: Record<OrderOutcome, string> = {
  paid: "El cobro se completó.",
  failed: "El cliente intentó pagar y el cobro fue rechazado. Hoy no recibe correo de recuperación.",
  pending:
    "Sin pagar y todavía en la ventana de recuperación (incluye OXXO, SPEI y CoDi; excluye contra entrega).",
  cancelled: "El pedido se canceló antes de cobrarse.",
  other: "Contra entrega en espera, reembolsos, disputas y montos incorrectos.",
}

/**
 * Clasifica un pedido en su desenlace.
 *
 * Prioridad `pagado → fallido → cancelado → abandonado → otro`. Un pago
 * rechazado gana sobre la cancelación a propósito: la tarjeta declinada es el
 * hecho que el panel debe mostrar, y esconderlo detrás de "cancelado" es
 * justamente el defecto que este módulo corrige. Un pedido pagado gana sobre
 * todo lo demás porque ya es dinero cobrado.
 */
export function classifyOrder(order: FunnelOrder): OrderOutcome {
  if (order.payment_status === "paid") return "paid"
  if (order.payment_status === "failed") return "failed"
  if (order.status === "cancelled") return "cancelled"
  if (isAbandonedCartOrder(order)) return "pending"
  return "other"
}

export interface ConversionFunnel {
  created: number
  paid: number
  failed: number
  pending: number
  cancelled: number
  other: number
  /** Tasa de pago en porcentaje entero; null si no hubo pedidos. */
  paidRate: number | null
  /** Suma de los cinco desenlaces. Debe igualar `created`. */
  classified: number
  /** true cuando los desenlaces reconcilian con el total. */
  reconciled: boolean
  /** Ingresos cobrados (suma de `total` de los pedidos pagados). */
  revenue: number
  /** Ticket promedio de los pagados; null si no hubo pagados. */
  avgTicket: number | null
}

/** Agrega el embudo del periodo y comprueba que reconcilia. */
export function buildFunnel(orders: FunnelOrder[]): ConversionFunnel {
  const counts = emptyCounts()
  let revenue = 0

  for (const order of orders) {
    // `+=` a propósito (no `?? 0`): un desenlace que no esté en OUTCOMES
    // produce NaN y `reconciled` lo delata en vez de esconderlo.
    counts[classifyOrder(order)] += 1
    if (order.payment_status === "paid") revenue += order.total
  }

  const created = orders.length
  const classified = OUTCOMES.reduce((sum, key) => sum + counts[key], 0)

  return {
    created,
    paid: counts.paid,
    failed: counts.failed,
    pending: counts.pending,
    cancelled: counts.cancelled,
    other: counts.other,
    paidRate: rate(counts.paid, created),
    classified,
    reconciled: classified === created,
    revenue: round2(revenue),
    avgTicket: counts.paid > 0 ? round2(revenue / counts.paid) : null,
  }
}

export interface OutcomeRow {
  key: OrderOutcome
  label: string
  description: string
  count: number
  /** Porcentaje del total; null si no hubo pedidos. */
  share: number | null
  /**
   * Suma de `total` del desenlace. Para `paid` son ingresos cobrados; para el
   * resto es valor que no entró (en `failed`, la intención de compra perdida).
   */
  amount: number
}

/** Construye las filas del desglose a partir de conteos e importes ya sumados. */
function outcomeRows(
  counts: Record<OrderOutcome, number>,
  amounts: Map<OrderOutcome, number>,
  total: number,
): OutcomeRow[] {
  return OUTCOMES.map((key) => ({
    key,
    label: OUTCOME_LABEL[key],
    description: OUTCOME_DESCRIPTION[key],
    count: counts[key],
    share: rate(counts[key], total),
    amount: round2(amounts.get(key) ?? 0),
  }))
}

/** Desglose por desenlace, en el orden de OUTCOMES. */
export function buildOutcomeBreakdown(orders: FunnelOrder[]): OutcomeRow[] {
  const amounts = new Map<OrderOutcome, number>()
  const counts = emptyCounts()

  for (const order of orders) {
    const outcome = classifyOrder(order)
    counts[outcome] += 1
    amounts.set(outcome, (amounts.get(outcome) ?? 0) + order.total)
  }

  return outcomeRows(counts, amounts, orders.length)
}

/**
 * Métodos que liquidan de forma asíncrona: el pedido se queda `pending` un rato
 * legítimamente mientras el cliente paga en tienda, transfiere o escanea el QR.
 *
 * `mercado_pago`, `card` y `stripe` quedan fuera a propósito: su confirmación es
 * inmediata, así que un `pending` ahí sí es abandono.
 */
const ASYNC_PAYMENT_METHODS: readonly string[] = ["oxxo", "spei", "codi", "cash_on_delivery"]

export function isAsyncPaymentMethod(method: string | null | undefined): boolean {
  return ASYNC_PAYMENT_METHODS.includes(method ?? "")
}

export interface MethodRow {
  /** Valor del enum, o `"(sin método)"` cuando la columna viene vacía. */
  method: string
  label: string
  created: number
  paid: number
  failed: number
  pending: number
  /** Tasa de pago en porcentaje entero; null si el método no tiene pedidos. */
  paidRate: number | null
  revenue: number
  /** true si el método liquida de forma asíncrona. */
  async: boolean
}

/**
 * Orden del desglose por método: más volumen primero; empate por etiqueta.
 * Se usa también al leer el resultado del RPC, para que el panel ordene igual
 * con agregado en Postgres y con agregado en JS.
 */
function compareMethodRows(a: MethodRow, b: MethodRow): number {
  return b.created - a.created || a.label.localeCompare(b.label, "es")
}

/**
 * Desglose por método de pago, de mayor a menor volumen. Responde por qué hay
 * abandonados: con tarjeta es un problema, con OXXO es el flujo normal.
 */
export function buildMethodBreakdown(orders: FunnelOrder[]): MethodRow[] {
  const groups = new Map<string, FunnelOrder[]>()
  for (const order of orders) {
    const key = order.payment_method ?? "(sin método)"
    const bucket = groups.get(key)
    if (bucket) bucket.push(order)
    else groups.set(key, [order])
  }

  return [...groups.entries()]
    .map(([method, group]) => {
      const funnel = buildFunnel(group)
      return {
        method,
        label: PAYMENT_METHOD_LABEL[method] ?? method,
        created: group.length,
        paid: funnel.paid,
        failed: funnel.failed,
        pending: funnel.pending,
        paidRate: funnel.paidRate,
        revenue: funnel.revenue,
        async: isAsyncPaymentMethod(method),
      }
    })
    .sort(compareMethodRows)
}

/** Fila mínima de `email_logs` que necesita el reporte de recuperación. */
export interface RecoveryLogRow {
  email_type: string
  order_id: number | null
}

/**
 * Toques de recuperación tal como se reportan en el panel.
 *
 * Los `type` son los `email_type` reales que escribe el motor
 * (`ABANDONED_CART_TOUCHES` en `@/lib/email-workflows`). Se declaran aquí en
 * vez de importarlos para no arrastrar el motor de correo entero (Resend,
 * plantillas, cupones) al route del panel; una prueba compara ambas listas y
 * falla si el motor añade o renombra un toque.
 *
 * Las etiquetas dicen la ventana real (2–26 / 26–50 / 50–74 h) y no "24h/48h":
 * el cron corre una vez al día, así que cada toque cubre 24 h, no un instante.
 */
export const RECOVERY_TOUCHES: readonly { type: string; label: string }[] = [
  { type: "abandoned_cart", label: "Toque 1 · 2–26 h (recordatorio)" },
  { type: "abandoned_cart_24h", label: "Toque 2 · 26–50 h (cupón 5%)" },
  { type: "abandoned_cart_48h", label: "Toque 3 · 50–74 h (último aviso)" },
]

export interface RecoveryTouchRow {
  type: string
  label: string
  /** Correos enviados (filas de `email_logs`). */
  sent: number
  /** Pedidos distintos contactados por este toque. */
  contacted: number
  /** De los contactados, cuántos acabaron pagados. */
  recoveredOrders: number
  /** Ingresos de esos pedidos. */
  revenue: number
  /**
   * `recoveredOrders / contacted` en porcentaje entero; null si el toque no
   * contactó a nadie (hoy es el caso real: la secuencia nunca se ha disparado).
   */
  rate: number | null
}

/**
 * Cruza los correos de recuperación con el desenlace de los pedidos.
 *
 * Mide **correlación, no causalidad**: un pedido contactado que acabó pagado
 * pudo pagar por el correo o por su cuenta, y este cálculo no puede
 * distinguirlo. Por eso la etiqueta del panel dice "pedidos con este toque que
 * acabaron pagados" y nunca "recuperados por el correo".
 *
 * Los correos cuyo pedido cae fuera del periodo cuentan en el denominador pero
 * no pueden acreditarse: el sesgo va en la dirección conservadora (subestima).
 */
export function buildRecoveryByTouch(
  touches: readonly { type: string; label: string }[],
  logs: RecoveryLogRow[],
  orders: FunnelOrder[],
): RecoveryTouchRow[] {
  const outcomeById = new Map(orders.map((o) => [o.id, classifyOrder(o)]))
  const totalById = new Map(orders.map((o) => [o.id, o.total]))

  return touches.map((touch) => {
    const mine = logs.filter((log) => log.email_type === touch.type)
    const contacted = new Set<number>()
    for (const log of mine) {
      if (log.order_id !== null) contacted.add(log.order_id)
    }

    let recoveredOrders = 0
    let revenue = 0
    for (const orderId of contacted) {
      if (outcomeById.get(orderId) !== "paid") continue
      recoveredOrders += 1
      revenue += totalById.get(orderId) ?? 0
    }

    return {
      type: touch.type,
      label: touch.label,
      sent: mine.length,
      contacted: contacted.size,
      recoveredOrders,
      revenue: round2(revenue),
      rate: rate(recoveredOrders, contacted.size),
    }
  })
}

export interface UtmRow {
  source: string
  created: number
  paid: number
  failed: number
  /** Tasa de pago en porcentaje entero; null si la fuente no tiene pedidos. */
  paidRate: number | null
  revenue: number
}

export const DIRECT_SOURCE = "(directo)"

/** Orden del desglose UTM: ingresos primero; empate por volumen y luego nombre. */
function compareUtmRows(a: UtmRow, b: UtmRow): number {
  return b.revenue - a.revenue || b.created - a.created || a.source.localeCompare(b.source, "es")
}

/**
 * Desglose por origen UTM, ordenado por ingresos.
 *
 * Ordenar por ingresos y no por volumen responde la pregunta útil —qué canal
 * convierte— en vez de "qué canal manda más pedidos".
 */
export function buildUtmBreakdown(orders: FunnelOrder[], limit = 10): UtmRow[] {
  const groups = new Map<string, FunnelOrder[]>()
  for (const order of orders) {
    const key = order.utm_source?.trim() || DIRECT_SOURCE
    const bucket = groups.get(key)
    if (bucket) bucket.push(order)
    else groups.set(key, [order])
  }

  return [...groups.entries()]
    .map(([source, group]) => {
      const funnel = buildFunnel(group)
      return {
        source,
        created: group.length,
        paid: funnel.paid,
        failed: funnel.failed,
        paidRate: funnel.paidRate,
        revenue: funnel.revenue,
      }
    })
    .sort(compareUtmRows)
    .slice(0, limit)
}

// ── Lectura del agregado que calcula Postgres ────────────────────
//
// `admin_conversion_funnel` (migración 00141) devuelve el embudo ya sumado en
// una sola vuelta, sin traer filas ni toparse con el límite de `max-rows` de
// PostgREST. Este parser lo traduce a los mismos tipos que produce el motor en
// JS, de modo que el panel no sepa de dónde vino el número.
//
// Las listas se reordenan aquí con los comparadores de arriba en vez de confiar
// en el ORDER BY del SQL: así el orden es idéntico en los dos caminos.

function asArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export interface ParsedWindow {
  funnel: ConversionFunnel
  outcomes: OutcomeRow[]
  methods: MethodRow[]
  utm: UtmRow[]
}

/**
 * Traduce una ventana del RPC a los tipos del panel.
 *
 * Devuelve `null` si el payload no tiene forma de ventana (por ejemplo si la
 * función cambió de firma), para que el route pueda degradar en vez de reventar.
 * Los desenlaces desconocidos se ignoran en el conteo a propósito: entonces
 * `classified < created` y `reconciled` queda en `false`, que es la señal de
 * alarma en vez de un número silenciosamente mal.
 */
export function parseRpcWindow(raw: unknown): ParsedWindow | null {
  if (typeof raw !== "object" || raw === null) return null
  const window = raw as Record<string, unknown>
  if (!Array.isArray(window.byOutcome)) return null

  const counts = emptyCounts()
  const amounts = new Map<OrderOutcome, number>()
  for (const entry of asArray(window.byOutcome)) {
    const outcome = entry.outcome
    if (typeof outcome !== "string") continue
    if (!(OUTCOMES as readonly string[]).includes(outcome)) continue
    const key = outcome as OrderOutcome
    counts[key] += num(entry.count)
    amounts.set(key, (amounts.get(key) ?? 0) + num(entry.amount))
  }

  const created = num(window.created)
  const classified = OUTCOMES.reduce((sum, key) => sum + counts[key], 0)
  const revenue = round2(amounts.get("paid") ?? 0)

  const funnel: ConversionFunnel = {
    created,
    paid: counts.paid,
    failed: counts.failed,
    pending: counts.pending,
    cancelled: counts.cancelled,
    other: counts.other,
    paidRate: rate(counts.paid, created),
    classified,
    reconciled: classified === created,
    revenue,
    avgTicket: counts.paid > 0 ? round2(revenue / counts.paid) : null,
  }

  const methods: MethodRow[] = asArray(window.byMethod)
    .map((entry) => {
      const method = typeof entry.method === "string" && entry.method ? entry.method : "(sin método)"
      const methodCreated = num(entry.created)
      const paid = num(entry.paid)
      return {
        method,
        label: PAYMENT_METHOD_LABEL[method] ?? method,
        created: methodCreated,
        paid,
        failed: num(entry.failed),
        pending: num(entry.pending),
        paidRate: rate(paid, methodCreated),
        revenue: round2(num(entry.revenue)),
        async: isAsyncPaymentMethod(method),
      }
    })
    .sort(compareMethodRows)

  const utm: UtmRow[] = asArray(window.byUtm)
    .map((entry) => {
      const source = typeof entry.source === "string" && entry.source ? entry.source : DIRECT_SOURCE
      const sourceCreated = num(entry.created)
      const paid = num(entry.paid)
      return {
        source,
        created: sourceCreated,
        paid,
        failed: num(entry.failed),
        paidRate: rate(paid, sourceCreated),
        revenue: round2(num(entry.revenue)),
      }
    })
    .sort(compareUtmRows)

  return {
    funnel,
    outcomes: outcomeRows(counts, amounts, created),
    methods,
    utm,
  }
}

// ── Comparación contra el periodo anterior ───────────────────────

export interface FunnelComparison {
  previous: ConversionFunnel
  created: MetricComparison
  paid: MetricComparison
  failed: MetricComparison
  pending: MetricComparison
  cancelled: MetricComparison
  revenue: MetricComparison
  /**
   * Diferencia de la tasa de pago en **puntos porcentuales**, que es lo que se
   * lee de un vistazo ("+4 pp"). Comparar dos tasas en porcentaje relativo
   * confunde cuando la base cambia de tamaño. `null` si alguno de los dos
   * periodos no tiene denominador.
   */
  paidRateDeltaPp: number | null
  /**
   * Comparación del ticket promedio. `null` cuando **alguno** de los dos
   * periodos no tuvo pagados: un promedio que no se puede calcular no es una
   * caída del 100%, es "no medido", y esa distinción es justo la que el panel
   * no puede perder.
   */
  avgTicket: MetricComparison | null
}

/**
 * Compara el embudo actual con el del periodo anterior de igual duración.
 *
 * Los conteos usan `compareMetric`, que devuelve `deltaPct: null` cuando el
 * periodo anterior está en cero: "antes no había nada" no es un crecimiento
 * medible y se pinta "sin base", no "+∞%" ni "0%".
 */
export function buildFunnelComparison(
  current: ConversionFunnel,
  previous: ConversionFunnel,
): FunnelComparison {
  return {
    previous,
    created: compareMetric(current.created, previous.created),
    paid: compareMetric(current.paid, previous.paid),
    failed: compareMetric(current.failed, previous.failed),
    pending: compareMetric(current.pending, previous.pending),
    cancelled: compareMetric(current.cancelled, previous.cancelled),
    revenue: compareMetric(current.revenue, previous.revenue),
    paidRateDeltaPp:
      current.paidRate === null || previous.paidRate === null
        ? null
        : current.paidRate - previous.paidRate,
    avgTicket:
      current.avgTicket === null || previous.avgTicket === null
        ? null
        : compareMetric(current.avgTicket, previous.avgTicket),
  }
}

// ── Comparación de los desgloses fila por fila ───────────────────
//
// El embudo compara cinco conteos que siempre existen; un desglose compara
// filas que aparecen y desaparecen (un método nuevo, una campaña que se apaga).
// Por eso la comparación se indexa por la clave de la fila y **no** se alinea
// por posición: alinear por índice compararía "tarjeta" contra "OXXO".

/** Comparación de una fila de desglose (método de pago u origen UTM). */
export interface BreakdownDelta {
  created: MetricComparison
  paid: MetricComparison
  /**
   * Diferencia de la tasa de pago en puntos porcentuales. `null` cuando
   * cualquiera de las dos filas se queda sin denominador.
   */
  paidRateDeltaPp: number | null
}

/** Fila de desglose comparable: lo mínimo que necesitan ambos desgloses. */
interface ComparableRow {
  created: number
  paid: number
  paidRate: number | null
}

function compareBreakdown<T extends ComparableRow>(
  current: T[],
  previous: T[],
  keyOf: (row: T) => string,
): Record<string, BreakdownDelta> {
  const before = new Map(previous.map((row) => [keyOf(row), row]))
  const out: Record<string, BreakdownDelta> = {}
  for (const row of current) {
    // Una fila que no existía antes entra con base cero, no se omite: así el
    // panel dice "sin base" (compareMetric → deltaPct null) en vez de dejar la
    // celda muda, y el lector ve que la fila es nueva.
    const prev = before.get(keyOf(row)) ?? { created: 0, paid: 0, paidRate: null }
    out[keyOf(row)] = {
      created: compareMetric(row.created, prev.created),
      paid: compareMetric(row.paid, prev.paid),
      paidRateDeltaPp:
        row.paidRate === null || prev.paidRate === null
          ? null
          : row.paidRate - prev.paidRate,
    }
  }
  return out
}

/** Comparación del desglose por método de pago, indexada por `method`. */
export function buildMethodComparison(
  current: MethodRow[],
  previous: MethodRow[],
): Record<string, BreakdownDelta> {
  return compareBreakdown(current, previous, (row) => row.method)
}

/**
 * Comparación del desglose por origen UTM, indexada por `source`.
 *
 * Los dos desgloses vienen recortados a los 10 orígenes con más ingresos, así
 * que un origen visible en el periodo actual puede faltar en la lista del
 * anterior aunque haya tenido pedidos. Ese caso sale como "sin base" y es
 * honesto: no se afirma que fuera cero, solo que no hay base comparable.
 */
export function buildUtmComparison(
  current: UtmRow[],
  previous: UtmRow[],
): Record<string, BreakdownDelta> {
  return compareBreakdown(current, previous, (row) => row.source)
}

// ── Tendencia diaria ─────────────────────────────────────────────

/**
 * Punto diario del embudo. `date` es el día **local del restaurante**
 * (`YYYY-MM-DD`), no UTC: un pedido de las 20:00 en México pertenece a ese día
 * aunque en UTC ya sea el siguiente, y agrupar por UTC movería a la noche
 * pedidos que el negocio contó el día anterior.
 */
export interface TrendPoint {
  date: string
  created: number
  paid: number
  failed: number
  pending: number
  cancelled: number
  other: number
  revenue: number
  /**
   * El día está cortado por el borde de la ventana. La ventana es móvil (30×24 h
   * desde ahora), así que el primer y el último día casi siempre están
   * incompletos: sin esta marca, la caída del borde se lee como una caída real.
   */
  partial: boolean
}

/** Pedido con la fecha que necesita la tendencia. */
export interface TrendOrder extends FunnelOrder {
  created_at: string
}

/**
 * Clave de día local (`YYYY-MM-DD`) de un instante. Se usa el locale `en-CA`
 * porque formatea en ISO: así no hay que armar la cadena a mano ni arriesgar
 * ceros a la izquierda. Un valor inválido devuelve cadena vacía, que nunca
 * coincide con un día de la ventana.
 */
export function localDayKey(
  value: string | Date,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const date = typeof value === "string" ? new Date(value) : value
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

/**
 * Serie diaria de creados, desenlaces e ingresos entre `since` (incluido) y
 * `until` (excluido).
 *
 * Emite **un punto por día local que la ventana toca**, incluidos los días sin
 * pedidos: una gráfica que solo dibuja los días con datos miente sobre la forma
 * de la serie, porque un hueco se ve igual que un cero. La ventana se recorre en
 * pasos de 24 h y se deduplica la clave local, de modo que un cambio de horario
 * de verano no duplica ni se salta un día.
 *
 * Como la ventana es móvil, el primer y el último día casi siempre quedan
 * cortados por un borde; se marcan `partial` para que nadie lea esa caída como
 * una caída del negocio.
 *
 * Los pedidos fuera de la ventana se ignoran en vez de sumarse: el llamador ya
 * filtró, y colarlos haría que la serie no cuadrara con el embudo.
 */
export function buildFunnelTrend(
  orders: TrendOrder[],
  since: string | Date,
  until: string | Date,
  timeZone: string = DEFAULT_TIMEZONE,
): TrendPoint[] {
  const sinceMs = new Date(since).getTime()
  const untilMs = new Date(until).getTime()
  if (!Number.isFinite(sinceMs) || !Number.isFinite(untilMs) || untilMs <= sinceMs) return []

  const days: string[] = []
  for (let t = sinceMs; t < untilMs; t += DAY_MS) {
    const key = localDayKey(new Date(t), timeZone)
    if (days.at(-1) !== key) days.push(key)
  }
  // El último instante de la ventana puede caer en un día que ningún paso tocó
  // (cuando la ventana no es múltiplo exacto de 24 h).
  const lastKey = localDayKey(new Date(untilMs - 1), timeZone)
  if (days.at(-1) !== lastKey) days.push(lastKey)

  // Un instante es el arranque de un día local si el milisegundo anterior
  // pertenece a otro día. Así se detectan los bordes exactos sin calcular el
  // desfase de la zona (que cambia con el horario de verano).
  const startsLocalDay = (t: number) =>
    localDayKey(new Date(t - 1), timeZone) !== localDayKey(new Date(t), timeZone)

  const partialKeys = new Set<string>()
  const firstDay = days.at(0)
  const finalDay = days.at(-1)
  if (firstDay && !startsLocalDay(sinceMs)) partialKeys.add(firstDay)
  if (finalDay && !startsLocalDay(untilMs)) partialKeys.add(finalDay)

  const points = new Map<string, TrendPoint>(
    days.map((date) => [
      date,
      {
        date,
        created: 0,
        paid: 0,
        failed: 0,
        pending: 0,
        cancelled: 0,
        other: 0,
        revenue: 0,
        partial: partialKeys.has(date),
      },
    ]),
  )

  for (const order of orders) {
    // La misma ventana semiabierta que el SQL (`>= since`, `< until`): agrupar
    // solo por día contaría un pedido del borde superior, y uno anterior al
    // arranque de un primer día incompleto.
    const at = new Date(order.created_at).getTime()
    if (!Number.isFinite(at) || at < sinceMs || at >= untilMs) continue
    const point = points.get(localDayKey(order.created_at, timeZone))
    if (!point) continue
    point.created += 1
    point[classifyOrder(order)] += 1
    if (order.payment_status === "paid") point.revenue += order.total
  }

  return days.map((date) => {
    const point = points.get(date) as TrendPoint
    return { ...point, revenue: round2(point.revenue) }
  })
}

export interface ConversionFunnelCsvInput {
  days: number
  funnel: ConversionFunnel
  outcomes: OutcomeRow[]
  methods: MethodRow[]
  recovery: RecoveryTouchRow[]
  /** null cuando las columnas UTM no existen en la base desplegada. */
  utm: UtmRow[] | null
}

/** CSV es-MX (separador `;`) con BOM, mismo patrón que la comparativa. */
export function conversionFunnelToCsv(input: ConversionFunnelCsvInput): string {
  const { days, funnel, outcomes, methods, recovery, utm } = input
  const escape = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const pct = (v: number | null) => (v === null ? "No medido" : `${v}%`)
  const money = (v: number) => v.toFixed(2)

  const rows: string[][] = [
    ["Período (días)", String(days), "", ""],
    ["Pedidos creados", String(funnel.created), "", ""],
    ["Pagados", String(funnel.paid), pct(funnel.paidRate), money(funnel.revenue)],
    ["Ticket promedio", funnel.avgTicket === null ? "No medido" : money(funnel.avgTicket), "", ""],
    ...outcomes.map((o) => [
      `Desenlace: ${o.label}`,
      String(o.count),
      pct(o.share),
      money(o.amount),
    ]),
    ...methods.map((m) => [
      `Método: ${m.label}`,
      String(m.created),
      pct(m.paidRate),
      money(m.revenue),
    ]),
    ...recovery.map((r) => [
      `Recuperación: ${r.label}`,
      String(r.sent),
      pct(r.rate),
      money(r.revenue),
    ]),
    ...(utm ?? []).map((u) => [`UTM: ${u.source}`, String(u.created), pct(u.paidRate), money(u.revenue)]),
  ]

  const header = "Métrica;Cantidad;Tasa;Importe"
  return "﻿" + [header, ...rows.map((r) => r.map(escape).join(";"))].join("\r\n")
}

function emptyCounts(): Record<OrderOutcome, number> {
  const counts = {} as Record<OrderOutcome, number>
  for (const key of OUTCOMES) counts[key] = 0
  return counts
}

/** Redondeo a centavos: los totales vienen de Postgres como numéricos. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}
