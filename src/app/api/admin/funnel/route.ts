import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { createServiceClient } from "@/lib/supabase/service"
import { logger } from "@/lib/logger"
import { isPeriodDays, periodBounds, type PeriodDays } from "@/lib/analytics-periods"
import {
  buildFunnel,
  buildFunnelComparison,
  buildFunnelTrend,
  buildMethodBreakdown,
  buildMethodComparison,
  buildOutcomeBreakdown,
  buildRecoveryByTouch,
  buildUtmBreakdown,
  buildUtmComparison,
  parseRpcWindow,
  RECOVERY_TOUCHES,
  type BreakdownDelta,
  type ConversionFunnel,
  type FunnelComparison,
  type FunnelOrder,
  type MethodRow,
  type OutcomeRow,
  type RecoveryLogRow,
  type RecoveryTouchRow,
  type TrendOrder,
  type TrendPoint,
  type UtmRow,
} from "@/lib/conversion-funnel"

export const runtime = "nodejs"

/**
 * GET /api/admin/funnel?days=30
 *
 * Embudo de conversión del carrito de alta conversión: creados → pagados, con
 * el desglose por desenlace, por método de pago y por origen UTM, la
 * recuperación por toque y el take-rate de bumps y upsells 1-click.
 *
 * Tres reglas gobiernan esta ruta:
 *
 *  1. **Exactitud.** El agregado lo calcula `admin_conversion_funnel` en
 *     Postgres (migración 00141), que suma sin traer filas y sin toparse con el
 *     límite de `max-rows` de PostgREST. Contar en Node sobre las filas
 *     descargadas mentía en silencio a partir de ~1000 pedidos. Si la migración
 *     no está aplicada se cae al motor en JS (`@/lib/conversion-funnel`), que
 *     es la referencia semántica que el SQL replica; una prueba de contrato
 *     vigila que no deriven.
 *
 *  2. **Ninguna sección tumba la respuesta.** Cada una degrada por su cuenta y
 *     se anuncia en `degraded`. Antes, una columna sin migrar o una tabla
 *     ausente devolvían un 500 y la página solo podía decir "Error al cargar el
 *     funnel".
 *
 *  3. **Una tasa sin denominador es `null`** ("No medido"), nunca 0.
 *
 *  4. **Lo incompleto se declara.** `detailTruncated`, `recoveryTruncated` y
 *     `takeRateTruncated` dicen en qué sección un tope de filas pudo dejar el
 *     número corto, en vez de devolver una cifra exacta pero falsa. La
 *     tendencia diaria se apaga (`trendUnavailable`) cuando ese tope la
 *     volvería una gráfica sesgada.
 */

/** Filas de pedidos que se traen para las secciones por pedido. */
const DETAIL_LIMIT = 2000
/** Filas de `email_logs` que se traen para el reporte de recuperación. */
const RECOVERY_LOG_LIMIT = 2000
/**
 * Tope de ids de pedidos pagados que se mandan en un `in(...)`. PostgREST
 * codifica la lista en la URL, así que no puede crecer sin límite.
 */
const TAKE_RATE_ID_LIMIT = 1000

/** Secciones cuyo cálculo puede quedar incompleto o no estar disponible. */
type DegradedSection =
  | "funnel"
  | "outcomes"
  | "methods"
  | "utm"
  | "recovery"
  | "comparison"
  | "bumpTakeRate"
  | "upsellTakeRate"

/**
 * Motivo por el que la tendencia diaria no se puede dibujar.
 *
 * La serie se arma con la misma lectura por pedido que alimenta la
 * recuperación, y esa lectura viene topeada por `DETAIL_LIMIT` y ordenada por
 * fecha **descendente**. Con un corte, la serie no sería "un poco corta": los
 * últimos días quedarían completos y los primeros artificialmente bajos, es
 * decir, dibujaría un crecimiento que no ocurrió. Por eso se omite y se dice
 * por qué, en vez de graficar una mentira.
 */
type TrendUnavailable = "truncated" | "detailError" | null

