import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CRM_STATUSES, LEAD_STATUSES, isCrmStatus, isLeadStatus } from "./crm-pipeline"
import { LEAD_BOXES, leadStatusForBox } from "./crm-filters"

/**
 * Contrato entre el motor puro del CRM de leads (`@/lib/crm-pipeline`) y el
 * esquema que lo sostiene (`00139_leads_crm_conversion.sql` + `00052`).
 *
 * Contexto: la Ronda 5 conecta la bandeja de leads del panel con el pipeline de
 * `crm_prospects`, dos mundos que hasta ahora no se hablaban. Ese puente se
 * apoya en cuatro decisiones de esquema que el TypeScript **no puede** validar
 * por sí solo:
 *
 *  1. `crm_prospects.seller_id` es nullable — si alguien lo vuelve NOT NULL,
 *     `assignCrmProspect(id, null)` (devolver un prospecto a "sin asignar")
 *     empieza a fallar en runtime y el tipo `string | null` miente.
 *  2. `crm_prospects.lead_id` tiene un índice único **parcial**: es lo que hace
 *     idempotente la conversión. Un índice total rompería los prospectos
 *     manuales (todos con `lead_id IS NULL`).
 *  3. `leads.status` tiene un CHECK de tres valores. `LEAD_STATUSES` es la
 *     fuente de verdad en TS; el filtro del panel descarta en silencio
 *     cualquier valor fuera de la lista, así que un CHECK más ancho que la
 *     lista deja leads invisibles y uno más estrecho rompe la escritura.
 *  4. La captura (`/api/leads`) es fail-open y escribe `nuevo`: el DEFAULT del
 *     CHECK tiene que ser ese valor o cada lead nuevo nace fuera de la bandeja.
 *
 * Además fija los dos invariantes de seguridad que el plan declaró explícitos:
 * la RLS **no** se relaja para exponer la cartera sin asignar, y los filtros
 * del panel solo usan columnas que existen (los índices las nombran).
 */

const REPO = process.cwd()
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations")

const MIGRATION_00139 = "00139_leads_crm_conversion.sql"
const MIGRATION_00052 = "00052_comercializacion.sql"

const readMigration = (name: string) => readFileSync(join(MIGRATIONS_DIR, name), "utf8")

/** Extrae los valores de un `CHECK (col IN ('a','b'))` sobre la columna dada. */
function checkValues(sql: string, column: string): string[] {
  const re = new RegExp(
    `${column}\\s+IN\\s*\\(([^)]*)\\)`,
    "i"
  )
  const match = sql.match(re)
  if (!match?.[1]) return []
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1] as string)
}

/** Comentarios fuera: un CHECK comentado no cuenta como contrato. */
const stripComments = (sql: string) =>
  sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")

describe("contrato del esquema de la conversión lead → prospecto", () => {
  const migration = stripComments(readMigration(MIGRATION_00139))

  it("existe la migración que el plan declaró y no es un no-op", () => {
    expect(migration).toContain("crm_prospects")
    expect(migration).toContain("ALTER TABLE public.leads")
  })

  it("seller_id deja de ser NOT NULL (el pipeline acepta 'sin asignar')", () => {
    expect(migration).toMatch(
      /ALTER TABLE public\.crm_prospects\s+ALTER COLUMN seller_id DROP NOT NULL/i
    )
    // Regresión: un ADD COLUMN ... NOT NULL reintroduciría el bloqueo.
    expect(migration).not.toMatch(/seller_id[^;]*SET NOT NULL/i)
  })

  it("el vínculo lead_id es único y PARCIAL (idempotencia sin romper los manuales)", () => {
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX[^;]*ON public\.crm_prospects\s*\(\s*lead_id\s*\)[^;]*WHERE lead_id IS NOT NULL/i
    )
    // Un índice total chocaría entre prospectos manuales (lead_id NULL repetido).
    expect(migration).not.toMatch(
      /CREATE UNIQUE INDEX[^;]*\(\s*lead_id\s*\)\s*;/i
    )
  })

  it("el vínculo se guarda en ambos lados, nullable y con ON DELETE SET NULL", () => {
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS lead_id BIGINT\s+REFERENCES public\.leads\(id\) ON DELETE SET NULL/i
    )
    expect(migration).toMatch(
      /converted_prospect_id BIGINT\s+REFERENCES public\.crm_prospects\(id\) ON DELETE SET NULL/i
    )
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ/i)
  })
})

