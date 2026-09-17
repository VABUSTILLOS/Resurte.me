import { describe, expect, it } from "vitest"
import { FOCUSABLE_SELECTOR, nextTrapFocus } from "./focus-trap"

describe("nextTrapFocus", () => {
  it("returns -1 while the focus moves inside the panel", () => {
    expect(nextTrapFocus(1, 3, false)).toBe(-1)
    expect(nextTrapFocus(1, 3, true)).toBe(-1)
    expect(nextTrapFocus(0, 2, false)).toBe(-1)
  })

  it("wraps forward from the last element to the first", () => {
    expect(nextTrapFocus(2, 3, false)).toBe(0)
  })

  it("wraps backward from the first element to the last", () => {
    expect(nextTrapFocus(0, 3, true)).toBe(2)
  })

  it("recaptures the focus when it escaped the panel", () => {
    expect(nextTrapFocus(-1, 3, false)).toBe(0)
    expect(nextTrapFocus(-1, 3, true)).toBe(2)
    expect(nextTrapFocus(5, 3, false)).toBe(0)
    expect(nextTrapFocus(5, 3, true)).toBe(2)
  })

  it("traps a single focusable element in both directions", () => {
    expect(nextTrapFocus(0, 1, false)).toBe(0)
    expect(nextTrapFocus(0, 1, true)).toBe(0)
  })

  it("returns -1 when the panel has no focusable elements", () => {
    expect(nextTrapFocus(0, 0, false)).toBe(-1)
  })

  it("exposes a selector that skips disabled controls and tabindex=-1", () => {
    expect(FOCUSABLE_SELECTOR).toContain("button:not([disabled])")
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])')
  })
})
