import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { describe, expect, it } from "vitest"
import { CRM_LOSS_REASONS, crmClosePatch, mapCrmProspect, type CrmProspectRow } from "@/lib/crm-core"
import { crmProspect } from "@/lib/crm-fixtures"

/**
 * Contrato del motivo de pérdida del CRM: **el denominador es parcial, y el
 * hueco no puede crecer.**
 *
 * ────────────────────────────────────────────────────────────────────────────
 * El hallazgo (`CRM6` de la auditoría)
 * ────────────────────────────────────────────────────────────────────────────
 *
 * El motivo de pérdida no se puede exigir retroactivamente. Cuando `00184` añadió
 * `crm_prospects.loss_reason`, las filas que ya estaban en `perdido` se quedaron
 * sin motivo, y el `CHECK` lo permite a propósito: `loss_reason IS NULL OR
 * status = 'perdido'` es una asimetría deliberada —un motivo implica un trato
 * perdido, pero un trato perdido **no** implica un motivo—. Inventarle un motivo
 * a esas filas sería escribir un dato falso; rechazarlas sería romper la base en
 * el despliegue. Cualquier métrica por motivo tendrá, por tanto, **denominador
 * parcial**.
 *
 * Lo que este contrato añade es que la limitación tenga **borde**: que el hueco
 * sea exactamente lo anterior a `00184` y no pueda crecer. El camino que escribe
 * la columna es uno solo —`crmClosePatch`— y **lanza** si falta el motivo, así
 * que un perdido sin motivo ya no se puede crear. La decisión de producto fue
 * **declarar, no construir**: un backfill de `null → 'otro'` rellenaría la
 * métrica con una mentira, que es la superficie muerta que `00189` eliminó en la
 * Oleada C vista desde otro ángulo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Por qué esto necesita un contrato y no un comentario
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La limitación se declara en el docstring de `CRM_LOSS_REASONS` (`src/lib/
 * crm-core.ts`). Un docstring no impide nada por sí solo: lo que este contrato
 * añade es que **la limitación sea falsable**. Los tres errores que este archivo
 * convierte en rojo son los tres que un recién llegado cometería de buena fe:
 *
 *   - «arreglar» el hueco con `SET NOT NULL` o con un `CHECK` que exija el
 *     motivo al perder → **rompe la base en el despliegue**, porque las filas
 *     históricas ya no cumplen;
 *   - «arreglarlo» con `UPDATE ... SET loss_reason = 'otro'` → rellena la
 *     métrica con un dato inventado;
 *   - leer el hueco como un motivo más —pintar `null` como `otro`, o etiquetar
 *     la ausencia— → hace **invisible** la parcialidad, y entonces toda métrica
 *     por motivo se lee como si estuviera completa.
 *
 * Cómo romperlo:
 *
 *   1. Añadir una migración que exija el motivo retroactivamente (NOT NULL,
 *      CHECK `status <> 'perdido' OR loss_reason IS NOT NULL`, o un backfill).
 *   2. Escribir `loss_reason` desde una segunda ruta que no valide el motivo.
 *   3. Normalizar `null` a `otro` en `mapCrmProspect` (o en el mapeo de la fila).
 *   4. Quitar de `src/lib/crm-core.ts` la declaración del denominador parcial
 *      (el contrato la exige por texto, como `migration-docs` exige la suya).
 */

const REPO = process.cwd()
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations")
const CORE_MODULE = join(REPO, "src", "lib", "crm-core.ts")

const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()

/** El SQL de todas las migraciones, con su nombre, para buscar en conjunto. */
const MIGRATION_SQL = MIGRATION_FILES.map((name) => ({
  name,
  sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8"),
}))

const coreSource = readFileSync(CORE_MODULE, "utf8")

/** Todos los `.ts`/`.tsx` de producción, sin pruebas ni dobles, relativos a la raíz. */
function productionSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...productionSources(full))
    else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name) &&
      !/-fixtures\.ts$/.test(entry.name)
    ) {
      out.push(relative(REPO, full).split(sep).join("/"))
    }
  }
  return out
}

const SOURCES = productionSources(join(REPO, "src"))

/** Normaliza espacios para que un salto de línea no rompa una aserción de texto. */
function flat(text: string): string {
  return text.replace(/\s+/g, " ")
}

const CORE_FLAT = flat(coreSource)

