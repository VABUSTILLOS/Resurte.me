import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  CRM_TASK_PRIORITIES,
  CRM_TASK_PRIORITY_LABEL,
  CRM_TASK_STATUSES,
  CRM_TASK_STATUS_LABEL,
  DEFAULT_TASK_PRIORITY,
  MAX_TASK_TITLE_LENGTH,
  completeTask,
  daysUntilDue,
  formatTaskDue,
  isCrmTaskPriority,
  isCrmTaskStatus,
  isTaskOpen,
  isTaskOverdue,
  mapCrmTask,
  normalizeTaskDueAt,
  normalizeTaskTitle,
  openTasks,
  overdueTasks,
  reopenTask,
  requireTaskPriority,
  requireTaskTitle,
  sortTasks,
  taskAgeDays,
  taskUrgency,
  type CrmTask,
} from "@/lib/crm-tasks"

/**
 * Contrato de las tareas del CRM (Ronda 16, migración `00185_crm_tasks.sql`).
 *
 * El módulo `crm-tasks.ts` es puro: lo consumen las server actions y los
 * componentes cliente. Estas pruebas fijan las tres cosas que se rompen sin
 * avisar:
 *
 * 1. Los dos vocabularios cerrados (`priority`, `status`) son los del `CHECK`
 *    de la migración. Si divergen, la base rechaza lo que la UI ofrece.
 * 2. El `CHECK` bicondicional `(status = 'completada') = (completed_at IS NOT
 *    NULL)` es la razón de que completar y reabrir sean funciones y no
 *    asignaciones de campo: no existe "completada sin fecha".
 * 3. Lo no medido no es cero: una tarea sin `due_at` no está vencida y se pinta
 *    "Sin fecha", nunca "vence hoy".
 */

const MIGRATION_00185 = join(process.cwd(), "supabase", "migrations", "00185_crm_tasks.sql")

const sql = readFileSync(MIGRATION_00185, "utf8")

/** Los valores de un `CHECK (column IN (...))` de la migración. */
function checkValues(column: string): string[] {
  const re = new RegExp(`${column}\\s+IN\\s*\\(([^)]*)\\)`, "i")
  const match = re.exec(sql)
  expect(match?.[1], `no se encontró el CHECK de ${column} en 00185`).toBeTruthy()
  return [...(match?.[1] ?? "").matchAll(/'([^']+)'/g)].flatMap((m) => (m[1] ? [m[1]] : []))
}

const NOW = new Date("2026-09-15T12:00:00.000Z")

/** Tarea válida: pendiente, prioridad media, sin fecha. */
function task(overrides: Partial<CrmTask> = {}): CrmTask {
  return {
    id: 1,
    prospect_id: 10,
    seller_id: null,
    title: "Llamar a Juan",
    due_at: null,
    priority: "media",
    status: "pendiente",
    completed_at: null,
    created_by: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  }
}

