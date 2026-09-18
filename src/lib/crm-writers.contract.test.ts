import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

/**
 * Contrato de las escrituras del CRM (Ronda 11).
 *
 * Contexto: la ronda 6 dejó cinco *escrituras* de servidor del CRM sin ninguna
 * interfaz que las llamara —`saveQuickReply`, `deleteQuickReply`,
 * `distributeCrmProspects`, `getAdminSellerLoads`, `cancelSequenceEnrollment`—
 * mientras su mitad lectora sí estaba cableada. Knip no lo veía porque el
 * archivo entero estaba suprimido (`ignoreIssues`, fila `CI13`), y la supresión
 * se justificaba a sí misma: "el refactor aún no aterriza".
 *
 * Una supresión no impide que vuelva a pasar. Este contrato vigila las tres
 * formas concretas de repetirlo:
 *
 *  1. **Una escritura nueva sin consumidor.** Cada nombre de la lista de abajo
 *     tiene que aparecer referenciado en algún archivo de producción que no sea
 *     `actions.ts` ni un test. Añadir una escritura y olvidar la interfaz falla
 *     aquí, no en producción seis semanas después.
 *  2. **Una supresión que reaparezca.** `src/app/admin/actions.ts` no puede
 *     volver a la allowlist de knip: la entrada se retiró cuando dejó de ser
 *     cierta, y reintroducirla es reintroducir el punto ciego.
 *  3. **Un tipo huérfano.** `LeadTimelineSource` se midió muerto en el árbol y
 *     en `HEAD`; la unión equivalente vive en `crm-conversation.ts`. Se borró en
 *     vez de suprimirse, y este test impide que vuelva por copia.
 *
 * Lo que NO prohíbe: escrituras internas del CRM (motor de secuencias, webhook,
 * panel del vendedor) que no nacen de una acción de admin. La lista es de las
 * cinco que sí nacen de `actions.ts`, no de toda escritura de la tabla.
 */

const REPO = process.cwd()
const SRC_DIR = join(REPO, "src")
const ADMIN_ACTIONS = "src/app/admin/actions.ts"

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

/** Los tests se excluyen: aquí son fixtures, no consumidores. */
const PRODUCTION_FILES = walk(SRC_DIR)
  .filter((absolute) => !/\.test\.tsx?$/.test(absolute))
  .map(repoPath)
  .sort()

function read(path: string): string {
  return readFileSync(join(REPO, path), "utf8")
}

/**
 * Las cinco escrituras que la ronda 6 dejó huérfanas, con el consumidor que les
 * puso interfaz en la ronda 11. Si un consumidor desaparece, se borra la entrada
 * junto con la escritura; no se deja el nombre suelto.
 */
const CRM_WRITERS: { name: string; consumer: string }[] = [
  { name: "saveQuickReply", consumer: "src/app/admin/components/LeadQuickReplies.tsx" },
  { name: "deleteQuickReply", consumer: "src/app/admin/components/LeadQuickReplies.tsx" },
  { name: "distributeCrmProspects", consumer: "src/app/admin/components/LeadDistribution.tsx" },
  { name: "getAdminSellerLoads", consumer: "src/app/admin/components/LeadDistribution.tsx" },
  { name: "cancelSequenceEnrollment", consumer: "src/app/admin/components/LeadSequences.tsx" },
]

/**
 * Acciones de admin que dejan rastro en `log_admin_action`. Es un ratchet, no
 * un inventario: cada entrada es una escritura que ya se revisó y se decidió
 * conscientemente. Una acción nueva sin UI no se cuela por omisión, porque este
 * test exige editar la lista y justificarla.
 */
const LOGGED_ADMIN_ACTIONS = [
  "crm_activity_delete",
  "crm_activity_update",
  "crm_prospect_activity",
  "crm_prospect_assign",
  "crm_prospect_bulk_assign",
  "crm_prospect_close",
  "crm_prospect_create",
  "crm_prospect_follow_up",
  "crm_prospect_import",
  "crm_prospect_message",
  "crm_prospect_notes",
  "crm_prospect_status",
  "crm_prospect_tags",
  "crm_prospect_update",
  "crm_quick_reply_delete",
  "crm_quick_reply_save",
  "crm_sequence_cancel",
  "crm_sequence_enroll",
  "crm_sequence_save",
  "crm_sequence_toggle",
  "crm_task_complete",
  "crm_task_create",
  "crm_task_delete",
  "crm_task_reopen",
  "lead_convert",
  "lead_discard",
  "lead_restore",
].sort()

