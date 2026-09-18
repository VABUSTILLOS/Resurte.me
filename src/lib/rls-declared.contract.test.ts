import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Contrato de las tablas con RLS encendida y **cero políticas**.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * El agujero que este contrato hace visible
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `rls-coverage.contract.test.ts` ya garantiza lo importante: toda tabla de
 * `public` nace con RLS y ninguna política de escritura es incondicional para un
 * rol de cliente. Pero ese contrato tiene un punto ciego por diseño: **una tabla
 * con RLS encendida y ninguna política es deny-by-default**, y deny-by-default
 * pasa el contrato con nota. Y es correcto que pase.
 *
 * Lo que no era correcto es que **nadie hubiera escrito por qué**. La auditoría
 * de estatus (CRM3) encontró `crm_tasks` en esa situación: RLS encendida, cero
 * políticas, acceso real sólo por `createServiceClient()` desde
 * `src/app/admin/actions.ts`. Funcionaba, pero la única forma de saberlo era
 * reconstruirlo a mano leyendo seis archivos. La superficie se leía igual de
 * bien con el permiso bien puesto que con el permiso mal puesto.
 *
 * Al medir el resto del esquema aparecieron **24 tablas** en ese estado, y sólo
 * `crm_tasks` lo declaraba (`COMMENT ON TABLE` en `00185`). Las otras 23 no
 * decían nada: nueve no tenían ni un `COMMENT ON TABLE`, y catorce tenían un
 * comentario que describía la tabla pero no quién puede leerla.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Qué se congela, y por qué en un registro y no en 24 comentarios
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La decisión de producto fue **no añadir políticas** —el acceso es de servicio
 * y añadir políticas de cliente sería inventar una superficie que nadie pidió—
 * y en su lugar **declarar el modelo de acceso**. La declaración vive aquí, en
 * un registro explícito, y no en 24 `COMMENT ON TABLE` nuevos, por una razón
 * concreta: un comentario en la base de datos **no se puede verificar**, y este
 * contrato sí. Cada entrada lleva el archivo que demuestra el acceso, así que
 * una entrada que deja de ser cierta es una entrada que se puede comprobar.
 *
 * Lo que el registro obliga: **añadir una tabla con RLS y sin políticas rompe
 * este test** hasta que alguien escriba, en una línea, quién la lee. Eso es todo
 * lo que se pretendía: que la decisión sea explícita en vez de invisible.
 *
 * Cómo romperlo:
 *
 *   1. Añadir en una migración una tabla con `ENABLE ROW LEVEL SECURITY` y
 *      ninguna `CREATE POLICY`, sin declararla en `MODELO_DE_ACCESO`.
 *   2. Quitar de `MODELO_DE_ACCESO` una tabla que sigue en ese estado (el
 *      registro dejaría de cubrir el perímetro).
 *   3. Dejar en `MODELO_DE_ACCESO` una tabla que ya tiene políticas, o que ya no
 *      tiene RLS: entrada muerta, el registro mentiría al revés.
 *   4. Escribir una entrada sin motivo.
 *
 * Lo que este contrato **no** hace: juzgar si el modelo de acceso declarado es
 * el correcto. Comprueba que está escrito, que cubre el perímetro exacto y que
 * nombra un archivo de evidencia. Que sea verdad es trabajo de la revisión.
 */

const REPO = process.cwd()
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations")

const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()

/** Quita comentarios: las tres migraciones históricas citan la columna borrada. */
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")
}

/** `ALTER TABLE [IF EXISTS] [ONLY] [public.]"x" ENABLE ROW LEVEL SECURITY` → tabla. */
function tablasConRls(sql: string): string[] {
  const re =
    /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\s*\.\s*)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi
  const out: string[] = []
  for (const m of sql.matchAll(re)) out.push((m[1] ?? m[2] ?? "").toLowerCase())
  return out
}