interface FunnelResponse {
  /** Periodo efectivo. Solo 7/30/90 (las del selector) tienen comparación. */
  days: PeriodDays
  since: string
  until: string
  generatedAt: string
  /** De dónde salió el agregado: la RPC en Postgres o el motor en JS. */
  source: "rpc" | "fallback"
  funnel: ConversionFunnel | null
  outcomes: OutcomeRow[]
  methods: MethodRow[]
  /** `null` si `utm_source` todavía no está migrada (no es "todo directo"). */
  utm: UtmRow[] | null
  /** `null` si la lectura de `email_logs` falló (distinto de "no hubo envíos"). */
  recovery: RecoveryTouchRow[] | null
  comparison: FunnelComparison | null
  /**
   * Delta del periodo anterior por método de pago, indexado por `method`.
   * `null` cuando no hay periodo anterior comparable.
   */
  methodComparison: Record<string, BreakdownDelta> | null
  /** Delta del periodo anterior por origen UTM, indexado por `source`. */
  utmComparison: Record<string, BreakdownDelta> | null
  /**
   * Serie diaria de creados/pagados/ingresos, un punto por día del periodo.
   * `null` cuando no se puede calcular: ver `trendUnavailable`.
   */
  trend: TrendPoint[] | null
  /** Por qué falta la tendencia; `null` cuando sí está. */
  trendUnavailable: TrendUnavailable
  bumpTakeRate: number | null
  upsellTakeRate: number | null
  /**
   * `true` cuando la lectura por pedido topó con `DETAIL_LIMIT`. Con el
   * agregado en Postgres el embudo sigue siendo exacto; lo que puede quedar
   * corto es la atribución de recuperación y el take-rate.
   */
  detailTruncated: boolean
  /**
   * `true` cuando se leyeron `RECOVERY_LOG_LIMIT` correos de recuperación: pudo
   * haber más, así que la tasa por toque puede quedar corta.
   */
  recoveryTruncated: boolean
  /**
   * `true` cuando los pedidos pagados del periodo superaron
   * `TAKE_RATE_ID_LIMIT`. El take-rate se calcula sobre los primeros mil ids,
   * que ordenados por fecha descendente son los más recientes: es una muestra,
   * no el total.
   */
  takeRateTruncated: boolean
  degraded: DegradedSection[]
}

/** Lo que necesitan las secciones por pedido de cada fila de `orders`. */
interface OrderDetailRow {
  id: number
  status: string
  payment_status: string | null
  payment_method: string | null
  total: number | string
  created_at: string
  utm_source?: string | null
}

const ORDER_DETAIL_COLUMNS = "id, status, payment_status, payment_method, total, created_at"
const ORDER_DETAIL_COLUMNS_WITH_UTM = `${ORDER_DETAIL_COLUMNS}, utm_source`

/** `total` llega como string desde Postgres (`numeric`). */
function toFunnelOrder(row: OrderDetailRow): FunnelOrder {
  return {
    id: row.id,
    status: row.status,
    payment_status: row.payment_status,
    payment_method: row.payment_method,
    total: Number(row.total) || 0,
    utm_source: row.utm_source ?? null,
  }
}

/** El mismo pedido, con la fecha que necesita la tendencia diaria. */
function toTrendOrder(row: OrderDetailRow): TrendOrder {
  return { ...toFunnelOrder(row), created_at: row.created_at }
}