const ADMIN_SOURCE = read(ADMIN_ACTIONS)

describe("contrato de las escrituras del CRM", () => {
  it("el archivo de acciones existe (canario)", () => {
    // Si la ruta cambia, las demás aserciones pasarían en vacío.
    expect(ADMIN_SOURCE.length).toBeGreaterThan(1000)
  })

  it("las cinco escrituras siguen existiendo en `actions.ts`", () => {
    const missing = CRM_WRITERS.filter(
      ({ name }) => !new RegExp(`export async function ${name}\\b`).test(ADMIN_SOURCE)
    ).map(({ name }) => name)

    expect(
      missing,
      `Estas escrituras ya no existen en ${ADMIN_ACTIONS}: ${missing.join(", ")}. ` +
        `Borra su entrada de CRM_WRITERS junto con el código.`
    ).toEqual([])
  })

  it("cada escritura tiene un consumidor de producción", () => {
    const orphans = CRM_WRITERS.filter(({ name }) => {
      const pattern = new RegExp(`\\b${name}\\b`)
      return !PRODUCTION_FILES.some(
        (path) => path !== ADMIN_ACTIONS && pattern.test(read(path))
      )
    }).map(({ name }) => name)

    expect(
      orphans,
      `Estas escrituras no las llama nadie fuera de ${ADMIN_ACTIONS}: ` +
        `${orphans.join(", ")}. Una acción de servidor sin interfaz es una ` +
        `función sin terminar; ponle UI o bórrala.`
    ).toEqual([])
  })

  it("cada escritura declara su consumidor en el test", () => {
    const wrong = CRM_WRITERS.filter(
      ({ name, consumer }) =>
        !PRODUCTION_FILES.includes(consumer) || !new RegExp(`\\b${name}\\b`).test(read(consumer))
    ).map(({ name, consumer }) => `${name} → ${consumer}`)

    expect(
      wrong,
      `El consumidor declarado no existe o no referencia la escritura: ${wrong.join("; ")}. ` +
        `El test debe nombrar el archivo real, no un consumidor cualquiera.`
    ).toEqual([])
  })

  it("`src/app/admin/actions.ts` no vuelve a la allowlist de knip", () => {
    // La entrada se retiró en la ronda 11 tras medir `npm run knip` sin ella:
    // cero hallazgos. Reintroducirla apaga la auditoría entera en el archivo con
    // más escrituras del CRM, que es exactamente cómo se perdió la mitad escrita.
    const pkg = JSON.parse(read("package.json")) as {
      knip?: { ignoreIssues?: Record<string, string[]> }
    }

    expect(
      pkg.knip?.ignoreIssues?.[ADMIN_ACTIONS],
      `${ADMIN_ACTIONS} volvió a ignoreIssues. Knip ya no lo reporta: la entrada ` +
        `suprime hallazgos futuros en el archivo más grande del panel.`
    ).toBeUndefined()
  })

  it("`LeadTimelineSource` no existe en el árbol", () => {
    const holders = PRODUCTION_FILES.filter((path) =>
      /\bLeadTimelineSource\b/.test(read(path))
    )

    expect(
      holders,
      `El tipo huérfano volvió a aparecer en: ${holders.join(", ")}. La unión del ` +
        `origen de un evento vive en línea en crm-conversation.ts; no se duplica.`
    ).toEqual([])
  })

  it("el conjunto de acciones auditadas está congelado (ratchet)", () => {
    const found = [
      ...new Set(
        [
          ...ADMIN_SOURCE.matchAll(
            /logAdminAction\(\s*[A-Za-z_.]+\s*,\s*\{[\s\S]{0,300}?action:\s*"([a-z_]+)"/g
          ),
        ].map((match) => match[1])
      ),
    ].sort()

    expect(
      found,
      "Cambió el conjunto de acciones que escriben en log_admin_action. Si la acción " +
        "es nueva, revisa que tenga consumidor y añádela a LOGGED_ADMIN_ACTIONS."
    ).toEqual(LOGGED_ADMIN_ACTIONS)
  })
})
