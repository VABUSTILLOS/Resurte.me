import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Contrato de flotantes inferiores contra el banner de cookies.
 *
 * Contexto: en móvil el banner de consentimiento vive en el carril inferior
 * (`bottom-[var(--floating-bottom-offset)]`, `z-[60]`) y su franja de botones
 * —"Solo necesarias" / "Aceptar todas"— ocupa la parte baja de esa caja. Un
 * flotante anclado al mismo carril con un z-index **estrictamente mayor** se
 * pinta encima y **intercepta el tap**: el usuario no puede consentir.
 *
 * Eso es exactamente lo que ocurría con el pill de la guía del panel
 * (`guide-toggle-button.tsx`, `z-[85]`): el repo lo tenía documentado como un
 * fallo "ajeno al plan" en `docs/PLAN-MEJORAS.md` y nadie podía pulsar
 * "Aceptar todas" en el panel desde el móvil. Se arregló ocultando el pill
 * mientras la clase `body.cookie-consent-visible` está puesta.
 *
 * Un z-index **igual** (empate) no intercepta: el banner se renderiza al final
 * de `src/app/layout.tsx`, después de `<main>`, y en un empate gana el que se
 * pinta después. Por eso el umbral de este contrato es `z >= 60` y no `z > 60`:
 * lo que importa es que **cada** flotante de ese carril tenga una decisión
 * explícita, no que todos se oculten.
 *
 * Regla que impone:
 *   - Todo elemento `fixed` anclado al carril inferior con `z >= 60` debe estar
 *     en el registro `BOTTOM_FLOATS`. Un flotante nuevo con z alto rompe este
 *     test hasta que se declare qué pasa con él durante el consentimiento.
 *   - Si su decisión es "oculto", su clase semántica tiene que aparecer de
 *     verdad en una regla `body.cookie-consent-visible .<clase>` de
 *     `globals.css` (no basta con declararlo aquí).
 *   - Si su decisión es "exento", hay que justificarla por escrito.
 *
 * Límite conocido del barrido: es por línea, así que solo ve flotantes que
 * declaran el `bottom` y el `z` en el mismo `className` (la convención del
 * repo). Un flotante que ponga el `bottom` en un `style={{}}` y el `z` en otra
 * línea no se detecta — por eso el umbral es alto y el registro se revisa a
 * mano en cada ronda.
 */

const REPO = process.cwd()
const SRC_DIR = join(REPO, "src")
const CSS_PATH = join(SRC_DIR, "app", "globals.css")

/** El banner de consentimiento es `z-[60]`; desde ahí hay riesgo de interceptar. */
const CONSENT_Z = 60

const Z_RE = /\bz-\[(\d+)\]|\bz-(\d{1,3})\b/
const BOTTOM_ANCHOR_RE = /bottom-\[(var|calc)\(/

type Decision =
  | { kind: "oculto"; className: string }
  | { kind: "exento"; reason: string }

type FloatEntry = {
  file: string
  /** z-index declarados en ese archivo para flotantes del carril. */
  z: number[]
  decision: Decision
}

/**
 * Registro de flotantes inferiores con `z >= 60`. Añadir una entrada aquí es
 * barato; lo que no se puede es dejar un flotante sin decidir.
 */
const BOTTOM_FLOATS: FloatEntry[] = [
  {
    file: "src/components/ui/cookie-consent.tsx",
    z: [60],
    decision: {
      kind: "exento",
      reason:
        "Es el propio banner: no puede ocultarse a sí mismo. Es la referencia contra la que se mide el resto.",
    },
  },
  {
    file: "src/components/panel/guide/guide-toggle-button.tsx",
    z: [85],
    decision: { kind: "oculto", className: "guide-toggle-floating" },
  },
  {
    file: "src/components/dashboard/dashboard-sidebar.tsx",
    z: [60, 60],
    decision: {
      kind: "exento",
      reason:
        "Empata en z-[60] con el banner y usa el mismo offset, pero el banner se renderiza después en layout.tsx, así que gana el empate por orden de DOM y no intercepta el tap.",
    },
  },
  {
    file: "src/components/toast.tsx",
    z: [100],
    decision: {
      kind: "exento",
      reason:
        "Aviso transitorio (aria-live, se autodestruye en segundos) y disparado por una acción del usuario. En móvil se apila 1rem sobre el carril, así que puede solaparse con la franja de botones del banner mientras dura; en sm+ el aviso va a la izquierda y el banner a la derecha, sin solape. Limitación aceptada: es efímera y el banner sobrevive a ella. Ocultarlo perdería el feedback; subirlo exigiría publicar la altura real del banner como variable CSS.",
    },
  },
]

function listTsx(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...listTsx(path))
    else if (path.endsWith(".tsx")) out.push(path)
  }
  return out
}

