import { describe, expect, it } from "vitest"

import {
  CREDIT_TTL_MONTHS,
  EXPIRY_WARNING_DAYS,
  addMonths,
  summarizeWalletExpiry,
  type WalletExpiryMovement,
} from "@/lib/wallet-expiry"

const NOW = new Date("2026-06-15T18:00:00Z")

/**
 * Fixtures compartidos con la migración 00132: el abono de $100 del
 * 2026-01-10 caduca el 2027-01-10 (12 meses). Si el SQL y esta lib divergen,
 * estas fechas son el primer sitio donde se nota.
 */
function credit(amount: number | string | null, createdAt: string, expiresAt?: string | null) {
  return { amount, created_at: createdAt, expires_at: expiresAt ?? null }
}

function debit(amount: number | string | null, createdAt: string) {
  return { amount, created_at: createdAt, expires_at: null }
}

describe("addMonths", () => {
  it("suma meses conservando día y hora", () => {
    expect(addMonths(new Date("2026-01-10T18:00:00Z"), 12).toISOString()).toBe(
      "2027-01-10T18:00:00.000Z"
    )
  })

  it("recorta al último día del mes destino", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z"
    )
    expect(addMonths(new Date("2028-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2028-02-29T00:00:00.000Z"
    )
  })

  it("no muta la fecha recibida", () => {
    const original = new Date("2026-01-31T00:00:00Z")
    addMonths(original, 1)
    expect(original.toISOString()).toBe("2026-01-31T00:00:00.000Z")
  })
})

