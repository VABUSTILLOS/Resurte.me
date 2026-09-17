import { describe, expect, test } from "vitest"
import {
  MAX_SEQUENCE_SENDS_PER_RUN,
  SEQUENCE_SKIP_NO_PHONE,
  SEQUENCE_SKIP_NO_TEMPLATE,
  advanceSequenceEnrollment,
  nextSequenceStep,
  planSequenceEnrollment,
  sequenceSkipReason,
  sequenceStepText,
  sortSequenceSteps,
  type SequenceEnrollment,
  type SequenceProspect,
  type SequenceStep,
} from "./crm-sequences-engine"

function step(overrides: Partial<SequenceStep> & { step_order: number }): SequenceStep {
  return {
    id: overrides.step_order,
    sequence_id: 7,
    delay_hours: 24,
    template_name: null,
    body: null,
    ...overrides,
  }
}

const PROSPECT: SequenceProspect = {
  id: 42,
  name: "Ana López",
  restaurant_name: "Taquería Ana",
  phone: "5512345678",
  whatsapp: null,
}

function enrollment(overrides: Partial<SequenceEnrollment> = {}): SequenceEnrollment {
  return {
    id: 900,
    sequence_id: 7,
    prospect_id: 42,
    current_step: 0,
    next_run_at: "2026-01-01T00:00:00.000Z",
    status: "activa",
    ...overrides,
  }
}

describe("crm-sequences-engine — orden y avance", () => {
  test("sortSequenceSteps ordena sin mutar la entrada", () => {
    const input = [step({ step_order: 3 }), step({ step_order: 1 }), step({ step_order: 2 })]
    const ordered = sortSequenceSteps(input)
    expect(ordered.map((s) => s.step_order)).toEqual([1, 2, 3])
    expect(input.map((s) => s.step_order)).toEqual([3, 1, 2])
  })

  test("nextSequenceStep devuelve el paso 1 cuando no se ha enviado nada", () => {
    const steps = [step({ step_order: 1 }), step({ step_order: 2 })]
    expect(nextSequenceStep(steps, 0)?.step_order).toBe(1)
  })

  test("nextSequenceStep devuelve el paso posterior al último ejecutado", () => {
    const steps = [step({ step_order: 1 }), step({ step_order: 2 }), step({ step_order: 3 })]
    expect(nextSequenceStep(steps, 2)?.step_order).toBe(3)
  })

  test("nextSequenceStep devuelve null al terminar la secuencia", () => {
    expect(nextSequenceStep([step({ step_order: 1 })], 1)).toBeNull()
  })

  test("nextSequenceStep con pasos vacíos devuelve null", () => {
    expect(nextSequenceStep([], 0)).toBeNull()
  })

  test("nextSequenceStep ignora un current_step negativo o inválido", () => {
    const steps = [step({ step_order: 1 }), step({ step_order: 2 })]
    expect(nextSequenceStep(steps, -5)?.step_order).toBe(1)
    expect(nextSequenceStep(steps, Number.NaN)?.step_order).toBe(1)
  })

  test("advanceSequenceEnrollment programa el paso siguiente con su espera", () => {
    const steps = [step({ step_order: 1, delay_hours: 0 }), step({ step_order: 2, delay_hours: 48 })]
    const advance = advanceSequenceEnrollment(steps[0]!, steps, "2026-01-01T00:00:00.000Z")
    expect(advance.status).toBe("activa")
    expect(advance.current_step).toBe(1)
    expect(advance.next_run_at).toBe("2026-01-03T00:00:00.000Z")
  })

  test("advanceSequenceEnrollment marca completada en el último paso", () => {
    const steps = [step({ step_order: 1 }), step({ step_order: 2, delay_hours: 12 })]
    const advance = advanceSequenceEnrollment(steps[1]!, steps, new Date("2026-01-01T00:00:00Z"))
    expect(advance.status).toBe("completada")
    expect(advance.next_run_at).toBeNull()
    expect(advance.current_step).toBe(2)
  })
})

describe("crm-sequences-engine — texto de los pasos", () => {
  test("sustituye las variables del prospecto", () => {
    const text = sequenceStepText(step({ step_order: 1, body: "Hola {{nombre}} de {{restaurante}}" }), {
      nombre: "Ana",
      restaurante: "Taquería Ana",
    })
    expect(text).toBe("Hola Ana de Taquería Ana")
  })

  test("deja literal la variable sin valor, no la vacía", () => {
    const text = sequenceStepText(step({ step_order: 1, body: "Hola {{nombre}}" }), {})
    expect(text).toBe("Hola {{nombre}}")
  })

  test("un paso sin body devuelve cadena vacía", () => {
    expect(sequenceStepText(step({ step_order: 1 }))).toBe("")
  })

  test("recorta el resultado", () => {
    expect(sequenceStepText(step({ step_order: 1, body: "  hola  " }))).toBe("hola")
  })
})

