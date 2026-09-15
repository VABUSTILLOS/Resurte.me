import { describe, expect, it } from "vitest"

import {
  EMPTY_NEXT_ACTION,
  hasDisplayableDetails,
  parsePaymentNextAction,
} from "./payment-next-action"

describe("parsePaymentNextAction", () => {
  it("devuelve null cuando no hay acción pendiente (tarjeta ya confirmada)", () => {
    expect(parsePaymentNextAction(null)).toBeNull()
    expect(parsePaymentNextAction(undefined)).toBeNull()
  })

  it("no rompe con tipos inesperados", () => {
    expect(parsePaymentNextAction("display_details")).toBeNull()
    expect(parsePaymentNextAction(42)).toBeNull()
  })

  it("preserva el type de Stripe y deja el resto en null sin display_details", () => {
    const action = parsePaymentNextAction({ type: "redirect_to_url" })

    expect(action).toEqual({ ...EMPTY_NEXT_ACTION, type: "redirect_to_url" })
    expect(hasDisplayableDetails(action!)).toBe(false)
  })

  it("normaliza un voucher OXXO con código de barras y URL alojada", () => {
    const action = parsePaymentNextAction({
      type: "display_details",
      display_details: {
        number: "1234567890123456",
        expires_at: "2026-01-01T00:00:00.000Z",
        hosted_voucher_url: "https://pay.stripe.com/oxxo/abc",
        barcode: { image_url_png: "https://stripe.test/oxxo.png" },
      },
    })

    expect(action).toMatchObject({
      type: "display_details",
      voucherNumber: "1234567890123456",
      expiresAt: "2026-01-01T00:00:00.000Z",
      barcodeImageUrl: "https://stripe.test/oxxo.png",
      hostedInstructionsUrl: "https://pay.stripe.com/oxxo/abc",
    })
    expect(hasDisplayableDetails(action!)).toBe(true)
  })

  it("normaliza una CLABE SPEI con banco y referencia", () => {
    const action = parsePaymentNextAction({
      type: "display_details",
      display_details: {
        clabe: "012345678901234567",
        bank_name: "STP",
        reference: "REF-001",
        hosted_instructions_url: "https://pay.stripe.com/spei/abc",
      },
    })

    expect(action).toMatchObject({
      clabe: "012345678901234567",
      bankName: "STP",
      reference: "REF-001",
      // SPEI usa hosted_instructions_url, no hosted_voucher_url.
      hostedInstructionsUrl: "https://pay.stripe.com/spei/abc",
    })
    expect(hasDisplayableDetails(action!)).toBe(true)
  })

  it("normaliza un QR CoDi", () => {
    const action = parsePaymentNextAction({
      type: "display_details",
      display_details: {
        image_url_png: "https://stripe.test/codi.png",
        image_url_svg: "https://stripe.test/codi.svg",
      },
    })

    expect(action).toMatchObject({
      qrImageUrl: "https://stripe.test/codi.png",
      qrSvgUrl: "https://stripe.test/codi.svg",
    })
    expect(hasDisplayableDetails(action!)).toBe(true)
  })

  it("prefiere hosted_voucher_url cuando Stripe manda ambos", () => {
    const action = parsePaymentNextAction({
      type: "display_details",
      display_details: {
        hosted_voucher_url: "https://pay.stripe.com/voucher",
        hosted_instructions_url: "https://pay.stripe.com/instructions",
      },
    })

    expect(action?.hostedInstructionsUrl).toBe("https://pay.stripe.com/voucher")
  })

  it("ignora strings vacíos y campos con tipo incorrecto", () => {
    const action = parsePaymentNextAction({
      type: "display_details",
      display_details: {
        number: "",
        clabe: 12345,
        barcode: "no-es-objeto",
      },
    })

    expect(action).toMatchObject({
      voucherNumber: null,
      clabe: null,
      barcodeImageUrl: null,
    })
    expect(hasDisplayableDetails(action!)).toBe(false)
  })
})
