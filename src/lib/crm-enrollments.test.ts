import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  ENROLLMENT_STATUSES,
  ENROLLMENT_STATUS_LABEL,
  buildEnrollmentList,
  describeEnrollmentResult,
  enrollmentStepLabel,
  enrollmentSummary,
  isEnrollmentOpen,
  isEnrollmentStatus,
  isReenrollable,
  normalizeEnrollmentStatus,
  planEnrollmentUpsert,
  type EnrollmentProspect,
  type EnrollmentRow,
} from "@/lib/crm-enrollments"

/**
 * Pruebas de las reglas de inscripción.
 *
 * La fila `C12` del backlog declaraba los cinco escritores del CRM como
 * "cubiertos por pruebas" cuando ninguna prueba los nombraba. Estas son las
 * pruebas que faltaban para la mitad que sí se puede probar sin Supabase: el
 * plan de inscripción y el armado de la lista.
 */

const MIGRATION_00140 = join(
  process.cwd(),
  "supabase",
  "migrations",
  "00140_leads_crm_inbox.sql"
)
const sql = readFileSync(MIGRATION_00140, "utf8")

/** Los valores del `CHECK (status IN (...))` de `crm_sequence_enrollments`. */
function checkStatuses(): string[] {
  const match =
    /status\s+TEXT\s+NOT NULL\s+DEFAULT\s+'[^']+'\s*\n?\s*CHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)/i.exec(
      sql
    )
  expect(match?.[1], "no se encontró el CHECK de status en 00140").toBeTruthy()
  return [...(match?.[1] ?? "").matchAll(/'([^']+)'/g)].flatMap((m) => (m[1] ? [m[1]] : []))
}

function row(overrides: Partial<EnrollmentRow> & { id: number }): EnrollmentRow {
  return {
    sequence_id: 7,
    prospect_id: overrides.id,
    current_step: 0,
    next_run_at: null,
    status: "activa",
    created_at: "2026-01-01T10:00:00.000Z",
    ...overrides,
  }
}

function prospect(overrides: Partial<EnrollmentProspect> & { id: number }): EnrollmentProspect {
  return { name: `Prospecto ${overrides.id}`, phone: null, whatsapp: null, ...overrides }
}

describe("vocabulario de estados de inscripción", () => {
  it("el CHECK de 00140 sigue teniendo los 4 estados", () => {
    expect(checkStatuses()).toEqual(["activa", "pausada", "completada", "cancelada"])
  })

  it("ENROLLMENT_STATUSES es exactamente el CHECK", () => {
    expect([...ENROLLMENT_STATUSES]).toEqual(checkStatuses())
  })

  it("cada estado tiene etiqueta no vacía", () => {
    for (const status of ENROLLMENT_STATUSES) {
      expect(ENROLLMENT_STATUS_LABEL[status].trim()).not.toBe("")
    }
  })

  it("isEnrollmentStatus solo acepta los cuatro", () => {
    for (const status of ENROLLMENT_STATUSES) expect(isEnrollmentStatus(status)).toBe(true)
    expect(isEnrollmentStatus("enviada")).toBe(false)
    expect(isEnrollmentStatus(null)).toBe(false)
    expect(isEnrollmentStatus(3)).toBe(false)
  })

  it("un estado desconocido cae en `activa` para que el tipo sea total", () => {
    // El respaldo existe para que `AdminEnrollment.status` sea total, no para
    // inventar datos: `activa` es el estado que la UI puede deshacer.
    expect(normalizeEnrollmentStatus("enviada")).toBe("activa")
    expect(normalizeEnrollmentStatus(null)).toBe("activa")
    expect(normalizeEnrollmentStatus("cancelada")).toBe("cancelada")
  })
})

describe("abierto y reinscribible", () => {
  it("solo `activa` está abierta", () => {
    expect(isEnrollmentOpen("activa")).toBe(true)
    expect(isEnrollmentOpen("pausada")).toBe(false)
    expect(isEnrollmentOpen("completada")).toBe(false)
    expect(isEnrollmentOpen("cancelada")).toBe(false)
  })

  it("todo lo que no corre se puede reinscribir", () => {
    expect(isReenrollable("activa")).toBe(false)
    expect(isReenrollable("pausada")).toBe(true)
    expect(isReenrollable("completada")).toBe(true)
    expect(isReenrollable("cancelada")).toBe(true)
  })

  it("isReenrollable es el complemento exacto de isEnrollmentOpen", () => {
    for (const status of ENROLLMENT_STATUSES) {
      expect(isReenrollable(status)).toBe(!isEnrollmentOpen(status))
    }
  })

  it("el cron solo procesa `activa`, que es lo que isEnrollmentOpen declara", () => {
    // Ata la regla pura al motor: si el motor empezara a procesar `pausada`,
    // `isEnrollmentOpen` mentiría sobre lo que corre.
    const engine = readFileSync(join(process.cwd(), "src", "lib", "crm-sequences-engine.ts"), "utf8")
    expect(engine).toContain('.eq("status", "activa")')
    expect(engine).not.toContain('.eq("status", "pausada")')
  })
})