describe("crm-sequences-engine — compuerta de consentimiento", () => {
  test("sin teléfono no se envía nada", () => {
    expect(
      sequenceSkipReason(step({ step_order: 1, template_name: "promo" }), {
        windowOpen: true,
        recipient: null,
      })
    ).toBe(SEQUENCE_SKIP_NO_PHONE)
  })

  test("sin plantilla y con la ventana cerrada se omite", () => {
    expect(
      sequenceSkipReason(step({ step_order: 1 }), { windowOpen: false, recipient: "5512345678" })
    ).toBe(SEQUENCE_SKIP_NO_TEMPLATE)
  })

  test("sin plantilla pero con la ventana abierta sí se envía", () => {
    expect(
      sequenceSkipReason(step({ step_order: 1 }), { windowOpen: true, recipient: "5512345678" })
    ).toBeNull()
  })

  test("con plantilla aprobada se envía aunque la ventana esté cerrada", () => {
    expect(
      sequenceSkipReason(step({ step_order: 1, template_name: "promo" }), {
        windowOpen: false,
        recipient: "5512345678",
      })
    ).toBeNull()
  })

  test("sin teléfono gana sobre la falta de plantilla", () => {
    expect(
      sequenceSkipReason(step({ step_order: 1 }), { windowOpen: false, recipient: null })
    ).toBe(SEQUENCE_SKIP_NO_PHONE)
  })
})

describe("crm-sequences-engine — plan de inscripción", () => {
  const steps = [
    step({ step_order: 1, template_name: "bienvenida" }),
    step({ step_order: 2, delay_hours: 72, body: "Hola {{nombre}}" }),
  ]

  test("planifica el paso 1 con su clave de dedupe", () => {
    const plan = planSequenceEnrollment(enrollment(), steps, PROSPECT, { windowOpen: false })
    expect(plan).not.toBeNull()
    expect(plan!.stepOrder).toBe(1)
    expect(plan!.templateName).toBe("bienvenida")
    expect(plan!.dedupeKey).toBe("crm_sequence:7:42:1")
    expect(plan!.recipient).toBe("5512345678")
    expect(plan!.skipReason).toBeNull()
  })

  test("el teléfono de WhatsApp gana sobre el de contacto", () => {
    const plan = planSequenceEnrollment(
      enrollment(),
      steps,
      { ...PROSPECT, whatsapp: "5599999999" },
      { windowOpen: false }
    )
    expect(plan!.recipient).toBe("5599999999")
  })

  test("planifica el paso 2 cuando el 1 ya se ejecutó", () => {
    const plan = planSequenceEnrollment(enrollment({ current_step: 1 }), steps, PROSPECT, {
      windowOpen: true,
    })
    expect(plan!.stepOrder).toBe(2)
    expect(plan!.dedupeKey).toBe("crm_sequence:7:42:2")
    expect(plan!.text).toBe("Hola Ana López")
  })

  test("sin pasos pendientes devuelve null (la inscripción se completa)", () => {
    expect(
      planSequenceEnrollment(enrollment({ current_step: 2 }), steps, PROSPECT, { windowOpen: true })
    ).toBeNull()
  })

  test("propaga el motivo de omisión en el plan", () => {
    const plan = planSequenceEnrollment(enrollment({ current_step: 1 }), steps, PROSPECT, {
      windowOpen: false,
    })
    expect(plan!.skipReason).toBe(SEQUENCE_SKIP_NO_TEMPLATE)
  })

  test("la clave de dedupe cambia por paso, no por corrida", () => {
    const first = planSequenceEnrollment(enrollment(), steps, PROSPECT, { windowOpen: false })
    const second = planSequenceEnrollment(enrollment({ current_step: 1 }), steps, PROSPECT, {
      windowOpen: true,
    })
    expect(first!.dedupeKey).not.toBe(second!.dedupeKey)
  })

  test("un prospecto distinto produce una clave distinta", () => {
    const other = planSequenceEnrollment(
      enrollment({ prospect_id: 43 }),
      steps,
      { ...PROSPECT, id: 43 },
      { windowOpen: false }
    )
    expect(other!.dedupeKey).toBe("crm_sequence:7:43:1")
  })

  test("respeta el tope por corrida como constante exportada", () => {
    expect(MAX_SEQUENCE_SENDS_PER_RUN).toBeGreaterThan(0)
    expect(Number.isInteger(MAX_SEQUENCE_SENDS_PER_RUN)).toBe(true)
  })
})