export async function GET(request: Request) {
  const degraded: DegradedSection[] = []

  try {
    const { response: adminDenied } = await requireAdmin()
    if (adminDenied) return adminDenied

    const { searchParams } = new URL(request.url)
    // Solo 7/30/90 son opciones del selector y las únicas con periodo anterior
    // comparable; cualquier otro valor cae a 30 en vez de devolver un embudo
    // que el panel no puede comparar.
    const requested = Number(searchParams.get("days"))
    const days: PeriodDays = isPeriodDays(requested) ? requested : 30

    const now = new Date()
    const { since, prevSince, prevUntil } = periodBounds(days, now)
    const sinceIso = since.toISOString()
    const untilIso = now.toISOString()

    const supabase = await createServiceClient()

    // ── Agregados: RPC en Postgres, con respaldo en el motor JS ──
    let source: FunnelResponse["source"] = "rpc"
    let funnel: ConversionFunnel | null = null
    let outcomes: OutcomeRow[] = []
    let methods: MethodRow[] = []
    let utm: UtmRow[] | null = null
    let comparison: FunnelComparison | null = null
    let methodComparison: Record<string, BreakdownDelta> | null = null
    let utmComparison: Record<string, BreakdownDelta> | null = null

    const rpc = await supabase.rpc("admin_conversion_funnel", {
      p_since: sinceIso,
      p_until: untilIso,
      p_prev_since: prevSince.toISOString(),
      p_prev_until: prevUntil.toISOString(),
    })

    const payload = rpc.error ? null : (rpc.data as Record<string, unknown> | null)
    const parsed = payload ? parseRpcWindow(payload.current) : null

    if (parsed) {
      funnel = parsed.funnel
      outcomes = parsed.outcomes
      methods = parsed.methods
      utm = parsed.utm
      const previous = parseRpcWindow(payload?.previous)
      // `previous` es null solo si no se pidió comparación; con las cuatro
      // fechas siempre llega una ventana, aunque esté en cero.
      if (previous) {
        comparison = buildFunnelComparison(parsed.funnel, previous.funnel)
        methodComparison = buildMethodComparison(parsed.methods, previous.methods)
        // Con la RPC viva `utm_source` existe por fuerza (la función la
        // referencia), así que aquí la comparación siempre es medible: un
        // origen ausente en el periodo anterior entra con base cero.
        utmComparison = buildUtmComparison(parsed.utm, previous.utm)
      } else {
        degraded.push("comparison")
      }
    } else {
      source = "fallback"
      degraded.push("funnel", "outcomes", "methods")
      logger.warn("[ADMIN-FUNNEL] agregado en Postgres no disponible, se usa el motor JS", {
        code: rpc.error?.code,
        message: rpc.error?.message,
      })
    }

    // ── Detalle por pedido ───────────────────────────────────────
    // Alimenta la atribución de recuperación (pedido → desenlace) y el
    // denominador del take-rate. En el respaldo la misma lectura cubre el
    // periodo anterior, ordenada por fecha descendente para que un corte por
    // límite se lleve primero lo viejo.
    const detailFrom = source === "fallback" ? prevSince.toISOString() : sinceIso

    // El tipo de fila lo infiere TypeScript del `select` literal, así que las
    // dos variantes (con y sin `utm_source`) se escriben por separado y se
    // normalizan a esta forma laxa.
    let detail: { data: unknown; error: { code?: string; message?: string } | null }
    if (source === "fallback") {
      detail = await supabase
        .from("orders")
        .select(ORDER_DETAIL_COLUMNS_WITH_UTM)
        .gte("created_at", detailFrom)
        .lt("created_at", untilIso)
        .order("created_at", { ascending: false })
        .limit(DETAIL_LIMIT)
    } else {
      detail = await supabase
        .from("orders")
        .select(ORDER_DETAIL_COLUMNS)
        .gte("created_at", detailFrom)
        .lt("created_at", untilIso)
        .order("created_at", { ascending: false })
        .limit(DETAIL_LIMIT)
    }

    // 42703 = columna utm_source aún no migrada → reintentar sin ella
    if (detail.error?.code === "42703") {
      detail = await supabase
        .from("orders")
        .select(ORDER_DETAIL_COLUMNS)
        .gte("created_at", detailFrom)
        .lt("created_at", untilIso)
        .order("created_at", { ascending: false })
        .limit(DETAIL_LIMIT)
    }

    if (detail.error) {
      degraded.push("recovery", "bumpTakeRate", "upsellTakeRate")
      logger.error("[ADMIN-FUNNEL] no se pudo leer el detalle de pedidos:", detail.error)
    }

    const detailRows = (detail.error ? [] : (detail.data ?? [])) as OrderDetailRow[]
    const detailTruncated = detailRows.length >= DETAIL_LIMIT
    const currentRows = detailRows.filter((row) => row.created_at >= sinceIso)
    const currentOrders = currentRows.map(toFunnelOrder)

    if (source === "fallback" && !detail.error) {
      const current = buildFunnel(currentOrders)
      funnel = current
      outcomes = buildOutcomeBreakdown(currentOrders)
      methods = buildMethodBreakdown(currentOrders)

      const previousOrders = detailRows
        .filter((row) => row.created_at < sinceIso)
        .map(toFunnelOrder)

      if (detailTruncated) {
        // El corte pudo llevarse pedidos del periodo anterior y del actual: la
        // comparación se omite en vez de mostrar una caída inventada, y los
        // agregados ya están marcados como degradados arriba.
        degraded.push("comparison")
      } else {
        const previous = buildFunnel(previousOrders)
        comparison = buildFunnelComparison(current, previous)
        methodComparison = buildMethodComparison(
          methods,
          buildMethodBreakdown(previousOrders),
        )
      }

      // Sin `utm_source` migrada no se puede atribuir: null, no "todo directo".
      utm = detailRows.some((row) => "utm_source" in row) ? buildUtmBreakdown(currentOrders) : null
      if (utm === null) {
        degraded.push("utm")
      } else if (methodComparison) {
        // Se cuelga de `methodComparison` a propósito: sin comparación de
        // embudo no hay periodo anterior comparable, así que tampoco la hay
        // por origen.
        utmComparison = buildUtmComparison(utm, buildUtmBreakdown(previousOrders))
      }
    }

    // ── Recuperación por toque ───────────────────────────────────
    // email_logs no tiene created_at: la hora de envío vive en sent_at.
    let recovery: RecoveryTouchRow[] | null = null
    let recoveryTruncated = false
    if (!degraded.includes("recovery")) {
      const { data: logs, error: logsErr } = await supabase
        .from("email_logs")
        .select("email_type, order_id")
        .in(
          "email_type",
          RECOVERY_TOUCHES.map((touch) => touch.type),
        )
        .eq("status", "sent")
        .gte("sent_at", sinceIso)
        .limit(RECOVERY_LOG_LIMIT)

      if (logsErr) {
        degraded.push("recovery")
        logger.error("[ADMIN-FUNNEL] no se pudieron leer los correos de recuperación:", logsErr)
      } else {
        const logRows = (logs ?? []) as RecoveryLogRow[]
        // Un corte silencioso subestima la tasa de recuperación, que es
        // justamente el número que el panel usa para decidir si la secuencia
        // funciona. Se declara en vez de esconderlo.
        recoveryTruncated = logRows.length >= RECOVERY_LOG_LIMIT
        recovery = buildRecoveryByTouch(RECOVERY_TOUCHES, logRows, currentOrders)
      }
    }

    // ── Take-rate de bumps y upsells 1-click ─────────────────────
    const paidRowIds = currentRows
      .filter((row) => row.payment_status === "paid")
      .map((row) => row.id)
    const takeRateTruncated = paidRowIds.length > TAKE_RATE_ID_LIMIT
    const paidIds = paidRowIds.slice(0, TAKE_RATE_ID_LIMIT)

    let bumpTakeRate: number | null = null
    if (!degraded.includes("bumpTakeRate") && paidIds.length > 0) {
      const { data: bumpItems, error: bumpErr } = await supabase
        .from("order_items")
        .select("order_id")
        .eq("item_type", "bump")
        .in("order_id", paidIds)
      // 42703 = order_items.item_type aún no migrada: no es medible.
      if (bumpErr) {
        if (bumpErr.code !== "42703") {
          logger.error("[ADMIN-FUNNEL] no se pudieron leer los order bumps:", bumpErr)
        }
        degraded.push("bumpTakeRate")
      } else {
        const withBump = new Set((bumpItems ?? []).map((i: { order_id: number }) => i.order_id))
        bumpTakeRate = withBump.size / paidIds.length
      }
    }

    let upsellTakeRate: number | null = null
    if (!degraded.includes("upsellTakeRate") && paidIds.length > 0) {
      const { data: upsells, error: upsellErr } = await supabase
        .from("order_upsells")
        .select("order_id")
        .in("order_id", paidIds)
      // 42P01 = tabla aún no migrada: no es medible.
      if (upsellErr) {
        if (upsellErr.code !== "42P01") {
          logger.error("[ADMIN-FUNNEL] no se pudieron leer los upsells:", upsellErr)
        }
        degraded.push("upsellTakeRate")
      } else {
        const withUpsell = new Set((upsells ?? []).map((u: { order_id: number }) => u.order_id))
        upsellTakeRate = withUpsell.size / paidIds.length
      }
    }

    // ── Tendencia diaria ─────────────────────────────────────────
    // Se arma con `currentRows`, que ya están en el periodo actual y ya traen
    // `created_at`: no cuesta una consulta extra. Pero es la misma lectura
    // topeada y ordenada por fecha descendente, así que con un corte se omite.
    const trendUnavailable: TrendUnavailable = detail.error
      ? "detailError"
      : detailTruncated
        ? "truncated"
        : null
    const trend =
      trendUnavailable === null
        ? buildFunnelTrend(currentRows.map(toTrendOrder), sinceIso, untilIso)
        : null

    const body: FunnelResponse = {
      days,
      since: sinceIso,
      until: untilIso,
      generatedAt: now.toISOString(),
      source,
      funnel,
      outcomes,
      methods,
      utm,
      recovery,
      comparison,
      methodComparison,
      utmComparison,
      trend,
      trendUnavailable,
      bumpTakeRate,
      upsellTakeRate,
      detailTruncated,
      recoveryTruncated,
      takeRateTruncated,
      degraded,
    }

    return NextResponse.json(body)
  } catch (error) {
    logger.error("[ADMIN-FUNNEL] error:", error)
    const message = error instanceof Error ? error.message : "Error interno del servidor"
    return NextResponse.json({ error: message, degraded }, { status: 500 })
  }
}
