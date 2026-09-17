import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

/**
 * Contrato del lector de `crm_prospects` (Ronda 7).
 *
 * Contexto: la misma tabla se leía desde tres lugares con tres definiciones
 * distintas de lo que es un prospecto. El síntoma visible fue la búsqueda —el
 * admin filtraba en memoria e ignoraba acentos, el vendedor usaba `ilike` en
 * PostgREST y sí los distinguía, así que "cafeteria" encontraba "Cafetería" en
 * un panel y no en el otro—, pero el problema de fondo era otro: nada impedía
 * que apareciera un cuarto lector.
 *
 * Un test que compruebe "la búsqueda coincide" no lo impide. Este contrato
 * vigila las dos formas concretas de reintroducir el cuarto lector:
 *
 *  1. **Un archivo nuevo que consulte `crm_prospects`.** La lista de módulos
 *     autorizados es explícita: si aparece uno, este test falla y obliga a
 *     justificarlo (o a reutilizar el lector). Es la misma disciplina de
 *     `local-date.contract.test.ts`: una lista permitida, no una convención.
 *  2. **Una segunda escalera de columnas.** `CRM_PROSPECT_COLUMNS`,
 *     `CRM_PROSPECT_COLUMNS_WITHOUT_TAGS` y `CRM_PROSPECT_COLUMN_SETS` degradan
 *     una migración a la vez (00140 → 00139 → 00059 → 00052). Duplicar esa
 *     escalera es duplicar la política de compatibilidad, y ahí es donde se
 *     cuela una consulta que revienta en un entorno sin migrar.
 *
 * Lo que NO prohíbe: leer por `id`, por `referral_code`, por `user_id` o
 * contar con `head: true`. Una ficha, un vínculo o un KPI agregan y acotan; el
 * lector compartido pagina y filtra carteras completas. Son cosas distintas y
 * meterlas todas por `readCrmProspects` sería peor que dejarlas.
 */

const REPO = process.cwd()
const SRC_DIR = join(REPO, "src")

/** `.from("crm_prospects")` con cualquier estilo de comillas. */
const FROM_PROSPECTS_RE = /\.from\(\s*["'`]crm_prospects["'`]\s*\)/

/** Las constantes que arman la escalera de columnas. */
const LADDER_RE = /\bCRM_PROSPECT_COLUMNS\b|\bCRM_PROSPECT_COLUMNS_WITHOUT_TAGS\b|\bCRM_PROSPECT_COLUMN_SETS\b/

/** Rutas relativas al repo, siempre con `/`, para que la lista sea legible. */
function repoPath(absolute: string): string {
  return relative(REPO, absolute).split(sep).join("/")
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry)
    if (statSync(absolute).isDirectory()) {
      walk(absolute, out)
    } else if (/\.tsx?$/.test(entry)) {
      out.push(absolute)
    }
  }
  return out
}

/** Los tests se excluyen: aquí son fixtures, no producción. */
const PRODUCTION_FILES = walk(SRC_DIR)
  .filter((absolute) => !/\.test\.tsx?$/.test(absolute))
  .map(repoPath)
  .sort()

function read(path: string): string {
  return readFileSync(join(REPO, path), "utf8")
}

function filesMatching(pattern: RegExp): string[] {
  return PRODUCTION_FILES.filter((path) => pattern.test(read(path)))
}

/**
 * Módulos que consultan `crm_prospects`, con el motivo por el que no pasan por
 * `readCrmProspects`. Cada entrada es deuda consciente: si un módulo deja de
 * consultar la tabla, se borra la entrada.
 */
const PROSPECT_READERS_ALLOWED: { path: string; reason: string }[] = [
  {
    path: "src/lib/crm-prospects.ts",
    reason: "El lector único. Es la implementación, no una excepción.",
  },
  {
    path: "src/lib/crm-conversation.ts",
    reason:
      "Lee una sola fila por `id` para la ficha y la conversación. No pagina ni filtra carteras.",
  },
  {
    path: "src/app/admin/actions.ts",
    reason:
      "Agregados de la bandeja y el embudo (`head: true`), conteos de SLA, lecturas por `id` y `in(id)`, y el vínculo lead→prospecto. Ninguna lista la cartera completa.",
  },
  {
    path: "src/lib/agente/actions.ts",
    reason:
      "Comprobación de propiedad por `id`, KPI agregados y el conteo del briefing. El agente no lista prospectos: consume `readCrmProspects` para la cola diaria.",
  },
  {
    path: "src/lib/crm-sequences-engine.ts",
    reason: "Carga por `in(id, ids)` los destinatarios de una secuencia ya elegidos.",
  },
  {
    path: "src/app/api/workflows/trigger/route.ts",
    reason:
      "Webhook público de registro: resuelve el prospecto por su `referral_code` único. No tiene ni debe tener alcance de vendedor.",
  },
  {
    path: "src/lib/comercializacion/actions/prospectos.ts",
    reason: "CRUD del vendedor: alta, edición y borrado por `id`, más un escaneo de duplicados.",
  },
  {
    path: "src/lib/comercializacion/actions/actividades.ts",
    reason: "Comprobación de propiedad por `id` antes de tocar la bitácora de actividades.",
  },
  {
    path: "src/lib/comercializacion/actions/etiquetas.ts",
    reason: "Etiquetas: escritura por `id` y lectura por `in(id, ids)`.",
  },
  {
    path: "src/lib/comercializacion/actions/vinculos.ts",
    reason: "Vínculo prospecto→cuenta: lectura por `id` y por `user_id`.",
  },
  {
    path: "src/lib/comercializacion/actions/pedidos.ts",
    reason: "Pedidos: lectura por `id`, cartera vinculada y conteo de estados.",
  },
  {
    path: "src/lib/comercializacion/actions/dashboard.ts",
    reason:
      "Agregados del panel del vendedor (seguimientos de hoy, clientes activos, carga por vendedor).",
  },
  {
    path: "src/lib/comercializacion/actions/commissions-admin.ts",
    reason: "Reparto de comisiones: lee solo `seller_id` y `user_id` de los prospectos vinculados.",
  },
]