describe("vocabulario contra la migración 00185", () => {
  it("CRM_TASK_PRIORITIES es exactamente el CHECK de la migración", () => {
    expect([...CRM_TASK_PRIORITIES]).toEqual(checkValues("priority"))
    expect(checkValues("priority")).toEqual(["alta", "media", "baja"])
  })

  it("CRM_TASK_STATUSES es exactamente el CHECK de la migración", () => {
    expect([...CRM_TASK_STATUSES]).toEqual(checkValues("status"))
    expect(checkValues("status")).toEqual(["pendiente", "completada"])
  })

  it("la prioridad por omisión es la del DEFAULT de la migración", () => {
    const match = /priority\s+TEXT\s+NOT NULL\s+DEFAULT\s+'([^']+)'/i.exec(sql)
    expect(match?.[1]).toBe(DEFAULT_TASK_PRIORITY)
  })

  it("el estado por omisión es pendiente", () => {
    const match = /status\s+TEXT\s+NOT NULL\s+DEFAULT\s+'([^']+)'/i.exec(sql)
    expect(match?.[1]).toBe("pendiente")
  })

  it("cada valor tiene etiqueta legible y distinta", () => {
    const priorityLabels = CRM_TASK_PRIORITIES.map((p) => CRM_TASK_PRIORITY_LABEL[p])
    const statusLabels = CRM_TASK_STATUSES.map((s) => CRM_TASK_STATUS_LABEL[s])
    for (const label of [...priorityLabels, ...statusLabels]) expect(label).toBeTruthy()
    expect(new Set(priorityLabels).size).toBe(priorityLabels.length)
    expect(new Set(statusLabels).size).toBe(statusLabels.length)
  })

  it("los validadores aceptan solo el vocabulario cerrado", () => {
    for (const priority of CRM_TASK_PRIORITIES) expect(isCrmTaskPriority(priority)).toBe(true)
    for (const status of CRM_TASK_STATUSES) expect(isCrmTaskStatus(status)).toBe(true)
    for (const bad of ["", "ALTA", "urgente", null, undefined, 1, {}]) {
      expect(isCrmTaskPriority(bad)).toBe(false)
      expect(isCrmTaskStatus(bad)).toBe(false)
    }
  })

  it("el CHECK bicondicional de status/completed_at sigue en la migración", () => {
    // Es la razón de ser de `completeTask` / `reopenTask`. Si alguien lo relaja,
    // esta prueba avisa antes de que una métrica de cumplimiento empiece a mentir.
    const normalizado = sql.replace(/\s+/g, " ")
    expect(normalizado).toContain(
      "CHECK ((status = 'completada') = (completed_at IS NOT NULL))"
    )
  })

  it("la tabla exige prospecto y encadena su borrado", () => {
    expect(sql).toMatch(
      /prospect_id\s+BIGINT\s+NOT NULL\s+REFERENCES\s+public\.crm_prospects\(id\)\s+ON DELETE CASCADE/
    )
  })

  it("RLS se enciende sin ninguna política", () => {
    // Una política "para el vendedor" aquí sería una segunda barrera que no
    // puede ver el `CrmScope` de código; dos barreras que dicen cosas distintas
    // es peor que una. `rls-coverage.contract.test.ts` lo vigila en conjunto.
    expect(sql).toMatch(/ALTER TABLE public\.crm_tasks ENABLE ROW LEVEL SECURITY/)
    expect(sql).not.toMatch(/CREATE POLICY/i)
  })
})

describe("mapCrmTask", () => {
  it("null no se convierte en 0 ni en cadena vacía", () => {
    const mapped = mapCrmTask({ id: 1, prospect_id: 10, title: "x" })
    expect(mapped.seller_id).toBeNull()
    expect(mapped.due_at).toBeNull()
    expect(mapped.completed_at).toBeNull()
    expect(mapped.created_by).toBeNull()
  })

  it("un vocabulario desconocido cae a los valores por omisión de la migración", () => {
    const mapped = mapCrmTask({ id: 1, prospect_id: 10, title: "x", priority: "urgente" })
    expect(mapped.priority).toBe(DEFAULT_TASK_PRIORITY)
    expect(mapCrmTask({ id: 1, prospect_id: 10, title: "x", status: "hecha" }).status).toBe(
      "pendiente"
    )
  })

  it("id y prospect_id se normalizan a número aunque lleguen como texto", () => {
    const mapped = mapCrmTask({ id: "3", prospect_id: "10", title: "x" })
    expect(mapped.id).toBe(3)
    expect(mapped.prospect_id).toBe(10)
  })

  it("updated_at cae a created_at cuando la columna no llega", () => {
    const mapped = mapCrmTask({ id: 1, prospect_id: 10, title: "x", created_at: "2026-01-01T00:00:00Z" })
    expect(mapped.updated_at).toBe("2026-01-01T00:00:00Z")
  })
})