describe("buildEnrollmentList", () => {
  it("resuelve nombre y contacto del prospecto", () => {
    const list = buildEnrollmentList(
      [row({ id: 1, prospect_id: 42 })],
      [prospect({ id: 42, name: "Cafetería Luna", phone: "5512345678" })],
      3
    )
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({
      id: 1,
      prospectId: 42,
      prospectName: "Cafetería Luna",
      contact: "5512345678",
      status: "activa",
      statusLabel: "Activa",
      totalSteps: 3,
    })
  })

  it("cae al WhatsApp cuando no hay teléfono", () => {
    const list = buildEnrollmentList(
      [row({ id: 1, prospect_id: 42 })],
      [prospect({ id: 42, phone: null, whatsapp: "5599999999" })],
      3
    )
    expect(list[0]?.contact).toBe("5599999999")
  })

  it("un prospecto desaparecido no rompe la lista: sigue siendo cancelable", () => {
    // El prospecto puede borrarse entre la inscripción y la lectura. La
    // inscripción huérfana se muestra, no se esconde.
    const list = buildEnrollmentList([row({ id: 1, prospect_id: 42, status: "cancelada" })], [], 3)
    expect(list[0]).toMatchObject({
      prospectName: "Prospecto #42",
      contact: null,
      status: "cancelada",
    })
  })

  it("ordena por estado, luego por próxima ejecución y luego por nombre", () => {
    const list = buildEnrollmentList(
      [
        row({ id: 1, prospect_id: 1, status: "cancelada" }),
        row({ id: 2, prospect_id: 2, status: "activa", next_run_at: "2026-03-02T00:00:00.000Z" }),
        row({ id: 3, prospect_id: 3, status: "activa", next_run_at: "2026-03-01T00:00:00.000Z" }),
        row({ id: 4, prospect_id: 4, status: "activa", next_run_at: null }),
        row({ id: 5, prospect_id: 5, status: "pausada" }),
        row({ id: 6, prospect_id: 6, status: "completada" }),
      ],
      [1, 2, 3, 4, 5, 6].map((id) => prospect({ id })),
      2
    )
    expect(list.map((item) => item.id)).toEqual([3, 2, 4, 5, 6, 1])
  })

  it("desempata por nombre en español", () => {
    const list = buildEnrollmentList(
      [row({ id: 1, prospect_id: 1 }), row({ id: 2, prospect_id: 2 })],
      [prospect({ id: 1, name: "Ávila" }), prospect({ id: 2, name: "Bogotá" })],
      1
    )
    expect(list.map((item) => item.prospectName)).toEqual(["Ávila", "Bogotá"])
  })

  it("normaliza pasos negativos a 0", () => {
    const list = buildEnrollmentList([row({ id: 1, current_step: -5 })], [], -2)
    expect(list[0]).toMatchObject({ currentStep: 0, totalSteps: 0 })
  })
})

describe("enrollmentSummary y enrollmentStepLabel", () => {
  it("cuenta cada estado, incluidos los ceros", () => {
    const list = buildEnrollmentList(
      [
        row({ id: 1, prospect_id: 1, status: "activa" }),
        row({ id: 2, prospect_id: 2, status: "activa" }),
        row({ id: 3, prospect_id: 3, status: "cancelada" }),
      ],
      [],
      1
    )
    expect(enrollmentSummary(list)).toEqual({
      activa: 2,
      pausada: 0,
      completada: 0,
      cancelada: 1,
    })
  })

  it("una lista vacía resume en ceros", () => {
    expect(enrollmentSummary([])).toEqual({ activa: 0, pausada: 0, completada: 0, cancelada: 0 })
  })

  it("el paso se muestra como `n de total` y nunca pasa del total", () => {
    expect(enrollmentStepLabel(0, 3)).toBe("0 de 3")
    expect(enrollmentStepLabel(2, 3)).toBe("2 de 3")
    expect(enrollmentStepLabel(9, 3)).toBe("3 de 3")
    expect(enrollmentStepLabel(0, 0)).toBe("—")
  })
})

