import { describe, it, expect, vi, afterEach } from "vitest"
import { todayStr, dateLabel, entryTime } from "./panel-utils"

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