describe("normalización del alta", () => {
  it("colapsa espacios y recorta", () => {
    expect(normalizeTaskTitle("  Llamar   a  Juan  ")).toBe("Llamar a Juan")
  })

  it("devuelve null cuando no queda nada usable", () => {
    for (const vacio of ["", "   ", "\n\t", null, undefined]) {
      expect(normalizeTaskTitle(vacio)).toBeNull()
    }
  })

  it("conserva acentos y mayúsculas: es texto para leer, no clave de filtro", () => {
    // A diferencia de las etiquetas (`normalizeForSearch`), un título no pierde
    // acentos: "Llamar a José" no debe guardarse como "llamar a jose".
    expect(normalizeTaskTitle("Llamar a José")).toBe("Llamar a José")
  })

  it("recorta al máximo sin dejar espacios colgando", () => {
    const largo = `${"a".repeat(MAX_TASK_TITLE_LENGTH)} cola`
    const normalizado = normalizeTaskTitle(largo)
    expect(normalizado).toHaveLength(MAX_TASK_TITLE_LENGTH)
    expect(normalizado).toBe("a".repeat(MAX_TASK_TITLE_LENGTH))
  })

  it("requireTaskTitle lanza en vez de devolver null", () => {
    expect(requireTaskTitle("Cobrar factura")).toBe("Cobrar factura")
    expect(() => requireTaskTitle("   ")).toThrow("El título de la tarea es obligatorio")
  })

  it("requireTaskPriority rechaza lo que no está en el vocabulario", () => {
    expect(requireTaskPriority("alta")).toBe("alta")
    expect(() => requireTaskPriority("urgente")).toThrow("Prioridad de tarea no válida")
  })

  it("normalizeTaskDueAt convierte a ISO y descarta lo ilegible", () => {
    expect(normalizeTaskDueAt("2026-09-15T10:00:00Z")).toBe("2026-09-15T10:00:00.000Z")
    for (const vacio of ["", null, undefined, "no es fecha"]) {
      expect(normalizeTaskDueAt(vacio)).toBeNull()
    }
  })
})

describe("completar y reabrir", () => {
  it("completar escribe status y fecha juntos", () => {
    // El `CHECK` bicondicional de 00185 lo exige: dejar la fecha en manos del
    // llamador es dejar abierta la única forma de romperlo.
    expect(completeTask(NOW)).toEqual({
      status: "completada",
      completed_at: "2026-09-15T12:00:00.000Z",
    })
  })

  it("reabrir limpia la fecha", () => {
    expect(reopenTask()).toEqual({ status: "pendiente", completed_at: null })
  })

  it("el par resultante nunca contradice el CHECK", () => {
    for (const patch of [completeTask(NOW), reopenTask()]) {
      expect(patch.status === "completada").toBe(patch.completed_at !== null)
    }
  })
})

describe("vencida y sin fecha", () => {
  it("sin due_at no está vencida: es «sin fecha», no «vence ahora»", () => {
    expect(isTaskOverdue(task({ due_at: null }), NOW)).toBe(false)
    expect(taskUrgency(task({ due_at: null }), NOW)).toBe(3)
  })

  it("una pendiente con fecha pasada está vencida", () => {
    const vencida = task({ due_at: "2026-09-14T12:00:00.000Z" })
    expect(isTaskOverdue(vencida, NOW)).toBe(true)
    expect(taskUrgency(vencida, NOW)).toBe(0)
  })

  it("una completada no está vencida aunque su fecha haya pasado", () => {
    const hecha = task({
      status: "completada",
      completed_at: "2026-09-14T10:00:00.000Z",
      due_at: "2026-09-01T12:00:00.000Z",
    })
    expect(isTaskOverdue(hecha, NOW)).toBe(false)
    expect(isTaskOpen(hecha)).toBe(false)
  })

  it("la urgencia distingue vencida, hoy, futura y sin fecha", () => {
    expect(taskUrgency(task({ due_at: "2026-09-10T09:00:00.000Z" }), NOW)).toBe(0)
    expect(taskUrgency(task({ due_at: "2026-09-15T23:00:00.000Z" }), NOW)).toBe(1)
    expect(taskUrgency(task({ due_at: "2026-09-20T09:00:00.000Z" }), NOW)).toBe(2)
    expect(taskUrgency(task({ due_at: null }), NOW)).toBe(3)
  })

  it("una fecha ilegible se trata como no medida, no como vencida", () => {
    expect(isTaskOverdue(task({ due_at: "no es fecha" }), NOW)).toBe(false)
    expect(taskUrgency(task({ due_at: "no es fecha" }), NOW)).toBe(3)
    expect(daysUntilDue(task({ due_at: "no es fecha" }), NOW)).toBeNull()
  })

  it("overdueTasks solo devuelve vencidas abiertas", () => {
    const lista = [
      task({ id: 1, due_at: "2026-09-10T09:00:00.000Z" }),
      task({ id: 2, due_at: null }),
      task({ id: 3, status: "completada", completed_at: NOW.toISOString(), due_at: "2026-09-01T09:00:00.000Z" }),
    ]
    expect(overdueTasks(lista, NOW).map((t) => t.id)).toEqual([1])
  })
})

