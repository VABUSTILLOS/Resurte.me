import { describe, expect, it } from "vitest"
import {
  DEFAULT_CARD_COLOR,
  DEFAULT_CARD_LABELS,
  applyTemplate,
  buildWalletCard,
  contrastForeground,
  formatMoney,
  formatPoints,
  hash64,
  isWalletPlatform,
  labelColorFor,
  luminance,
  normalizeHex,
  rewardFor,
  safePoints,
  shortName,
  toRgbString,
  walletSerial,
  type WalletCardInput,
} from "./card"

function input(overrides: Partial<WalletCardInput> = {}): WalletCardInput {
  return {
    serial: "Wabc",
    cardUrl: "https://resurte.me/r/taqueria/tarjeta/tok",
    restaurantName: "Taquería El Pastor",
    points: 120,
    pointValue: 0.1,
    ...overrides,
  }
}

describe("foodos-wallet/card: color", () => {
  it("normaliza hex de 3 y 6 dígitos, con o sin almohadilla", () => {
    expect(normalizeHex("#abc")).toBe("#aabbcc")
    expect(normalizeHex("#AABBCC")).toBe("#aabbcc")
    expect(normalizeHex("aabbcc")).toBe("#aabbcc")
    expect(normalizeHex("  #0E7A0E  ")).toBe("#0e7a0e")
  })

  it("cae al color por defecto ante cualquier cosa que no sea hex", () => {
    expect(normalizeHex("orange")).toBe(DEFAULT_CARD_COLOR)
    expect(normalizeHex("rgb(1, 2, 3)")).toBe(DEFAULT_CARD_COLOR)
    expect(normalizeHex("#12345")).toBe(DEFAULT_CARD_COLOR)
    expect(normalizeHex("")).toBe(DEFAULT_CARD_COLOR)
    expect(normalizeHex(null)).toBe(DEFAULT_CARD_COLOR)
    expect(normalizeHex(undefined)).toBe(DEFAULT_CARD_COLOR)
    expect(normalizeHex("nope", "#000000")).toBe("#000000")
  })

  it("convierte a rgb() para Apple", () => {
    expect(toRgbString("#0e7a0e")).toBe("rgb(14, 122, 14)")
    expect(toRgbString("#000000")).toBe("rgb(0, 0, 0)")
    expect(toRgbString("#ffffff")).toBe("rgb(255, 255, 255)")
  })

  it("calcula luminancia relativa", () => {
    expect(luminance("#000000")).toBe(0)
    expect(luminance("#ffffff")).toBeCloseTo(1, 5)
  })

  it("elige el texto que de verdad contrasta", () => {
    expect(contrastForeground("#ffffff")).toBe("rgb(0, 0, 0)")
    expect(contrastForeground("#000000")).toBe("rgb(255, 255, 255)")
    // Verde de marca: oscuro, texto blanco.
    expect(contrastForeground(DEFAULT_CARD_COLOR)).toBe("rgb(255, 255, 255)")
    // Naranja medio (L ≈ 0.32): el negro contrasta 7.4:1 y el blanco 2.9:1.
    expect(contrastForeground("#e67e22")).toBe("rgb(0, 0, 0)")
  })

  it("atenúa las etiquetas del mismo lado que el texto", () => {
    expect(labelColorFor("#ffffff")).toBe("rgba(0, 0, 0, 0.6)")
    expect(labelColorFor("#000000")).toBe("rgba(255, 255, 255, 0.75)")
  })
})

describe("foodos-wallet/card: formato", () => {
  it("nunca deja los puntos fuera de rango", () => {
    expect(safePoints(-50)).toBe(0)
    expect(safePoints(12.9)).toBe(12)
    expect(safePoints(Number.NaN)).toBe(0)
    expect(safePoints(Number.POSITIVE_INFINITY)).toBe(0)
    expect(safePoints("120")).toBe(120)
    expect(safePoints(null)).toBe(0)
    expect(safePoints(99_999_999)).toBe(9_999_999)
  })

  it("formatea puntos y dinero", () => {
    expect(formatPoints(1234)).toBe("1,234")
    expect(formatPoints(-5)).toBe("0")
    expect(formatMoney(12.5)).toBe("$12.50")
    expect(formatMoney(Number.NaN)).toBe("$0.00")
    expect(formatMoney(-3)).toBe("$0.00")
  })

  it("recorta el nombre a la primera palabra", () => {
    expect(shortName("Ana Ruiz")).toBe("Ana")
    expect(shortName("  ")).toBe("")
    expect(shortName(null)).toBe("")
    expect(shortName("A".repeat(40))).toHaveLength(24)
  })

  it("interpola {clave} y deja intacto lo que no conoce", () => {
    expect(applyTemplate("{n} para {label}", { n: "80", label: "Café" })).toBe("80 para Café")
    expect(applyTemplate("{n} {otra}", { n: "1" })).toBe("1 {otra}")
  })
})

