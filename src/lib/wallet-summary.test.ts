import { describe, expect, it } from "vitest"

import { summarizeWallet } from "@/lib/wallet-summary"

const NOW = new Date("2026-01-15T18:00:00Z") // 12:00 en CDMX

function movement(amount: number | string | null, createdAt: string) {
  return { amount, created_at: createdAt }
}

describe("summarizeWallet", () => {
  it("separa acumulado, canjeado y neto", () => {
    const summary = summarizeWallet(
      [
        movement(100, "2026-01-10T18:00:00Z"),
        movement(50, "2026-01-12T18:00:00Z"),
        movement(-30, "2026-01-13T18:00:00Z"),
      ],
      { balance: 120, now: NOW }
    )

    expect(summary.earned).toBe(150)
    expect(summary.redeemed).toBe(30)
    expect(summary.net).toBe(120)
    expect(summary.balance).toBe(120)
    expect(summary.movements).toBe(3)
  })

  it("calcula el mes en curso con la hora de México", () => {
    const summary = summarizeWallet(
      [
        movement(100, "2026-01-05T18:00:00Z"), // enero
        movement(200, "2025-12-20T18:00:00Z"), // diciembre
        movement(-40, "2026-01-11T18:00:00Z"), // enero
      ],
      { now: NOW }
    )

    expect(summary.earnedThisMonth).toBe(100)
    expect(summary.redeemedThisMonth).toBe(40)
    expect(summary.earned).toBe(300)
  })

  it("usa el mes de México, no el de UTC", () => {
    // 01-ene-2026 02:00 UTC = 31-dic-2025 20:00 en CDMX → cuenta en diciembre.
    const summary = summarizeWallet([movement(500, "2026-01-01T02:00:00Z")], {
      now: NOW,
    })

    expect(summary.earnedThisMonth).toBe(0)
    expect(summary.earned).toBe(500)
  })

  it("ignora importes inválidos y tolera strings de Postgres", () => {
    const summary = summarizeWallet(
      [
        movement("25.50", "2026-01-10T18:00:00Z"),
        movement(null, "2026-01-10T18:00:00Z"),
        movement("no-numero", "2026-01-10T18:00:00Z"),
        movement(0, "2026-01-10T18:00:00Z"),
      ],
      { now: NOW }
    )

    expect(summary.earned).toBe(25.5)
    expect(summary.redeemed).toBe(0)
    expect(summary.net).toBe(25.5)
    // Los inválidos no se cuentan; el cero sí es un movimiento.
    expect(summary.movements).toBe(2)
  })

  it("devuelve ceros sin movimientos", () => {
    const summary = summarizeWallet([], { now: NOW })

    expect(summary).toEqual({
      balance: 0,
      earned: 0,
      redeemed: 0,
      net: 0,
      earnedThisMonth: 0,
      redeemedThisMonth: 0,
      movements: 0,
    })
  })

  it("reporta neto negativo si se canjeó más de lo generado", () => {
    const summary = summarizeWallet(
      [movement(10, "2026-01-10T18:00:00Z"), movement(-90, "2026-01-11T18:00:00Z")],
      { now: NOW }
    )

    expect(summary.net).toBe(-80)
  })
})