describe("orden de trabajo", () => {
  it("ordena por tiempo antes que por prioridad declarada", () => {
    // Si `alta` ganara a `vencida`, una tarea marcada alta hace un mes taparía
    // la que se pasó ayer.
    const lista = [
      task({ id: 1, priority: "alta", due_at: "2026-09-20T09:00:00.000Z" }),
      task({ id: 2, priority: "baja", due_at: "2026-09-10T09:00:00.000Z" }),
    ]
    expect(sortTasks(lista, NOW).map((t) => t.id)).toEqual([2, 1])
  })

  it("a igualdad de urgencia desempata por prioridad declarada", () => {
    const lista = [
      task({ id: 1, priority: "baja", due_at: "2026-09-20T09:00:00.000Z" }),
      task({ id: 2, priority: "alta", due_at: "2026-09-20T09:00:00.000Z" }),
      task({ id: 3, priority: "media", due_at: "2026-09-20T09:00:00.000Z" }),
    ]
    expect(sortTasks(lista, NOW).map((t) => t.id)).toEqual([2, 3, 1])
  })

  it("a igualdad de urgencia y prioridad gana la más antigua", () => {
    const lista = [
      task({ id: 1, created_at: "2026-09-10T00:00:00.000Z" }),
      task({ id: 2, created_at: "2026-09-01T00:00:00.000Z" }),
    ]
    expect(sortTasks(lista, NOW).map((t) => t.id)).toEqual([2, 1])
  })

  it("las completadas van al final, por cierre más reciente", () => {
    const lista = [
      task({ id: 1, status: "completada", completed_at: "2026-09-01T00:00:00.000Z" }),
      task({ id: 2 }),
      task({ id: 3, status: "completada", completed_at: "2026-09-10T00:00:00.000Z" }),
    ]
    expect(sortTasks(lista, NOW).map((t) => t.id)).toEqual([2, 3, 1])
  })

  it("no muta la lista original", () => {
    const lista = [task({ id: 1, due_at: "2026-09-20T09:00:00.000Z" }), task({ id: 2, due_at: null })]
    sortTasks(lista, NOW)
    expect(lista.map((t) => t.id)).toEqual([1, 2])
  })

  it("openTasks deja fuera las completadas", () => {
    const lista = [
      task({ id: 1 }),
      task({ id: 2, status: "completada", completed_at: NOW.toISOString() }),
    ]
    expect(openTasks(lista, NOW).map((t) => t.id)).toEqual([1])
  })
})

describe("presentación del vencimiento", () => {
  it("nunca inventa una fecha", () => {
    expect(daysUntilDue(task({ due_at: null }), NOW)).toBeNull()
    expect(formatTaskDue(task({ due_at: null }), NOW)).toBe("Sin fecha")
  })

  it("días hasta el vencimiento: negativo pasada, 0 hoy", () => {
    expect(daysUntilDue(task({ due_at: "2026-09-10T09:00:00.000Z" }), NOW)).toBe(-5)
    expect(daysUntilDue(task({ due_at: "2026-09-15T23:00:00.000Z" }), NOW)).toBe(0)
    expect(daysUntilDue(task({ due_at: "2026-09-20T09:00:00.000Z" }), NOW)).toBe(5)
  })

  it("la etiqueta distingue vencida, hoy, mañana y futura", () => {
    expect(formatTaskDue(task({ due_at: "2026-09-10T09:00:00.000Z" }), NOW)).toBe("Vencida hace 5 d")
    expect(formatTaskDue(task({ due_at: "2026-09-15T23:00:00.000Z" }), NOW)).toBe("Vence hoy")
    expect(formatTaskDue(task({ due_at: "2026-09-16T09:00:00.000Z" }), NOW)).toBe("Vence mañana")
    expect(formatTaskDue(task({ due_at: "2026-09-20T09:00:00.000Z" }), NOW)).toBe("Vence en 5 d")
  })

  it("una tarea completada no se pinta como vencida", () => {
    const hecha = task({ status: "completada", completed_at: NOW.toISOString(), due_at: "2026-09-01T09:00:00.000Z" })
    expect(formatTaskDue(hecha, NOW)).toBe("Completada")
  })

  it("taskAgeDays mide días completos y devuelve null si no se puede medir", () => {
    expect(taskAgeDays(task({ created_at: "2026-09-01T00:00:00.000Z" }), NOW)).toBe(14)
    expect(taskAgeDays(task({ created_at: "no es fecha" }), NOW)).toBeNull()
  })
})