describe("foodos-wallet/card: recompensa", () => {
  it("no anuncia recompensa sin etiqueta o sin meta", () => {
    expect(rewardFor(100, 200, null)).toBeNull()
    expect(rewardFor(100, 200, "   ")).toBeNull()
    expect(rewardFor(100, 0, "Café")).toBeNull()
    expect(rewardFor(100, null, "Café")).toBeNull()
  })

  it("calcula progreso y faltante", () => {
    const reward = rewardFor(50, 200, "Café gratis")
    expect(reward).not.toBeNull()
    expect(reward?.remaining).toBe(150)
    expect(reward?.progress).toBe(0.25)
    expect(reward?.achieved).toBe(false)
  })

  it("marca la recompensa alcanzada y no pasa de 1", () => {
    const reward = rewardFor(500, 200, "Café gratis")
    expect(reward?.achieved).toBe(true)
    expect(reward?.remaining).toBe(0)
    expect(reward?.progress).toBe(1)
  })
})

describe("foodos-wallet/card: serial", () => {
  it("hash64 es determinista y de 16 hex", () => {
    expect(hash64("hola")).toBe(hash64("hola"))
    expect(hash64("hola")).toMatch(/^[0-9a-f]{16}$/)
    expect(hash64("hola")).not.toBe(hash64("hola!"))
  })

  it("el serial es estable por restaurante, cliente y plataforma", () => {
    const a = walletSerial("r1", "c1", "apple")
    expect(a).toBe(walletSerial("r1", "c1", "apple"))
    expect(a.startsWith("W")).toBe(true)
    expect(a).not.toBe(walletSerial("r1", "c1", "google"))
    expect(a).not.toBe(walletSerial("r1", "c2", "apple"))
    expect(a).not.toBe(walletSerial("r2", "c1", "apple"))
  })

  it("reconoce las plataformas válidas", () => {
    expect(isWalletPlatform("apple")).toBe(true)
    expect(isWalletPlatform("web")).toBe(true)
    expect(isWalletPlatform("samsung")).toBe(false)
    expect(isWalletPlatform(null)).toBe(false)
  })
})

describe("foodos-wallet/card: tarjeta", () => {
  it("arma la tarjeta completa", () => {
    const card = buildWalletCard(
      input({
        customerName: "Ana Ruiz",
        themeColor: "#e67e22",
        rewardLabel: "Café gratis",
        rewardThreshold: 200,
      })
    )

    expect(card.serial).toBe("Wabc")
    expect(card.description).toBe("Tarjeta de lealtad de Taquería El Pastor")
    expect(card.organizationName).toBe("Taquería El Pastor")
    expect(card.header).toBe("Ana")
    expect(card.primary).toBe("120 pts")
    expect(card.secondary).toBe("≈ $12.00")
    expect(card.backgroundColor).toBe("#e67e22")
    expect(card.foregroundColor).toBe("rgb(0, 0, 0)")
    expect(card.rewardText).toBe("80 para Café gratis")
    expect(card.auxiliary).toEqual(["80 para Café gratis"])
    expect(card.barcode).toEqual({
      format: "QR",
      message: "https://resurte.me/r/taqueria/tarjeta/tok",
      altText: "Wabc",
    })
    expect(card.points).toBe(120)
    expect(card.pointsValue).toBe(12)
  })

  it("sin recompensa deja la línea auxiliar vacía", () => {
    const card = buildWalletCard(input())
    expect(card.reward).toBeNull()
    expect(card.rewardText).toBe("")
    expect(card.auxiliary).toEqual([])
  })

  it("anuncia la recompensa ya ganada", () => {
    const card = buildWalletCard(
      input({ points: 300, rewardLabel: "Postre", rewardThreshold: 200 })
    )
    expect(card.rewardText).toBe("¡Postre!")
  })

  it("cae al nombre del restaurante si no hay comensal", () => {
    expect(buildWalletCard(input()).header).toBe("Taquería El Pastor")
  })

  it("sin valor de punto no muestra equivalencia", () => {
    const card = buildWalletCard(input({ pointValue: 0 }))
    expect(card.secondary).toBe("")
    expect(card.pointsValue).toBe(0)
  })

  it("acepta etiquetas traducidas y rellena las que falten", () => {
    const card = buildWalletCard(
      input({
        points: 10,
        rewardLabel: "Free coffee",
        rewardThreshold: 100,
        labels: { points: "POINTS", remaining: "{n} to {label}" },
      })
    )
    expect(card.labels.points).toBe("POINTS")
    expect(card.labels.remaining).toBe("{n} to {label}")
    expect(card.labels.reward).toBe(DEFAULT_CARD_LABELS.reward)
    expect(card.rewardText).toBe("90 to Free coffee")
  })

  it("recorta el logo vacío a null", () => {
    expect(buildWalletCard(input({ logoUrl: "  " })).logoUrl).toBeNull()
    expect(buildWalletCard(input({ logoUrl: " https://x/y.png " })).logoUrl).toBe(
      "https://x/y.png"
    )
  })
})