describe("el hueco es histórico: el esquema no puede exigir el motivo", () => {
  it("00184 declara loss_reason nullable, sin NOT NULL", () => {
    const sql = MIGRATION_SQL.find((m) => m.name.startsWith("00184"))
    expect(sql, "la migración 00184 desapareció").toBeDefined()
    expect(sql?.sql).toMatch(/ADD COLUMN IF NOT EXISTS loss_reason\s+TEXT/)
    expect(flat(sql?.sql ?? "")).not.toMatch(/loss_reason\s+TEXT\s+NOT NULL/)
  })

  it("el CHECK de coherencia exige motivo ⇒ perdido, y no al revés", () => {
    const sql = MIGRATION_SQL.find((m) => m.name.startsWith("00184"))?.sql ?? ""
    const flatSql = flat(sql)
    // La dirección que sí se exige: un motivo solo vive en un trato perdido.
    expect(flatSql).toContain(
      "CHECK (loss_reason IS NULL OR status = 'perdido')",
    )
    // La dirección que a propósito NO se exige: perdido sin motivo es legal.
    expect(flatSql).not.toContain(
      "CHECK (status <> 'perdido' OR loss_reason IS NOT NULL)",
    )
  })

  it("ninguna migración posterior exige el motivo retroactivamente", () => {
    const offenders = MIGRATION_SQL.filter(({ sql }) => {
      const flatSql = flat(sql)
      return (
        /ALTER COLUMN loss_reason SET NOT NULL/.test(flatSql) ||
        /status\s*<>\s*'perdido'\s+OR\s+loss_reason IS NOT NULL/.test(flatSql)
      )
    }).map((m) => m.name)
    expect(
      offenders,
      "una migración intenta exigir el motivo a las filas históricas: " +
        "romperá en el despliegue, no en el test",
    ).toEqual([])
  })

  it("ninguna migración rellena el hueco con un motivo inventado", () => {
    const offenders = MIGRATION_SQL.filter(({ sql }) =>
      /UPDATE\s+public\.crm_prospects[\s\S]{0,400}?SET[\s\S]{0,200}?loss_reason\s*=/i.test(
        flat(sql),
      ),
    ).map((m) => m.name)
    expect(
      offenders,
      "un backfill de loss_reason inventa el dato que la métrica mide",
    ).toEqual([])
  })
})

describe("el hueco no crece: una sola ruta escribe el motivo", () => {
  it("crmClosePatch lanza si un trato perdido no trae motivo", () => {
    expect(() => crmClosePatch("perdido")).toThrow(/motivo/i)
    expect(() => crmClosePatch("perdido", null)).toThrow(/motivo/i)
  })

  it("con motivo válido el cierre sí se construye", () => {
    const patch = crmClosePatch("perdido", "precio")
    expect(patch.status).toBe("perdido")
    expect(patch.loss_reason).toBe("precio")
  })

  it("ganar limpia el motivo heredado en vez de dejarlo pasar", () => {
    expect(crmClosePatch("ganado", "precio").loss_reason).toBeNull()
  })

  it("el vocabulario tiene siete motivos y ninguno es el hueco", () => {
    expect(CRM_LOSS_REASONS).toHaveLength(7)
    // Un motivo que signifique «no lo sé» sería el hueco disfrazado de dato.
    expect(CRM_LOSS_REASONS).not.toContain("desconocido")
    expect(CRM_LOSS_REASONS).not.toContain("sin_motivo")
  })

  it("el motivo se escribe desde un solo módulo, y solo por los dos parches", () => {
    // Un payload de escritura asigna la columna con `loss_reason:`; leerla
    // (`row.loss_reason`) o pasarla como argumento no coincide con el patrón.
    const writers = SOURCES.filter((rel) =>
      /loss_reason\s*:/.test(readFileSync(join(REPO, rel), "utf8")),
    )
    expect(
      writers,
      "una segunda ruta escribe el motivo: el hueco deja de estar acotado si " +
        "esa ruta no exige el motivo como crmClosePatch",
    ).toEqual(["src/lib/crm-core.ts"])
  })
})

/**
 * La vista sin tipos que `mapCrmProspect` recibe de verdad.
 *
 * `crmProspect()` devuelve la fila **ya tipada**, y ese tipo es más estrecho que
 * lo que la base puede contener: el `CHECK` de `loss_reason` es asimétrico, así
 * que una fila real puede traer un motivo fuera del vocabulario —o no traer la
 * columna— y el mapeador tiene que aguantarlo. Castear es lo único que permite
 * escribir esos casos; si el casteo dejara de ser necesario sería porque el tipo
 * de la fila se ensanchó, que es justo lo que este contrato no quiere.
 */
function rawRow(row: CrmProspectRow): Record<string, unknown> {
  return row as unknown as Record<string, unknown>
}

describe("el hueco es visible: null no se convierte en un motivo", () => {
  it("una fila perdida sin motivo llega como null, no como 'otro'", () => {
    const row = crmProspect({ status: "perdido", loss_reason: null })
    expect(mapCrmProspect(rawRow(row)).loss_reason).toBeNull()
  })

  it("un motivo fuera del vocabulario cae a null, no al cajón de sastre", () => {
    const row = rawRow(crmProspect({ status: "perdido" }))
    row.loss_reason = "porque_si"
    expect(mapCrmProspect(row).loss_reason).toBeNull()
  })

  it("la columna ausente (migración sin aplicar) tampoco se inventa", () => {
    const row = rawRow(crmProspect({ status: "perdido" }))
    delete row.loss_reason
    expect(mapCrmProspect(row).loss_reason).toBeNull()
  })
})

describe("la limitación está declarada donde se lee", () => {
  it("crm-core.ts declara que el denominador es parcial y por qué", () => {
    expect(CORE_FLAT).toContain("El denominador de cualquier métrica por motivo es parcial")
    expect(CORE_FLAT).toContain("el hueco no crece")
    expect(CORE_FLAT).toContain("debe decir su cobertura")
  })

  it("la declaración nombra el contrato que la hace falsable", () => {
    expect(CORE_FLAT).toContain("crm-loss-reason.contract.test.ts")
  })
})