describe("contrato entre LEAD_STATUSES y el CHECK de leads.status", () => {
  const migration = stripComments(readMigration(MIGRATION_00139))

  it("el CHECK del SQL coincide exactamente con LEAD_STATUSES", () => {
    const values = checkValues(migration, "status")
    expect(values.length).toBeGreaterThan(0)
    expect(values).toEqual([...LEAD_STATUSES])
  })

  it("el default del CHECK es 'nuevo' (la captura fail-open no cambia)", () => {
    expect(migration).toMatch(
      /ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'nuevo'/i
    )
  })

  it("isLeadStatus acepta exactamente lo que el CHECK permite", () => {
    for (const status of LEAD_STATUSES) {
      expect(isLeadStatus(status)).toBe(true)
    }
    expect(isLeadStatus("pendiente")).toBe(false)
    expect(isLeadStatus("")).toBe(false)
    expect(isLeadStatus("NUEVO")).toBe(false)
  })

  it("cada bandeja del panel mapea a un estado válido o a 'todos'", () => {
    // El panel no puede ofrecer una bandeja cuyo estado el CHECK rechace:
    // el filtro lo descartaría en silencio y la vista saldría vacía.
    for (const box of LEAD_BOXES) {
      const status = leadStatusForBox(box)
      if (status === null) continue
      expect(LEAD_STATUSES).toContain(status)
    }
  })
})

describe("contrato entre CRM_STATUSES y el CHECK de crm_prospects.status", () => {
  const migration = stripComments(readMigration(MIGRATION_00052))

  it("CRM_STATUSES coincide exactamente con el CHECK de 00052", () => {
    const values = checkValues(migration, "status")
    expect(values.length).toBeGreaterThan(0)
    expect(values).toEqual([...CRM_STATUSES])
  })

  it("isCrmStatus acepta exactamente lo que el CHECK permite", () => {
    for (const status of CRM_STATUSES) {
      expect(isCrmStatus(status)).toBe(true)
    }
    expect(isCrmStatus("sin_asignar")).toBe(false)
    expect(isCrmStatus("")).toBe(false)
  })
})

describe("los índices cubren las columnas que el panel filtra", () => {
  const migration = stripComments(readMigration(MIGRATION_00139))

  it("hay índice por (status, next_follow_up_at) para el tablero", () => {
    expect(migration).toMatch(
      /ON public\.crm_prospects\s*\(\s*status\s*,\s*next_follow_up_at\s*\)/i
    )
  })

  it("'sin asignar' tiene su propio índice parcial, no un caso raro", () => {
    expect(migration).toMatch(
      /ON public\.crm_prospects\s*\(\s*created_at DESC\s*\)\s*WHERE seller_id IS NULL/i
    )
  })

  it("la bandeja de leads indexa (status, created_at DESC)", () => {
    expect(migration).toMatch(
      /ON public\.leads\s*\(\s*status\s*,\s*created_at DESC\s*\)/i
    )
  })

  it("el contador de pendientes es un índice parcial, no un filtro en memoria", () => {
    expect(migration).toMatch(
      /ON public\.leads\s*\(\s*created_at DESC\s*\)\s*WHERE status = 'nuevo' AND converted_prospect_id IS NULL/i
    )
  })
})

describe("la RLS no se relaja para exponer la cartera sin asignar", () => {
  const migration = stripComments(readMigration(MIGRATION_00139))

  it("no aparece ningún OR seller_id IS NULL", () => {
    // Un `OR seller_id IS NULL` en una política haría que TODOS los vendedores
    // vieran la cartera sin repartir. La decisión del plan es lo contrario:
    // NULL es invisible para vendedores y el admin reparte.
    expect(migration).not.toMatch(/OR\s+seller_id\s+IS\s+NULL/i)
  })

  it("la migración no crea ni altera políticas de crm_prospects", () => {
    expect(migration).not.toMatch(/CREATE POLICY/i)
    expect(migration).not.toMatch(/DROP POLICY/i)
    expect(migration).not.toMatch(/ALTER POLICY/i)
  })
})
