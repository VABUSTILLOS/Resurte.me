import { describe, it, expect } from "vitest"
import { abandonedCartTouchForAge, ABANDONED_CART_TOUCHES } from "@/lib/email-workflows"
import { abandonedCartEmailHtml } from "@/lib/email"

describe("abandonedCartTouchForAge", () => {
  it("devuelve null antes de las 2 horas", () => {
    expect(abandonedCartTouchForAge(0)).toBeNull()
    expect(abandonedCartTouchForAge(1.99)).toBeNull()
  })

  it("asigna el toque 1 entre 2 y 26 horas", () => {
    expect(abandonedCartTouchForAge(2)?.type).toBe("abandoned_cart")
    expect(abandonedCartTouchForAge(12)?.type).toBe("abandoned_cart")
    expect(abandonedCartTouchForAge(25.9)?.type).toBe("abandoned_cart")
  })

  it("asigna el toque 2 entre 26 y 50 horas", () => {
    expect(abandonedCartTouchForAge(26)?.type).toBe("abandoned_cart_24h")
    expect(abandonedCartTouchForAge(49.9)?.type).toBe("abandoned_cart_24h")
  })

  it("asigna el toque 3 entre 50 y 74 horas", () => {
    expect(abandonedCartTouchForAge(50)?.type).toBe("abandoned_cart_48h")
    expect(abandonedCartTouchForAge(73.9)?.type).toBe("abandoned_cart_48h")
  })

  it("devuelve null después de 74 horas (carrito expirado)", () => {
    expect(abandonedCartTouchForAge(74)).toBeNull()
    expect(abandonedCartTouchForAge(200)).toBeNull()
  })

  it("las ventanas son contiguas y sin solapamientos", () => {
    for (let i = 1; i < ABANDONED_CART_TOUCHES.length; i++) {
      expect(ABANDONED_CART_TOUCHES[i]!.minHours).toBe(ABANDONED_CART_TOUCHES[i - 1]!.maxHours)
    }
  })

  it("solo los toques 2 y 3 incluyen cupón", () => {
    expect(ABANDONED_CART_TOUCHES[0].withCoupon).toBe(false)
    expect(ABANDONED_CART_TOUCHES[1].withCoupon).toBe(true)
    expect(ABANDONED_CART_TOUCHES[2].withCoupon).toBe(true)
    expect(ABANDONED_CART_TOUCHES[2].finalNotice).toBe(true)
  })
})

describe("abandonedCartEmailHtml", () => {
  const base = { itemCount: 2, itemsPreview: "2 producto(s)", cartUrl: "https://resurte.me/cart?restore=1" }

  it("renderiza el email base sin cupón ni urgencia", () => {
    const html = abandonedCartEmailHtml(base)
    expect(html).toContain("Tu carrito te espera")
    expect(html).toContain(base.cartUrl)
    expect(html).not.toContain("cupón de")
    expect(html).not.toContain("Último aviso")
  })

  it("incluye el bloque de cupón cuando se proporciona", () => {
    const html = abandonedCartEmailHtml({
      ...base,
      couponCode: "RECUPERA-ABC123",
      couponDiscountPct: 5,
      couponExpiresAt: "10 de enero",
    })
    expect(html).toContain("RECUPERA-ABC123")
    expect(html).toContain("5% de descuento")
    expect(html).toContain("10 de enero")
  })

  it("incluye el aviso de urgencia cuando finalNotice es true", () => {
    const html = abandonedCartEmailHtml({ ...base, finalNotice: true })
    expect(html).toContain("Último aviso")
  })
})
