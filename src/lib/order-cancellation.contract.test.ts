/**
 * order-cancellation.contract.test.ts
 * ===================================
 * Congela la regla de producto de la cancelación de pedidos del marketplace y,
 * sobre todo, congela **una sola puerta** para su cascada.
 *
 * Qué protege
 * -----------
 * Cancelar un pedido no es escribir `status = 'cancelled'`. Es además:
 *
 *   1. devolver el inventario apartado (RPC `release_order_stock`, migración
 *      00143);
 *   2. devolver el uso del cupón aplicado (`coupons.used_count`, con
 *      compare-and-swap para no pisar una reserva concurrente);
 *   3. revertir el cashback — esto lo hace el trigger `trg_reverse_cashback`,
 *      así que sale gratis y NO debe duplicarse en TypeScript.
 *
 * Mientras esa cascada vivió dentro de la ruta del admin, cualquiera que
 * cancelara por otra puerta la saltaba en silencio: el inventario quedaba
 * descontado para siempre y el cupón consumido aunque nunca se hubiera
 * cobrado. Por eso vive en `src/lib/order-cancellation.ts` y **las tres
 * puertas** (admin, cliente, cron de pago) la invocan.
 *
 * Cómo se reintroduce el defecto
 * ------------------------------
 *   a) volver a escribir la liberación de stock a mano en una puerta
 *      (`callStockRpc(supabase, "release_order_stock", …)`);
 *   b) reimplementar el compare-and-swap del cupón dentro de una puerta que
 *      además escribe `status: "cancelled"`;
 *   c) añadir una cuarta puerta que ponga `cancelled` sin llamar a la cascada;
 *   d) duplicar en la UI la regla de "¿puede cancelar?" en vez de preguntarle
 *      al módulo, con lo que la UI ofrecería un botón que la API rechaza;
 *   e) añadir un estado cancelable que en realidad es final (`delivered`).
 *
 * Límite conocido y aceptado
 * --------------------------
 * `src/app/api/orders/route.ts` (`releaseCoupon`) SÍ reimplementa el
 * compare-and-swap del cupón, y es deliberado: ahí no se cancela nada, se
 * compensa una reserva que la MISMA petición acaba de hacer cuando el alta del
 * pedido falla a medias. El ancla del compare-and-swap es el `used_count` que
 * esa petición leyó en memoria (`+1`), no el estado de un pedido existente. Por
 * eso la aserción no es "nadie más toca `used_count`" sino "nadie que escriba
 * `cancelled` toca `used_count`", que es el defecto real.
 *
 * El test es estático y sin base de datos: mide el código, no el runtime. La
 * conducta de la cascada la cubre `order-cancellation.test.ts` (21 casos) y la
 * de las rutas, `cancel/route.test.ts` y `status/route.test.ts`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  CANCEL_REFUSAL_MESSAGE,
  CANCELLABLE_ORDER_STATUSES,
  CHARGED_PAYMENT_STATUSES,
  customerCancelRefusal,
} from "@/lib/order-cancellation"
import { AUDIT_ACTION_LABEL, AUDIT_ACTIONS } from "@/lib/audit-log"
import { isFinalOrderStatus } from "@/lib/order-labels"
import type { OrderStatus, PaymentStatus } from "@/types"

const REPO = process.cwd()

/** La única puerta que aplica la cascada. */
const MODULO_DE_LA_CASCADA = "src/lib/order-cancellation.ts"

/**
 * Puertas del marketplace: las que cancelan un pedido de `public.orders`.
 * `workflows.ts` es el cron que cancela pedidos abandonados (>72 h) y no pasa
 * por ninguna ruta HTTP, que es justo por lo que se le olvidó el cupón.
 */
const PUERTAS_DEL_MARKETPLACE = [
  "src/app/api/orders/[id]/status/route.ts",
  "src/app/api/orders/[id]/cancel/route.ts",
  "src/lib/workflows.ts",
] as const

/**
 * Quien puede nombrar la RPC de stock. `order-stock.ts` es el registro del
 * nombre (`StockRpcName`), no una puerta; el módulo de la cascada es quien la
 * invoca.
 */
const PUEDEN_NOMBRAR_LA_RPC = [MODULO_DE_LA_CASCADA, "src/lib/order-stock.ts"]

const SUPERFICIE_PUBLICA_DEL_CLIENTE = "src/app/[slug]/pedido/[orderId]/tracking-client.tsx"

function leer(rel: string): string {
  return readFileSync(join(REPO, rel), "utf8")
}

/**
 * Quita comentarios de línea y de bloque. Necesario porque los comentarios
 * NOMBRAN los defectos que se están explicando (`workflows.ts` dice
 * "se saltaba el cupón", `order-cancellation.ts` cita la RPC): sin esto, el
 * analizador se delata a sí mismo.
 */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