const TSX_FILES = listTsx(SRC_DIR)

/** Flotantes del carril inferior con z alto, indexados por ruta relativa. */
function scanFloats(): Map<string, number[]> {
  const found = new Map<string, number[]>()
  for (const absolute of TSX_FILES) {
    const relative = absolute.slice(REPO.length + 1)
    for (const line of readFileSync(absolute, "utf8").split("\n")) {
      if (!/\bfixed\b/.test(line)) continue
      if (!BOTTOM_ANCHOR_RE.test(line)) continue
      const match = line.match(Z_RE)
      if (!match) continue
      const z = Number(match[1] ?? match[2])
      if (z < CONSENT_Z) continue
      found.set(relative, [...(found.get(relative) ?? []), z])
    }
  }
  return found
}

const FOUND = scanFloats()
const CSS = readFileSync(CSS_PATH, "utf8")

/** Clases ocultadas por el banner: `body.cookie-consent-visible .<clase>`. */
function consentHiddenClasses(): Set<string> {
  const classes = new Set<string>()
  for (const match of CSS.matchAll(/body\.cookie-consent-visible\s+\.([\w-]+)/g)) {
    classes.add(match[1] as string)
  }
  return classes
}

const HIDDEN = consentHiddenClasses()

describe("contrato de flotantes inferiores vs banner de cookies", () => {
  it("barre los archivos tsx de src", () => {
    // Canario: si el barrido deja de encontrar archivos, el resto de las
    // aserciones pasaría en vacío y el contrato sería decorativo.
    expect(TSX_FILES.length).toBeGreaterThanOrEqual(300)
    expect(FOUND.size).toBeGreaterThanOrEqual(4)
  })

  it("todo flotante del carril con z >= 60 está declarado en el registro", () => {
    const declared = new Set(BOTTOM_FLOATS.map((f) => f.file))
    const undeclared = [...FOUND.keys()].filter((file) => !declared.has(file)).sort()
    const stale = BOTTOM_FLOATS.filter((f) => !FOUND.has(f.file)).map((f) => f.file)

    expect(
      undeclared,
      `Estos flotantes están anclados al carril inferior con z >= ${CONSENT_Z} pero no están ` +
        `en BOTTOM_FLOATS. Si su z es mayor que el del banner (${CONSENT_Z}) se pinta encima y ` +
        `puede interceptar el tap de "Aceptar todas". Decide: dale una clase semántica y ` +
        `añádela a la lista de \`body.cookie-consent-visible\` de globals.css (decisión "oculto"), ` +
        `o declara la entrada con su justificación (decisión "exento").`
    ).toEqual([])

    expect(
      stale,
      `Estas entradas de BOTTOM_FLOATS ya no corresponden a ningún flotante real: bórralas ` +
        `para que el registro siga siendo la lista de lo que existe.`
    ).toEqual([])
  })

  it("los flotantes declarados como ocultos lo están de verdad en globals.css", () => {
    const missing: string[] = []

    for (const entry of BOTTOM_FLOATS) {
      if (entry.decision.kind !== "oculto") continue
      if (!HIDDEN.has(entry.decision.className)) {
        missing.push(`${entry.file} → .${entry.decision.className}`)
      }
    }

    expect(
      missing,
      `Estos flotantes están declarados como ocultos durante el consentimiento pero su clase ` +
        `no aparece en ninguna regla \`body.cookie-consent-visible .<clase>\` de globals.css, ` +
        `así que el banner sigue sin poder recibir el tap.`
    ).toEqual([])
  })

  it("cada flotante exento justifica su exención", () => {
    const weak = BOTTOM_FLOATS.filter(
      (entry) => entry.decision.kind === "exento" && entry.decision.reason.trim().length < 60
    ).map((entry) => entry.file)

    expect(
      weak,
      `Estos flotantes están exentos de ocultarse durante el consentimiento con una razón ` +
        `demasiado corta para explicar por qué no interceptan el tap. Escribe el porqué.`
    ).toEqual([])
  })
})