/**
 * Módulos autorizados a armar la escalera de columnas.
 *
 * `crm-core.ts` la define; los dos consumidores son el lector de listas y el de
 * una sola fila. Cualquier tercero está duplicando la política de
 * compatibilidad de migraciones.
 */
const LADDER_BUILDERS_ALLOWED = ["src/lib/crm-core.ts", "src/lib/crm-prospects.ts", "src/lib/crm-conversation.ts"]

describe("contrato del lector de crm_prospects", () => {
  it("encuentra los archivos de src (canario)", () => {
    // Si el recorrido se rompe, el resto de aserciones pasaría en vacío.
    expect(PRODUCTION_FILES.length).toBeGreaterThanOrEqual(500)
    expect(PRODUCTION_FILES).toContain("src/lib/crm-prospects.ts")
  })

  it("los módulos que consultan crm_prospects son exactamente los autorizados", () => {
    const actual = filesMatching(FROM_PROSPECTS_RE)
    const allowed = PROSPECT_READERS_ALLOWED.map((entry) => entry.path).sort()

    const added = actual.filter((path) => !allowed.includes(path))
    const removed = allowed.filter((path) => !actual.includes(path))

    expect(
      added,
      "Estos módulos consultan `crm_prospects` y no están en la lista permitida. Si de " +
        "verdad necesitan la tabla, añádelos con su motivo; si solo quieren una lista de " +
        "prospectos, usa `readCrmProspects` de `@/lib/crm-prospects`.",
    ).toEqual([])

    expect(
      removed,
      "Estos módulos ya no consultan `crm_prospects`. Borra su entrada de " +
        "`PROSPECT_READERS_ALLOWED`: una lista permitida que crece sola deja de ser una guarda.",
    ).toEqual([])
  })

  it("la escalera de columnas se arma en un solo lugar", () => {
    const actual = filesMatching(LADDER_RE).sort()

    expect(
      actual,
      "Hay una segunda escalera de columnas de `crm_prospects`. Duplicarla es duplicar la " +
        "política de degradación de migraciones (00140 → 00139 → 00059 → 00052): usa el " +
        "lector de `@/lib/crm-prospects`.",
    ).toEqual([...LADDER_BUILDERS_ALLOWED].sort())
  })

  it("el panel de conversación no trae acciones por defecto", () => {
    const source = read("src/components/crm/ConversationPanel.tsx")

    // La prop es obligatoria y sin valor por defecto: lo que no se inyecta no se
    // renderiza. Un default apuntando a las acciones del admin dejaría el
    // compositor (que exige `requireAdmin()`) a un clic del vendedor, y además
    // arrastraría `@/app/admin/actions` al bundle del vendedor.
    expect(source).toMatch(/actions:\s*ConversationPanelActions/)

    const adminImports = source
      .split("\n")
      .filter((line) => line.includes('from "@/app/admin/actions"'))
      .map((line) => line.trim())

    expect(adminImports.length).toBeGreaterThan(0)
    for (const line of adminImports) {
      expect(line, "De `@/app/admin/actions` solo se pueden importar tipos.").toMatch(/^} from/)
    }
    // El `import type {` de apertura tiene que existir para que el cierre sea suyo.
    expect(source).toMatch(/import type \{[\s\S]*?\} from "@\/app\/admin\/actions"/)
  })

  it("la guarda detecta el caso que la motivó", () => {
    // Autoprueba: sin esto, un regex mal escrito pasaría por bueno.
    const newReader = 'const { data } = await supabase.from("crm_prospects").select("id, name")'
    expect(FROM_PROSPECTS_RE.test(newReader)).toBe(true)
    expect(FROM_PROSPECTS_RE.test('await supabase.from("crm_activities").select("id")')).toBe(false)

    const secondLadder = 'import { CRM_PROSPECT_COLUMNS_WITHOUT_TAGS } from "@/lib/crm-core"'
    expect(LADDER_RE.test(secondLadder)).toBe(true)
    expect(LADDER_RE.test('import { mapCrmProspect } from "@/lib/crm-core"')).toBe(false)
  })
})
