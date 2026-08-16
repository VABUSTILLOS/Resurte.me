import { describe, it, expect, vi, afterEach } from "vitest"
import { todayStr, dateLabel, entryTime, toNonNegativeNumber, toInt, isCurrentMonth, isLowStock, isOutOfStock } from "./panel-utils"

afterEach(() => vi.restoreAllMocks())

describe("todayStr", () => {
  it("formats today as YYYY-MM-DD in local time", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 0, 7, 15, 30, 0))
    expect(todayStr()).toBe("2025-01-07")
    vi.useRealTimers()
  })
})

describe("dateLabel", () => {
  it("returns 'Hoy' for the current date", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0))
    expect(dateLabel("2025-06-15")).toBe("Hoy")
    vi.useRealTimers()
  })

  it("returns 'Ayer' for yesterday", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0))
    expect(dateLabel("2025-06-14")).toBe("Ayer")
    vi.useRealTimers()
  })

  it("formats other dates as 'd mmm'", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0))
    expect(dateLabel("2025-03-02")).toBe("2 mar")
    vi.useRealTimers()
  })

  it("is timezone-safe around midday", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0))
    expect(dateLabel("2025-06-15")).toBe("Hoy")
    vi.useRealTimers()
  })
})

describe("entryTime", () => {
  it("parses a valid ISO timestamp", () => {
    const iso = "2025-06-15T12:00:00.000Z"
    expect(entryTime(iso)).toBe(Date.parse(iso))
  })

  it("returns NaN for missing input", () => {
    expect(Number.isNaN(entryTime(undefined))).toBe(true)
    expect(Number.isNaN(entryTime(null))).toBe(true)
    expect(Number.isNaN(entryTime(""))).toBe(true)
  })

  it("returns NaN for unparseable input", () => {
    expect(Number.isNaN(entryTime("not-a-date"))).toBe(true)
  })
})

describe("toNonNegativeNumber", () => {
  it("parses positive decimals", () => {
    expect(toNonNegativeNumber("12.5")).toBe(12.5)
    expect(toNonNegativeNumber(7)).toBe(7)
  })

  it("clamps negatives to 0", () => {
    expect(toNonNegativeNumber("-3")).toBe(0)
    expect(toNonNegativeNumber(-2.5)).toBe(0)
  })

  it("falls back to 0 for invalid input", () => {
    expect(toNonNegativeNumber("")).toBe(0)
    expect(toNonNegativeNumber("abc")).toBe(0)
    expect(toNonNegativeNumber(null)).toBe(0)
    expect(toNonNegativeNumber(undefined)).toBe(0)
    expect(toNonNegativeNumber("  ")).toBe(0)
  })
})

describe("toInt", () => {
  it("parses integers, truncating decimals like parseInt", () => {
    expect(toInt("12")).toBe(12)
    expect(toInt("3.7")).toBe(3)
    expect(toInt("12abc")).toBe(12)
  })

  it("falls back to 0 for invalid input", () => {
    expect(toInt("")).toBe(0)
    expect(toInt("abc")).toBe(0)
    expect(toInt(null)).toBe(0)
    expect(toInt(undefined)).toBe(0)
  })
})

describe("isCurrentMonth", () => {
  it("matches the current month", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0))
    expect(isCurrentMonth("2025-06-15T12:00:00.000Z")).toBe(true)
    vi.useRealTimers()
  })

  it("rejects other months and invalid dates", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 5, 15, 10, 0, 0))
    expect(isCurrentMonth("2025-05-15T12:00:00.000Z")).toBe(false)
    expect(isCurrentMonth("2025-07-15T12:00:00.000Z")).toBe(false)
    expect(isCurrentMonth("not-a-date")).toBe(false)
    vi.useRealTimers()
  })
})

describe("isLowStock / isOutOfStock", () => {
  it("low stock is > 0 and <= min", () => {
    expect(isLowStock(3, 5)).toBe(true)
    expect(isLowStock(5, 5)).toBe(true)
    expect(isLowStock(6, 5)).toBe(false)
    expect(isLowStock(0, 5)).toBe(false)
  })

  it("out of stock is exactly 0", () => {
    expect(isOutOfStock(0)).toBe(true)
    expect(isOutOfStock(1)).toBe(false)
  })
})