/** `CREATE POLICY "x" ON [public.]"t"` → tabla. */
function tablasConPolitica(sql: string): string[] {
  const re =
    /\bCREATE\s+POLICY\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ON\s+(?:public\s*\.\s*)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))/gi
  const out: string[] = []
  for (const m of sql.matchAll(re)) out.push((m[3] ?? m[4] ?? "").toLowerCase())
  return out
}

type Medicion = { conRls: Set<string>; conPolitica: Set<string>; sinPoliticas: string[] }

function medir(fuentes: string[]): Medicion {
  const conRls = new Set<string>()
  const conPolitica = new Set<string>()
  for (const sql of fuentes) {
    for (const t of tablasConRls(sql)) conRls.add(t)
    for (const t of tablasConPolitica(sql)) conPolitica.add(t)
  }
  const sinPoliticas = [...conRls].filter((t) => !conPolitica.has(t)).sort()
  return { conRls, conPolitica, sinPoliticas }
}

const FUENTES = MIGRATION_FILES.map((f) => sinComentarios(readFileSync(join(MIGRATIONS_DIR, f), "utf8")))
const MEDICION = medir(FUENTES)

/**
 * Las 24 tablas con RLS encendida y ninguna política, con el archivo que
 * demuestra cómo se accede a cada una. Todas se leen y escriben con
 * `createServiceClient()`; `rate_limits` lo hace a través de la RPC
 * `consume_rate_limit`, cuyo `EXECUTE` quedó restringido a `service_role` en
 * `00165` y que se invoca desde el mismo cliente de servicio.
 */
const MODELO_DE_ACCESO: Record<string, string> = {
  bump_affinity: "createServiceClient() desde src/app/api/admin/bump-affinity/route.ts",
  bump_rules: "createServiceClient() desde src/app/api/admin/bump-rules/route.ts",
  commission_adjustments:
    "createServiceClient() desde src/app/api/admin/comisiones/[id]/adjustments/route.ts",
  commission_periods: "createServiceClient() desde src/app/api/admin/comisiones/route.ts",
  crm_quick_replies: "createServiceClient() desde src/app/admin/actions.ts",
  crm_sequence_enrollments: "createServiceClient() desde src/app/admin/actions.ts",
  crm_sequence_steps: "createServiceClient() desde src/app/admin/actions.ts",
  crm_sequences: "createServiceClient() desde src/app/admin/actions.ts",
  crm_tasks:
    "createServiceClient() desde src/app/admin/actions.ts; declarada en COMMENT ON TABLE de 00185",
  delivery_drivers: "createServiceClient() desde src/app/api/admin/drivers/route.ts",
  email_logs: "createServiceClient() desde src/app/api/admin/email-logs/route.ts",
  foodos_payouts: "createServiceClient() desde src/app/api/admin/foodos/payouts/route.ts",
  geo_panel_checks: "createServiceClient() desde src/app/admin/seo-ia/actions.ts",
  leads: "createServiceClient() desde src/app/admin/actions.ts",
  order_upsells: "createServiceClient() desde src/app/api/admin/funnel/route.ts",
  product_suppliers: "createServiceClient() desde src/app/api/admin/suppliers/route.ts",
  rate_limits: "RPC consume_rate_limit (EXECUTE sólo a service_role desde 00165), con el cliente de servicio",
  suppliers: "createServiceClient() desde src/app/api/admin/suppliers/route.ts",
  whatsapp_automation_sends: "createServiceClient() desde src/app/admin/actions.ts",
  whatsapp_catalog_items: "createServiceClient() desde src/app/admin/actions.ts",
  whatsapp_catalogs: "createServiceClient() desde src/app/admin/actions.ts",
  whatsapp_sync_items: "createServiceClient() desde src/app/admin/actions.ts",
  whatsapp_sync_queue: "createServiceClient() desde src/app/admin/actions.ts",
  whatsapp_sync_runs: "createServiceClient() desde src/app/admin/actions.ts",
}

const DECLARADAS = Object.keys(MODELO_DE_ACCESO).sort()