function listarArchivos(dir: string): string[] {
  const abs = join(REPO, dir)
  const out: string[] = []
  for (const entry of readdirSync(abs)) {
    const rel = `${dir}/${entry}`
    if (statSync(join(REPO, rel)).isDirectory()) {
      out.push(...listarArchivos(rel))
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(rel)
    }
  }
  return out
}

const ARCHIVOS = listarArchivos("src")
const CODIGO = new Map(ARCHIVOS.map((rel) => [rel, sinComentarios(leer(rel))]))

/** ¿Este archivo escribe `status: "cancelled"`? */
function escribeCancelado(rel: string): boolean {
  const src = CODIGO.get(rel) ?? ""
  return /status:\s*["']cancelled["']/.test(src)
}

describe("order-cancellation · una sola puerta para la cascada", () => {
  it("R1 · las tres puertas del marketplace invocan la cascada", () => {
    for (const puerta of PUERTAS_DEL_MARKETPLACE) {
      expect(CODIGO.get(puerta), `${puerta} no existe`).toBeDefined()
      expect(
        CODIGO.get(puerta)!.includes("applyOrderCancellationEffects"),
        `${puerta} no invoca applyOrderCancellationEffects`
      ).toBe(true)
    }
  })

  it("R2 · nadie fuera del módulo libera el stock a mano", () => {
    const infractores = ARCHIVOS.filter(
      (rel) => !PUEDEN_NOMBRAR_LA_RPC.includes(rel) && CODIGO.get(rel)!.includes("release_order_stock")
    )
    expect(infractores).toEqual([])
  })

  it("R3 · quien escribe `cancelled` no reimplementa el cupón", () => {
    const infractores = ARCHIVOS.filter(
      (rel) => escribeCancelado(rel) && /\bused_count\b/.test(CODIGO.get(rel)!)
    )
    expect(infractores).toEqual([])
  })

  it("R4 · ninguna puerta nueva escribe `cancelled` fuera del perímetro", () => {
    // Guardia de la guardia: si mañana aparece una cuarta puerta que escriba el
    // literal `cancelled` sobre `orders`, R1 no la ve. Este test la obliga a
    // entrar en `PUERTAS_DEL_MARKETPLACE`.
    //
    // LÍMITE: `status/route.ts` escribe `{ status }` desde una variable, así que
    // este detector no lo ve — de él se encarga R1, que exige la invocación.
    const cancelaPedidosDelMarketplace = (rel: string) => {
      const src = CODIGO.get(rel) ?? ""
      if (!escribeCancelado(rel)) return false
      // El marketplace se escribe con `.from("orders")`; FoodOS con
      // `.from("foodos_orders")` y las recompensas con `redemption_requests`.
      return /\.from\(\s*["']orders["']\s*\)/.test(src)
    }
    const puertasReales = ARCHIVOS.filter(cancelaPedidosDelMarketplace)
    // Control positivo: el detector encuentra algo (si no, pasaría vacío).
    expect(puertasReales.length).toBeGreaterThanOrEqual(2)
    for (const puerta of puertasReales) {
      expect(PUERTAS_DEL_MARKETPLACE as readonly string[]).toContain(puerta)
    }
  })

  it("R5 · la UI le pregunta la regla al módulo, no la copia", () => {
    const src = CODIGO.get(SUPERFICIE_PUBLICA_DEL_CLIENTE) ?? ""
    expect(src).not.toBe("")
    expect(src.includes('from "@/lib/order-cancellation"')).toBe(true)
    expect(src.includes("customerCancelRefusal")).toBe(true)
    // La copia no se duplica: si el módulo cambia el mensaje, la UI lo cambia
    // con él. Un literal repetido en la UI se quedaría desincronizado.
    for (const mensaje of Object.values(CANCEL_REFUSAL_MESSAGE)) {
      expect(src.includes(mensaje), `la UI repite el mensaje «${mensaje}»`).toBe(false)
    }
  })

  it("R6 · la acción de auditoría y su etiqueta existen en el catálogo", () => {
    expect(AUDIT_ACTIONS).toContain("order_cancelled_by_customer")
    expect(AUDIT_ACTION_LABEL.order_cancelled_by_customer).toBeTruthy()
  })
})

describe("order-cancellation · la regla de producto", () => {
  it("R7 · ningún estado cancelable es un estado final", () => {
    for (const status of CANCELLABLE_ORDER_STATUSES) {
      expect(isFinalOrderStatus(status), `${status} es final y no debería ser cancelable`).toBe(false)
    }
  })

  it("R8 · ningún estado cobrado es cancelable por el cliente", () => {
    const solapados = CANCELLABLE_ORDER_STATUSES.filter((status) =>
      (CHARGED_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(status as unknown as PaymentStatus)
    )
    expect(solapados).toEqual([])
  })

  it("R9 · los dos conjuntos cubren los estados reales del pedido", () => {
    const reales: OrderStatus[] = [
      "pending",
      "confirmed",
      "preparing",
      "out_for_delivery",
      "delivered",
      "cancelled",
    ]
    for (const status of CANCELLABLE_ORDER_STATUSES) {
      expect(reales).toContain(status)
    }
    const pagosReales: PaymentStatus[] = [
      "pending",
      "processing",
      "paid",
      "failed",
      "expired",
      "refunded",
      "disputed",
      "amount_mismatch",
    ]
    for (const status of CHARGED_PAYMENT_STATUSES) {
      expect(pagosReales).toContain(status)
    }
  })

  it("R10 · cada motivo de rechazo tiene un mensaje que dice qué hacer", () => {
    const motivos = ["already_cancelled", "dispatched", "charged"] as const
    for (const motivo of motivos) {
      const mensaje = CANCEL_REFUSAL_MESSAGE[motivo]
      expect(mensaje.length, `${motivo} sin mensaje`).toBeGreaterThan(20)
      // Un mensaje que no dice qué hacer deja al cliente en un callejón.
      expect(/escr[íi]benos|contacta|soporte|ayuda/i.test(mensaje), `${motivo}: ${mensaje}`).toBe(true)
    }
  })

  it("R11 · `cancelled` gana sobre cualquier otro motivo (no se ofrece cancelar dos veces)", () => {
    expect(customerCancelRefusal("cancelled", "paid")).toBe("already_cancelled")
    expect(customerCancelRefusal("cancelled", "pending")).toBe("already_cancelled")
  })

  it("R12 · un pedido despachado no se cancela aunque no esté cobrado", () => {
    expect(customerCancelRefusal("out_for_delivery", "pending")).toBe("dispatched")
    expect(customerCancelRefusal("delivered", "pending")).toBe("dispatched")
  })

  it("R13 · un pedido cobrado no se cancela aunque no haya salido", () => {
    for (const pago of CHARGED_PAYMENT_STATUSES) {
      expect(customerCancelRefusal("confirmed", pago), `pago ${pago}`).toBe("charged")
    }
  })

  it("R14 · un pedido temprano y sin cobro sí se cancela", () => {
    for (const status of CANCELLABLE_ORDER_STATUSES) {
      expect(customerCancelRefusal(status, "pending"), `status ${status}`).toBeNull()
      expect(customerCancelRefusal(status, "failed"), `status ${status}`).toBeNull()
      expect(customerCancelRefusal(status, null), `status ${status}`).toBeNull()
    }
  })
})

describe("order-cancellation · la superficie está viva", () => {
  it("R15 · canario: el analizador ve el código, no un árbol vacío", () => {
    // Sin esto, un fallo del recorrido de ficheros haría pasar R2 y R3 con
    // cero archivos inspeccionados.
    expect(ARCHIVOS.length).toBeGreaterThan(300)
    expect(CODIGO.size).toBe(ARCHIVOS.length)
    expect(CODIGO.get(MODULO_DE_LA_CASCADA)).toBeTruthy()
  })

  it("R16 · control positivo: el analizador SÍ ve la escritura de `cancelled`", () => {
    // Si el patrón de R3 se rompiera, R3 pasaría por no encontrar nada.
    const conCancelado = ARCHIVOS.filter(escribeCancelado)
    expect(conCancelado.length).toBeGreaterThanOrEqual(4)
    expect(conCancelado).toContain("src/lib/workflows.ts")
    expect(conCancelado).toContain("src/app/api/orders/[id]/cancel/route.ts")
  })

  it("R17 · control negativo: el analizador NO confunde FoodOS ni recompensas con el marketplace", () => {
    // El cron de FoodOS también cancela, pero es otro dominio (otra tabla, otro
    // cupón, otro aviso): no debe entrar en el perímetro del marketplace.
    const foodos = "src/lib/foodos-payment-reminders.ts"
    expect(escribeCancelado(foodos)).toBe(true)
    expect(PUERTAS_DEL_MARKETPLACE as readonly string[]).not.toContain(foodos)
    expect(CODIGO.get(foodos)!.includes('from("foodos_orders")')).toBe(true)
  })

  it("R18 · control negativo: el cupón del alta de pedido sigue permitido", () => {
    // `releaseCoupon` compensa una reserva de la misma petición, no una
    // cancelación: no debe dispararse R3.
    const alta = "src/app/api/orders/route.ts"
    expect(CODIGO.get(alta)!.includes("used_count")).toBe(true)
    expect(escribeCancelado(alta)).toBe(false)
  })
})
