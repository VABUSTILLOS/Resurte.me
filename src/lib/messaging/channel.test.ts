import { describe, expect, it } from "vitest"

import {
  pickVariant,
  resolveChannel,
  tallyAbTest,
  type ChannelCapabilities,
} from "@/lib/messaging/channel"

function caps(over: Partial<ChannelCapabilities> = {}): ChannelCapabilities {
  return { whatsapp: true, sms: true, smsOptIn: true, ...over }
}

describe("resolveChannel", () => {
  it("prefiere WhatsApp cuando está disponible", () => {
    expect(resolveChannel("whatsapp", caps())).toEqual({
      channel: "whatsapp",
      reason: "ok",
      fallback: null,
    })
  })

  it("no manda por SMS si la automatización pidió solo WhatsApp", () => {
    const out = resolveChannel("whatsapp", caps({ whatsapp: false }))
    expect(out.channel).toBeNull()
    expect(out.reason).toBe("whatsapp_unavailable")
    expect(out.fallback).toBeNull()
  })

  it("SMS exige opt-in explícito", () => {
    expect(resolveChannel("sms", caps()).channel).toBe("sms")
    expect(resolveChannel("sms", caps({ smsOptIn: false })).reason).toBe("no_sms_opt_in")
    expect(resolveChannel("sms", caps({ sms: false })).reason).toBe("sms_unavailable")
  })

  it("'both' ofrece SMS solo como respaldo y solo con opt-in", () => {
    expect(resolveChannel("both", caps())).toEqual({
      channel: "whatsapp",
      reason: "ok",
      fallback: "sms",
    })
    expect(resolveChannel("both", caps({ smsOptIn: false })).fallback).toBeNull()
  })

  it("'both' cae a SMS si no hay WhatsApp", () => {
    const out = resolveChannel("both", caps({ whatsapp: false }))
    expect(out.channel).toBe("sms")
    expect(out.reason).toBe("ok")
  })

  it("'both' sin ningún canal informa por qué", () => {
    expect(resolveChannel("both", caps({ whatsapp: false, sms: false })).reason).toBe(
      "whatsapp_unavailable"
    )
    expect(
      resolveChannel("both", caps({ whatsapp: false, smsOptIn: false })).reason
    ).toBe("no_sms_opt_in")
  })
})

describe("pickVariant", () => {
  it("sin prueba A/B no hay variante", () => {
    expect(pickVariant("c1", false)).toBeNull()
  })

  it("es determinista: el mismo cliente siempre cae en la misma variante", () => {
    for (const id of ["c1", "c2", "cliente-abc", "8f14e45f-ea0b-4a1f"]) {
      expect(pickVariant(id, true)).toBe(pickVariant(id, true))
    }
  })

  it("reparte entre las dos variantes", () => {
    const seen = new Set(
      Array.from({ length: 40 }, (_, i) => pickVariant(`cliente-${i}`, true))
    )
    expect(seen).toEqual(new Set(["a", "b"]))
  })
})

describe("tallyAbTest", () => {
  it("cuenta enviados y fallidos por variante", () => {
    const tally = tallyAbTest([
      { variant: "a", status: "sent" },
      { variant: "a", status: "sent" },
      { variant: "a", status: "failed" },
      { variant: "b", status: "sent" },
      { variant: "b", status: "scheduled" },
      { variant: null, status: "sent" },
    ])
    expect(tally).toEqual({ a: { sent: 2, failed: 1 }, b: { sent: 1, failed: 0 } })
  })

  it("sin filas devuelve ceros", () => {
    expect(tallyAbTest([])).toEqual({ a: { sent: 0, failed: 0 }, b: { sent: 0, failed: 0 } })
  })
})