describe("detectores — se prueban antes de mirar el perímetro", () => {
  it("reconoce el ENABLE ROW LEVEL SECURITY con y sin `public.`", () => {
    expect(tablasConRls("ALTER TABLE public.x ENABLE ROW LEVEL SECURITY;")).toEqual(["x"])
    expect(tablasConRls('ALTER TABLE "X" ENABLE ROW LEVEL SECURITY;')).toEqual(["x"])
    expect(tablasConRls("ALTER TABLE ONLY public.x ENABLE ROW LEVEL SECURITY;")).toEqual(["x"])
  })

  it("no confunde DISABLE con ENABLE", () => {
    expect(tablasConRls("ALTER TABLE public.x DISABLE ROW LEVEL SECURITY;")).toEqual([])
  })

  it("reconoce la tabla de una CREATE POLICY, no la del DROP", () => {
    expect(tablasConPolitica('CREATE POLICY "p" ON public.x FOR SELECT TO authenticated USING (true);')).toEqual([
      "x",
    ])
    expect(tablasConPolitica('DROP POLICY IF EXISTS "p" ON public.x;')).toEqual([])
  })

  it("una tabla con RLS y sin políticas entra; una con política no", () => {
    const m = medir([
      "ALTER TABLE public.a ENABLE ROW LEVEL SECURITY;",
      "ALTER TABLE public.b ENABLE ROW LEVEL SECURITY;",
      'CREATE POLICY "p" ON public.b FOR SELECT TO authenticated USING (true);',
    ])
    expect(m.sinPoliticas).toEqual(["a"])
  })

  it("agrega la política aunque viva en otra migración que el ENABLE", () => {
    const m = medir([
      "ALTER TABLE public.a ENABLE ROW LEVEL SECURITY;",
      'CREATE POLICY "p" ON public.a FOR SELECT TO service_role USING (true);',
    ])
    expect(m.sinPoliticas).toEqual([])
  })
})

describe("perímetro — RLS sin políticas", () => {
  it("cada tabla en ese estado está declarada", () => {
    const noDeclaradas = MEDICION.sinPoliticas.filter((t) => !(t in MODELO_DE_ACCESO))
    expect(noDeclaradas).toEqual([])
  })

  it("el registro no tiene entradas muertas", () => {
    // Una tabla declarada que ya tiene políticas, o que ya no enciende RLS, hace
    // que el registro mienta en el sentido contrario: describiría un riesgo que
    // ya no existe y taparía el que sí.
    const muertas = DECLARADAS.filter((t) => !MEDICION.sinPoliticas.includes(t))
    expect(muertas).toEqual([])
  })

  it("el registro cubre exactamente el perímetro medido", () => {
    expect(DECLARADAS).toEqual(MEDICION.sinPoliticas)
    expect(DECLARADAS).toHaveLength(24)
  })

  it("ninguna entrada está vacía y todas nombran dónde vive el acceso", () => {
    const flojas = Object.entries(MODELO_DE_ACCESO)
      .filter(([, motivo]) => motivo.trim().length < 30)
      .map(([tabla]) => tabla)
    expect(flojas).toEqual([])

    const sinEvidencia = Object.entries(MODELO_DE_ACCESO)
      .filter(([, motivo]) => !/src\/|RPC/.test(motivo))
      .map(([tabla]) => tabla)
    expect(sinEvidencia).toEqual([])
  })

  it("crm_tasks sigue declarada y sigue sin políticas", () => {
    // La fila que originó el contrato (CRM3 de la auditoría).
    expect(MODELO_DE_ACCESO.crm_tasks).toBeDefined()
    expect(MEDICION.sinPoliticas).toContain("crm_tasks")
    expect(MEDICION.conPolitica.has("crm_tasks")).toBe(false)
  })

  it("las tablas del perímetro sí tienen RLS encendida", () => {
    // Complemento del contrato de cobertura: aquí no hay ninguna tabla que se
    // cuele por tener el registro pero no el `ENABLE`.
    const sinRls = DECLARADAS.filter((t) => !MEDICION.conRls.has(t))
    expect(sinRls).toEqual([])
  })
})
