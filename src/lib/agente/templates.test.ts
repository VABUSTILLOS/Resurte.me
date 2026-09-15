import { describe, expect, it } from "vitest"
import { FREE_SHIPPING_MXN, INVOICING, MIN_ORDER_MXN, formatMxn } from "@/lib/commercial-facts"
import { VALUE_PROPS } from "./plan"
import { AGENT_SYSTEM_PROMPT } from "./templates"

// El prompt del agente de ventas se convierte en mensajes de WhatsApp que el
// agente manda a clientes reales. Una cifra desactualizada aquí es una promesa
// comercial falsa, así que estas líneas se verifican contra la fuente única.
describe("prompt del agente de ventas", () => {
  it("promete el pedido mínimo y el envío gratis canónicos", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain(formatMxn(MIN_ORDER_MXN))
    expect(AGENT_SYSTEM_PROMPT).toContain(formatMxn(FREE_SHIPPING_MXN))
  })

  it("no arrastra umbrales de envío obsoletos", () => {
    expect(AGENT_SYSTEM_PROMPT).not.toMatch(/gratis desde \$(?!500)\d/)
  })

  it("menciona la facturación vigente", () => {
    expect(AGENT_SYSTEM_PROMPT).toContain(INVOICING)
  })

  it("los argumentos de valor usan las mismas cifras", () => {
    const props = VALUE_PROPS.join(" ")
    expect(props).toContain(formatMxn(MIN_ORDER_MXN))
    expect(props).toContain(formatMxn(FREE_SHIPPING_MXN))
    expect(props).not.toMatch(/gratis desde \$(?!500)\d/)
  })
})