describe("planEnrollmentUpsert — la mitad que hace reversible el cancelar", () => {
  it("sin fila previa se inserta", () => {
    expect(planEnrollmentUpsert([], [1, 2])).toEqual({
      insert: [1, 2],
      reactivate: [],
      skip: [],
    })
  })

  it("una fila activa se salta: el contrato de `ya inscrito` no cambia", () => {
    expect(planEnrollmentUpsert([{ prospect_id: 1, status: "activa" }], [1])).toEqual({
      insert: [],
      reactivate: [],
      skip: [1],
    })
  })

  it("una cancelada se reactiva en vez de perderse para siempre", () => {
    expect(planEnrollmentUpsert([{ prospect_id: 1, status: "cancelada" }], [1])).toEqual({
      insert: [],
      reactivate: [1],
      skip: [],
    })
  })

  it("`pausada` y `completada` también se reactivan", () => {
    expect(planEnrollmentUpsert([{ prospect_id: 1, status: "pausada" }], [1]).reactivate).toEqual([1])
    expect(planEnrollmentUpsert([{ prospect_id: 2, status: "completada" }], [2]).reactivate).toEqual([
      2,
    ])
  })

  it("resuelve una mezcla de los cuatro casos", () => {
    const plan = planEnrollmentUpsert(
      [
        { prospect_id: 1, status: "activa" },
        { prospect_id: 2, status: "cancelada" },
        { prospect_id: 3, status: "completada" },
        { prospect_id: 4, status: "pausada" },
      ],
      [1, 2, 3, 4, 5]
    )
    expect(plan).toEqual({ insert: [5], reactivate: [2, 3, 4], skip: [1] })
  })

  it("ningún prospecto cae en dos cubos ni se pierde", () => {
    // El `UNIQUE (sequence_id, prospect_id)` obliga a que cada id acabe en
    // exactamente un cubo: es lo que impide que un `INSERT` choque.
    const ids = [1, 2, 3, 4, 5, 6, 7]
    const plan = planEnrollmentUpsert(
      [
        { prospect_id: 2, status: "activa" },
        { prospect_id: 4, status: "cancelada" },
        { prospect_id: 6, status: "pausada" },
        { prospect_id: 99, status: "activa" },
      ],
      ids
    )
    const buckets = [...plan.insert, ...plan.reactivate, ...plan.skip]
    expect(buckets.slice().sort((a, b) => a - b)).toEqual(ids)
    expect(new Set(buckets).size).toBe(buckets.length)
    expect(plan.insert).not.toContain(2)
    expect(plan.reactivate).not.toContain(2)
  })

  it("ignora las filas de prospectos que no están en el lote", () => {
    const plan = planEnrollmentUpsert([{ prospect_id: 99, status: "activa" }], [1])
    expect(plan).toEqual({ insert: [1], reactivate: [], skip: [] })
  })
})

describe("describeEnrollmentResult", () => {
  it("`enrolled` cuenta insertadas y reactivadas juntas", () => {
    const result = describeEnrollmentResult({
      insert: [1, 2],
      reactivate: [3],
      skip: [4],
    })
    expect(result).toEqual({ enrolled: 3, skipped: 1, reactivated: 1, reason: null })
  })

  it("`reactivated` es un subconjunto de `enrolled`", () => {
    const result = describeEnrollmentResult({ insert: [1], reactivate: [2, 3], skip: [] })
    expect(result.reactivated).toBe(2)
    expect(result.enrolled).toBe(3)
    expect(result.reactivated).toBeLessThanOrEqual(result.enrolled)
  })

  it("si no hay nada que hacer explica por qué", () => {
    const result = describeEnrollmentResult({ insert: [], reactivate: [], skip: [1, 2] })
    expect(result).toEqual({
      enrolled: 0,
      skipped: 2,
      reactivated: 0,
      reason: "Ya estaban inscritos en esta secuencia",
    })
  })

  it("reactivar en solitario no es un error: hay trabajo que hacer", () => {
    const result = describeEnrollmentResult({ insert: [], reactivate: [1], skip: [2] })
    expect(result.reason).toBeNull()
    expect(result.enrolled).toBe(1)
  })
})