describe("summarizeWalletExpiry", () => {
  it("sin movimientos devuelve todo en cero", () => {
    const summary = summarizeWalletExpiry([], { now: NOW })

    expect(summary).toEqual({
      lots: [],
      active: 0,
      expired: 0,
      expiringSoon: 0,
      nextExpiryAt: null,
      nextExpiryDays: null,
      nextExpiryAmount: 0,
    })
  })

  it("un abono sin canjes queda íntegro y vigente", () => {
    const summary = summarizeWalletExpiry(
      [credit(100, "2026-06-01T12:00:00Z", "2027-06-01T12:00:00Z")],
      { now: NOW }
    )

    expect(summary.active).toBe(100)
    expect(summary.expired).toBe(0)
    expect(summary.expiringSoon).toBe(0)
    expect(summary.lots).toHaveLength(1)
    expect(summary.lots[0]!.consumed).toBe(0)
    expect(summary.lots[0]!.remaining).toBe(100)
    expect(summary.lots[0]!.expiresAt).toBe("2027-06-01T12:00:00.000Z")
  })

  it("deriva la caducidad de created_at si falta expires_at", () => {
    // NOW = 2026-06-15; el abono es del 2026-06-01, así que su propia ventana
    // (2027-06-01) es anterior a la del backfill desde hoy (2027-06-15).
    const summary = summarizeWalletExpiry([credit(100, "2026-06-01T12:00:00Z", null)], {
      now: NOW,
    })

    expect(summary.lots[0]!.expiresAt).toBe(
      addMonths(NOW, CREDIT_TTL_MONTHS).toISOString()
    )
    expect(summary.active).toBe(100)
  })

  it("sin expires_at no acusa de vencido un abono viejo (espeja el backfill)", () => {
    // El abono venció según la política pura, pero el backfill de 00132 le da
    // la ventana completa desde la migración: mostrarlo como vencido sería una
    // alarma falsa sobre un saldo que la BD todavía tiene intacto.
    const summary = summarizeWalletExpiry([credit(100, "2024-01-01T12:00:00Z", null)], {
      now: NOW,
    })

    expect(summary.expired).toBe(0)
    expect(summary.active).toBe(100)
    expect(summary.expiringSoon).toBe(0)
  })

  it("prefiere expires_at del SQL sobre la derivación", () => {
    // Un abono viejo con fecha ya escrita por el backfill manda sobre la regla.
    const backfilled = addMonths(NOW, CREDIT_TTL_MONTHS).toISOString()
    const summary = summarizeWalletExpiry(
      [credit(100, "2024-01-01T12:00:00Z", backfilled)],
      { now: NOW }
    )

    expect(summary.lots[0]!.expiresAt).toBe(backfilled)
    expect(summary.expired).toBe(0)
    expect(summary.active).toBe(100)
  })

  it("respeta expires_at cuando la migración ya lo escribió", () => {
    const summary = summarizeWalletExpiry(
      [credit(100, "2026-06-01T12:00:00Z", "2026-07-01T00:00:00Z")],
      { now: NOW }
    )

    expect(summary.lots[0]!.expiresAt).toBe("2026-07-01T00:00:00.000Z")
    expect(summary.active).toBe(100)
    expect(summary.expiringSoon).toBe(100)
  })

  it("consume primero el abono más antiguo (FIFO)", () => {
    const summary = summarizeWalletExpiry(
      [
        credit(100, "2026-06-01T12:00:00Z", "2026-08-01T00:00:00Z"), // viejo, caduca antes
        credit(100, "2026-06-05T12:00:00Z", "2027-06-05T12:00:00Z"), // nuevo
        debit(-60, "2026-06-10T12:00:00Z"),
      ],
      { now: NOW }
    )

    expect(summary.lots[0]!.consumed).toBe(60)
    expect(summary.lots[0]!.remaining).toBe(40)
    expect(summary.lots[1]!.consumed).toBe(0)
    expect(summary.lots[1]!.remaining).toBe(100)
    expect(summary.active).toBe(140)
  })

  it("un canje que agota un lote sigue con el siguiente", () => {
    const summary = summarizeWalletExpiry(
      [
        credit(50, "2026-06-01T12:00:00Z"),
        credit(50, "2026-06-02T12:00:00Z"),
        debit(-80, "2026-06-10T12:00:00Z"),
      ],
      { now: NOW }
    )

    expect(summary.lots[0]!.remaining).toBe(0)
    expect(summary.lots[1]!.remaining).toBe(20)
    expect(summary.active).toBe(20)
  })

  it("ordena los lotes por fecha aunque lleguen desordenados", () => {
    const summary = summarizeWalletExpiry(
      [
        credit(100, "2026-06-05T12:00:00Z"),
        credit(100, "2026-06-01T12:00:00Z"),
        debit(-50, "2026-06-10T12:00:00Z"),
      ],
      { now: NOW }
    )

    expect(summary.lots[0]!.createdAt).toBe("2026-06-01T12:00:00.000Z")
    expect(summary.lots[0]!.consumed).toBe(50)
  })

  it("desempata por id cuando dos abonos comparten instante", () => {
    const movements: WalletExpiryMovement[] = [
      { id: 2, amount: 100, created_at: "2026-06-01T12:00:00Z", expires_at: null },
      { id: 1, amount: 100, created_at: "2026-06-01T12:00:00Z", expires_at: null },
      debit(-50, "2026-06-10T12:00:00Z"),
    ]

    const summary = summarizeWalletExpiry(movements, { now: NOW })

    expect(summary.lots[0]!.id).toBe("1")
    expect(summary.lots[0]!.consumed).toBe(50)
  })

  it("separa lo vencido de lo vigente", () => {
    const summary = summarizeWalletExpiry(
      [
        credit(100, "2025-06-01T12:00:00Z", "2026-06-01T12:00:00Z"), // vencido
        credit(200, "2026-06-01T12:00:00Z", "2027-06-01T12:00:00Z"), // vigente
      ],
      { now: NOW }
    )

    expect(summary.expired).toBe(100)
    expect(summary.active).toBe(200)
    expect(summary.lots[0]!.expired).toBe(true)
    expect(summary.lots[1]!.expired).toBe(false)
  })

  it("no cuenta como vencido lo que ya se gastó", () => {
    const summary = summarizeWalletExpiry(
      [
        credit(100, "2025-06-01T12:00:00Z", "2026-06-01T12:00:00Z"),
        debit(-100, "2025-07-01T12:00:00Z"),
      ],
      { now: NOW }
    )

    expect(summary.expired).toBe(0)
    expect(summary.active).toBe(0)
    expect(summary.lots[0]!.remaining).toBe(0)
  })

  it("un lote que vence justo ahora cuenta como vencido", () => {
    const summary = summarizeWalletExpiry(
      [credit(100, "2025-06-15T18:00:00Z", NOW.toISOString())],
      { now: NOW }
    )

    expect(summary.expired).toBe(100)
    expect(summary.active).toBe(0)
  })

  it("marca lo que vence dentro de la ventana de aviso de 30 días", () => {
    const inWindow = new Date(NOW.getTime() + EXPIRY_WARNING_DAYS * 86_400_000).toISOString()
    const outOfWindow = new Date(
      NOW.getTime() + (EXPIRY_WARNING_DAYS + 1) * 86_400_000
    ).toISOString()

    const summary = summarizeWalletExpiry(
      [
        credit(100, "2026-06-01T12:00:00Z", inWindow),
        credit(300, "2026-06-02T12:00:00Z", outOfWindow),
      ],
      { now: NOW }
    )

    expect(summary.expiringSoon).toBe(100)
    expect(summary.active).toBe(400)
  })

  it("reporta el próximo vencimiento y los días que faltan", () => {
    const summary = summarizeWalletExpiry(
      [
        credit(300, "2026-06-01T12:00:00Z", "2027-01-01T00:00:00Z"),
        credit(100, "2026-06-02T12:00:00Z", "2026-07-01T00:00:00Z"),
      ],
      { now: NOW }
    )

    expect(summary.nextExpiryAt).toBe("2026-07-01T00:00:00.000Z")
    expect(summary.nextExpiryAmount).toBe(100)
    expect(summary.nextExpiryDays).toBe(16)
  })

  it("ignora lotes vencidos al elegir el próximo vencimiento", () => {
    const summary = summarizeWalletExpiry(
      [
        credit(100, "2025-01-01T12:00:00Z", "2026-01-01T12:00:00Z"), // ya vencido
        credit(200, "2026-06-01T12:00:00Z", "2027-01-01T00:00:00Z"),
      ],
      { now: NOW }
    )

    expect(summary.nextExpiryAt).toBe("2027-01-01T00:00:00.000Z")
    expect(summary.nextExpiryAmount).toBe(200)
  })

  it("ignora lotes ya gastados al elegir el próximo vencimiento", () => {
    const summary = summarizeWalletExpiry(
      [
        credit(100, "2026-06-01T12:00:00Z", "2026-07-01T00:00:00Z"),
        credit(200, "2026-06-02T12:00:00Z", "2027-01-01T00:00:00Z"),
        debit(-100, "2026-06-10T12:00:00Z"),
      ],
      { now: NOW }
    )

    expect(summary.nextExpiryAt).toBe("2027-01-01T00:00:00.000Z")
    expect(summary.nextExpiryAmount).toBe(200)
  })

  it("ignora importes cero, nulos, no numéricos y fechas inválidas", () => {
    const summary = summarizeWalletExpiry(
      [
        credit(0, "2026-06-01T12:00:00Z"),
        credit(null, "2026-06-01T12:00:00Z"),
        credit("no-es-un-numero", "2026-06-01T12:00:00Z"),
        credit(100, "fecha-invalida"),
        credit("100.50", "2026-06-01T12:00:00Z"),
        debit("no-es-un-numero", "2026-06-02T12:00:00Z"),
        debit(0, "2026-06-02T12:00:00Z"),
      ],
      { now: NOW }
    )

    expect(summary.lots).toHaveLength(1)
    expect(summary.active).toBe(100.5)
  })

  it("acepta importes numéricos como texto (PostgREST los entrega así)", () => {
    const summary = summarizeWalletExpiry(
      [credit("100.25", "2026-06-01T12:00:00Z"), debit("-0.25", "2026-06-02T12:00:00Z")],
      { now: NOW }
    )

    expect(summary.lots[0]!.remaining).toBe(100)
    expect(summary.active).toBe(100)
  })

  it("tolera canjes mayores que el total abonado sin dar negativos", () => {
    const summary = summarizeWalletExpiry(
      [credit(100, "2026-06-01T12:00:00Z"), debit(-150, "2026-06-02T12:00:00Z")],
      { now: NOW }
    )

    expect(summary.lots[0]!.remaining).toBe(0)
    expect(summary.active).toBe(0)
    expect(summary.expired).toBe(0)
  })

  it("no muta el arreglo recibido", () => {
    const movements: WalletExpiryMovement[] = [
      credit(100, "2026-06-05T12:00:00Z"),
      credit(100, "2026-06-01T12:00:00Z"),
    ]
    const snapshot = movements.map((m) => m.created_at)

    summarizeWalletExpiry(movements, { now: NOW })

    expect(movements.map((m) => m.created_at)).toEqual(snapshot)
  })

  it("un saldo con lotes vigentes y vencidos se reparte entre ambos", () => {
    const summary = summarizeWalletExpiry(
      [
        credit(100, "2025-06-01T12:00:00Z", "2026-06-01T12:00:00Z"),
        credit(100, "2026-06-01T12:00:00Z", "2027-06-01T12:00:00Z"),
        debit(-150, "2026-06-10T12:00:00Z"),
      ],
      { now: NOW }
    )

    // FIFO: el vencido se gastó primero, así que queda todo el vigente.
    expect(summary.expired).toBe(0)
    expect(summary.active).toBe(50)
    expect(summary.lots[0]!.consumed).toBe(100)
    expect(summary.lots[1]!.consumed).toBe(50)
  })
})
