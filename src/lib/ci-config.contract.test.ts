import { describe, expect, it } from "vitest"
import { readFileSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Contrato de la configuración de CI: `.github/workflows/ci.yml` y el hook de
 * pre-push.
 *
 * Contexto: la ronda 8 midió el pipeline por primera vez y encontró que el rojo
 * no significaba "esto se rompió". El job `verify` fallaba en 38 de 40 corridas
 * (10 `Knip`, 8 `Lint`, 2 `Unit tests`, 2 `Typecheck` — trabajo en vuelo de un
 * checkout compartido por varias sesiones) y el paso `E2E smoke tests` moría con
 * `##[error]The operation was canceled.` a los ~91 s en 13 de 40 corridas: no era
 * un timeout (el job declara 25 min), era el solape de corridas sin `concurrency`
 * — 33 de 99 corridas arrancaban a menos de 180 s de la anterior, mientras `e2e`
 * tarda 155-244 s. Y como `Knip` y `Lint` iban **antes** de `Build`, toda corrida
 * roja dejaba el gate más caro sin ejecutar: `Build` salía `-` siempre.
 *
 * Este contrato fija las cinco decisiones que ordenaron ese pipeline, para que
 * ninguna se revierta por descuido:
 *
 *  1. **`concurrency` con `cancel-in-progress`.** Una corrida nueva cancela la
 *     anterior del mismo ref en vez de competir por el runner.
 *  2. **CI y local invocan los mismos comandos.** El workflow usa `npm run X`;
 *     el desarrollador usa `npm run X`. Medir con un flag distinto es medir otra
 *     cosa (invariante 11).
 *  3. **`Build` antes de `Knip`.** Un gate que nunca da señal no es un gate.
 *  4. **Todo `env:` del workflow está documentado** en `.env.local.example`.
 *  5. **El hook de pre-push avisa, no bloquea.** En un checkout compartido, un
 *     hook bloqueante deja a cualquiera preso de un archivo que dejó otra sesión.
 *
 * Límite conocido y aceptado: esto vigila la **forma** del workflow, no que las
 * corridas de verdad estén verdes. Eso lo dice la tasa de rojo en GitHub, que
 * ningún test local puede observar.
 */

const REPO = process.cwd()

type PackageJson = {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function read(relativePath: string): string {
  return readFileSync(join(REPO, relativePath), "utf8")
}

const PKG = JSON.parse(read("package.json")) as PackageJson
const SCRIPTS: Record<string, string> = PKG.scripts ?? {}
const CI = read(join(".github", "workflows", "ci.yml"))
const ENV_EXAMPLE = read(".env.local.example")
const HOOK_PATH = join(REPO, ".githooks", "pre-push")

/**
 * Scripts que el workflow invoca de verdad. Se miran solo las líneas `run:`
 * —los comentarios no se ejecutan—, y `npm test` cuenta como el script `test`
 * porque es su forma corta.
 */
function ciInvokedScripts(ci: string): string[] {
  const invoked = new Set<string>()

  for (const match of ci.matchAll(/^\s*run:\s*(.+?)\s*$/gm)) {
    const command = match[1] ?? ""
    const viaRun = /^npm run ([\w:-]+)$/.exec(command)
    if (viaRun?.[1]) {
      invoked.add(viaRun[1])
      continue
    }
    if (command === "npm test") invoked.add("test")
  }

  return [...invoked].sort()
}

/** Claves declaradas en los bloques `env:` del workflow (sangradas bajo `env:`). */
function ciEnvKeys(ci: string): string[] {
  const keys: string[] = []
  let envIndent = -1

  for (const line of ci.split("\n")) {
    const indent = line.length - line.trimStart().length

    if (/^\s*env:\s*$/.test(line)) {
      envIndent = indent
      continue
    }
    if (envIndent < 0 || line.trim() === "") continue
    if (indent <= envIndent) {
      envIndent = -1
      continue
    }

    const key = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line)?.[1]
    if (key) keys.push(key)
  }

  return keys
}

/** Posición de un paso dentro del workflow, o -1 si no existe. */
function stepIndex(name: string): number {
  return CI.indexOf(`- name: ${name}`)
}

describe("contrato de configuración de CI", () => {
  it("el workflow declara jobs y pasos con `run:` (canario)", () => {
    // Sin esto, las aserciones de abajo podrían pasar sobre un archivo vacío o
    // sobre uno cuyo formato cambió y ya no se parsea.
    expect(CI).toContain("jobs:")
    expect(ciInvokedScripts(CI).length).toBeGreaterThan(3)
    expect(ciEnvKeys(CI).length).toBeGreaterThan(0)
  })

  it("existen los scripts que el pipeline necesita", () => {
    // `typecheck` y `verify` no existían: la invariante 5 ("verificación mínima
    // antes de commit") era una promesa sin comando único al que apuntar.
    for (const script of ["typecheck", "lint", "test", "knip", "build", "verify", "test:e2e"]) {
      expect(SCRIPTS[script], `falta el script \`${script}\` en package.json`).toBeDefined()
    }
  })

  it("todo `npm run X` del workflow apunta a un script que existe", () => {
    // Un `run: npm run typo` no falla al editar el YAML: falla en CI, minutos
    // después, con un mensaje que no dice "este script no existe".
    const invoked = ciInvokedScripts(CI)
    const missing = invoked.filter((script) => !(script in SCRIPTS))

    expect(
      missing,
      `El workflow invoca scripts que no existen en package.json: ${missing.join(", ")}. ` +
        `CI fallaría en el paso, no al leer el archivo.`
    ).toEqual([])
  })

  it("el workflow declara `concurrency` y cancela la corrida anterior", () => {
    // Sin esto, 33 de 99 corridas se pisaban y `e2e` (155-244 s) moría a los
    // ~91 s con `The operation was canceled.` — 13 de 40 corridas, contadas como
    // `failure` aunque no lo fueran. El grupo incluye `github.ref`, así que un PR
    // y `main` no se cancelan entre sí.
    const block = /^concurrency:\n((?:[ \t]+.*\n)+)/m.exec(CI)?.[1] ?? ""

    expect(block, "ci.yml no declara `concurrency`").not.toBe("")
    expect(block, "falta `cancel-in-progress: true` en el bloque concurrency").toMatch(
      /cancel-in-progress:\s*true/
    )
    expect(block, "el grupo debe incluir `github.ref` para no mezclar ramas").toMatch(
      /group:\s*\$\{\{\s*github\.workflow\s*\}\}\s*-\s*\$\{\{\s*github\.ref\s*\}\}/
    )
  })

  it("el workflow no invoca binarios sueltos donde ya hay un script", () => {
    // `npx tsc --noEmit` y `npx knip --production` eran el camino viejo: el
    // desarrollador corría `npm run X` y CI otra cosa. Se miran solo las líneas
    // `run:`, porque en los comentarios citar el comando viejo es documentarlo.
    const commands = [...CI.matchAll(/^\s*run:\s*(.+?)\s*$/gm)].map((match) => match[1] ?? "")

    expect(
      commands.filter((command) => /^npx\s+tsc\b/.test(command)),
      "CI volvió a invocar `tsc` suelto en vez de `npm run typecheck`"
    ).toEqual([])
    expect(
      commands.filter((command) => /\bknip\b/.test(command) && /--production/.test(command)),
      "CI volvió a invocar knip con `--production`, que esconde los tests"
    ).toEqual([])
  })

  it("`Build` corre después de los tests y antes de `Knip`", () => {
    // El orden importa: con `Knip` delante, toda corrida que knip rompía dejaba
    // `Build` sin ejecutar (conclusión `-`). El gate más caro era el único que
    // nunca daba señal.
    const unit = stepIndex("Unit tests")
    const build = stepIndex("Build")
    const knip = stepIndex("Knip (dead code audit)")

    expect(unit, "no se encontró el paso `Unit tests`").toBeGreaterThan(-1)
    expect(build, "no se encontró el paso `Build`").toBeGreaterThan(-1)
    expect(knip, "no se encontró el paso `Knip (dead code audit)`").toBeGreaterThan(-1)
    expect(build, "`Build` debe ir después de `Unit tests`").toBeGreaterThan(unit)
    expect(build, "`Build` debe ir antes de `Knip`, o vuelve a quedar escondido").toBeLessThan(knip)
  })

  it("toda variable `env:` del workflow está documentada en .env.local.example", () => {
    // Una variable que solo vive en el YAML es una que nadie puede reproducir en
    // local: el fallo se vuelve irreproducible.
    const undocumented = ciEnvKeys(CI).filter(
      (key) => !new RegExp(`^#?\\s*${key}\\s*=`, "m").test(ENV_EXAMPLE)
    )

    expect(
      undocumented,
      `Estas variables de ci.yml no están en .env.local.example: ${undocumented.join(", ")}. ` +
        `Sin documentarlas, el fallo que causan no se puede reproducir en local.`
    ).toEqual([])
  })

  it("`test:e2e` conserva `--grep @ci` (invariante 9)", () => {
    // Todo spec e2e corre en CI, o no existe. Sin el filtro, el job tarda lo que
    // tarde la suite completa y se vuelve el primer candidato a ser cancelado.
    expect(SCRIPTS["test:e2e"]).toContain("--grep @ci")
    expect(SCRIPTS["test:e2e:all"], "el runner completo debe seguir disponible").toBe(
      "playwright test"
    )
  })

  it("el hook de pre-push existe, es ejecutable y no puede bloquear", () => {
    // El hook avisa a propósito: en un checkout compartido por varias sesiones,
    // bloquear haría que cualquiera quede preso de un archivo ajeno. Un `exit 1`
    // o un `set -e` colado aquí convertiría el aviso en un candado.
    const mode = statSync(HOOK_PATH).mode
    expect(mode & 0o111, ".githooks/pre-push no es ejecutable (falta `chmod +x`)").not.toBe(0)

    const hook = readFileSync(HOOK_PATH, "utf8")
    expect(hook, "el hook contiene `exit 1`: bloquearía el push").not.toMatch(/\bexit\s+1\b/)
    expect(hook, "el hook contiene `set -e`: abortaría el push").not.toMatch(/\bset\s+-e\b/)
    expect(hook, "el hook debe terminar con éxito explícito").toMatch(/\bexit\s+0\b/)
  })

  it("no se reintroduce un gestor de hooks que bloquee", () => {
    // La decisión fue hook propio + `core.hooksPath`, sin dependencias. Un
    // `husky` o `simple-git-hooks` traería además un `prepare` que corre en cada
    // `npm ci` del CI.
    for (const dep of ["husky", "simple-git-hooks", "lint-staged"]) {
      const declared = PKG.dependencies?.[dep] ?? PKG.devDependencies?.[dep]
      expect(declared, `\`${dep}\` volvió a declararse: la decisión fue no depender de él`).toBeUndefined()
    }
    expect(SCRIPTS["prepare"], "un script `prepare` corre en cada `npm ci` del CI").toBeUndefined()
  })
})
