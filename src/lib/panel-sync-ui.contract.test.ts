import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

/**
 * Guardia estática de la sincronización del panel — el estado que se declara
 * contra el estado que se pinta.
 *
 * QUÉ FALLÓ Y POR QUÉ NINGÚN GATE LO VIO
 *
 * `panel-sync.ts` declara `PanelSyncState = "idle" | "saving" | "saved" |
 * "conflict" | "error"` y `ConflictKind = "merged" | "kept-local"`, y
 * `use-synced-storage.ts` entra en `conflict` por tres caminos distintos. El
 * badge que lo muestra, en cambio, comparaba `idle`, `saving` y `saved` y
 * terminaba en un `return` sin condición: **`conflict` y `error` caían en la
 * misma rama** y se pintaban idénticos («Error al guardar · Reintentar»). Las
 * cadenas del aviso correcto (`syncConflictMerged`, `syncConflictKept`,
 * `syncConflictRetry`, `syncConflictDismiss`) existían, traducidas en los dos
 * idiomas y verificadas por `locale.test.ts`, y **no las invocaba nadie**;
 * `clearConflicts()` estaba exportada y sin un solo call site, y `knip` la
 * reportaba como export muerto.
 *
 * La razón de fondo es que la batería existente comparaba el store consigo
 * mismo: `panel-sync.test.ts` probaba la precedencia del agregado y ninguna
 * aserción miraba al consumidor. Un estado declarado que nadie pinta es una
 * promesa que la UI no cumple, y ninguna de esas pruebas podía verlo.
 *
 * QUÉ FORMAS CIERRA
 *
 *  1. Un `PanelSyncState` nuevo sin rama en el badge (el bug original).
 *  2. Dos estados que comparten la rama final y por tanto se ven igual.
 *  3. Un `ConflictKind` por el que el badge no ramifica.
 *  4. Una clave `panel.sync*` traducida y jamás renderizada (el síntoma).
 *  5. Una clave declarada en `es` y ausente en `en`.
 *
 * DISCRIMINADOR CRÍTICO
 *
 * `sync*` no es un namespace: es un prefijo que aparece en dos ramas del
 * diccionario. `panel.syncSaving` y compañía son del badge; `foodos.pos.syncMenu`,
 * `syncing`, `syncResult` y `syncSkipped` son de otra superficie. Por eso las
 * claves no se buscan por texto sino leyendo **las propiedades directas del
 * objeto `panel`**: un `grep` de `sync` casaría las cuatro de foodos y afirmaría
 * que están en uso cuando el badge no las toca.
 *
 * POR QUÉ EL AST Y NO EXPRESIONES REGULARES
 *
 * Un `grep` de `"conflict"` encuentra la palabra en el comentario que explica el
 * estado, en un `type` y en una prueba. Lo que decide es si el *badge* compara
 * contra ese valor, y eso es una relación entre nodos del árbol de sintaxis.
 * Igual que en `a11y-static.contract.test.ts`: en este repo, un hecho sobre lo
 * que el código compara se lee con el compilador de TypeScript.
 *
 * LOS DETECTORES SE PRUEBAN CONTRA FIXTURES SINTÉTICAS ANTES DE MIRAR EL
 * PERÍMETRO. Un detector roto que no encuentra nada también devuelve cero
 * hallazgos, y las aserciones del perímetro pasarían igual.
 */

const RAIZ = process.cwd()
const RUTA_SYNC = join("src", "lib", "panel-sync.ts")
const RUTA_BADGE = join("src", "components", "panel", "sync-status-badge.tsx")
const RUTA_ES = join("src", "lib", "i18n", "es.ts")
const RUTA_EN = join("src", "lib", "i18n", "en.ts")
const DIR_I18N = join(RAIZ, "src", "lib", "i18n")

interface Literal {
  valor: string
  linea: number
}

function leer(rel: string): string {
  return readFileSync(join(RAIZ, rel), "utf8")
}

function parsear(nombre: string, texto: string, tsx: boolean): ts.SourceFile {
  return ts.createSourceFile(
    nombre,
    texto,
    ts.ScriptTarget.Latest,
    true,
    tsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
}

function ast(rel: string): ts.SourceFile {
  return parsear(rel, leer(rel), rel.endsWith(".tsx"))
}

function lineaDe(archivo: ts.SourceFile, nodo: ts.Node): number {
  return archivo.getLineAndCharacterOfPosition(nodo.getStart(archivo)).line + 1
}

/** Todos los nodos que cumplen el predicado, en orden de aparición. */
function nodos<T extends ts.Node>(raiz: ts.Node, predicado: (n: ts.Node) => n is T): T[] {
  const salida: T[] = []
  const visitar = (n: ts.Node): void => {
    if (predicado(n)) salida.push(n)
    ts.forEachChild(n, visitar)
  }
  visitar(raiz)
  return salida
}

function nombreDe(nombre: ts.PropertyName): string {
  if (ts.isIdentifier(nombre) || ts.isStringLiteral(nombre)) return nombre.text
  return ""
}

/**
 * Literales de una unión de strings: `type X = "a" | "b"`.
 *
 * Falla en voz alta si la declaración no está o si no es una unión de strings:
 * devolver `[]` haría pasar todas las aserciones de abajo sin haber mirado
 * nada, que es exactamente el `✅` vacuo que esta guardia existe para evitar.
 */
function variantesDeUnion(archivo: ts.SourceFile, nombre: string): Literal[] {
  const alias = nodos(
    archivo,
    (n): n is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(n) && n.name.text === nombre,
  )[0]
  if (!alias) throw new Error(`No se encontró la unión \`${nombre}\``)
  if (!ts.isUnionTypeNode(alias.type)) {
    throw new Error(`\`${nombre}\` no es una unión de strings`)
  }
  const literales = alias.type.types
    .filter(ts.isLiteralTypeNode)
    .map((l) => l.literal)
    .filter(ts.isStringLiteral)
    .map((s) => ({ valor: s.text, linea: lineaDe(archivo, s) }))
  if (literales.length === 0) throw new Error(`\`${nombre}\` no declara literales de string`)
  return literales
}

function literalComparado(
  archivo: ts.SourceFile,
  izq: ts.Expression,
  der: ts.Expression,
  variable: string,
): Literal | null {
  const pares: Array<[ts.Expression, ts.Expression]> = [
    [izq, der],
    [der, izq],
  ]
  for (const [a, b] of pares) {
    if (ts.isIdentifier(a) && a.text === variable && ts.isStringLiteral(b)) {
      return { valor: b.text, linea: lineaDe(archivo, b) }
    }
  }
  return null
}

function dentroDeSwitch(nodo: ts.Node, variable: string): boolean {
  let p: ts.Node | undefined = nodo.parent
  while (p) {
    if (ts.isSwitchStatement(p)) {
      return ts.isIdentifier(p.expression) && p.expression.text === variable
    }
    if (ts.isFunctionLike(p)) return false
    p = p.parent
  }
  return false
}

/**
 * Valores contra los que el consumidor compara una variable, en
 * `variable === "x"`, `"x" === variable` o `switch (variable) { case "x": }`.
 * Un `switch` se incluye para que un refactor legítimo no haga fallar la
 * guardia por una razón falsa.
 */
function valoresComparados(archivo: ts.SourceFile, variable: string): Literal[] {
  const salida: Literal[] = []
  const visitar = (n: ts.Node): void => {
    if (
      ts.isBinaryExpression(n) &&
      (n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken)
    ) {
      const par = literalComparado(archivo, n.left, n.right, variable)
      if (par) salida.push(par)
    }
    if (ts.isCaseClause(n) && ts.isStringLiteral(n.expression) && dentroDeSwitch(n, variable)) {
      salida.push({ valor: n.expression.text, linea: lineaDe(archivo, n.expression) })
    }
    ts.forEachChild(n, visitar)
  }
  visitar(archivo)
  return salida
}

/** Claves i18n citadas literalmente en un archivo, bajo un prefijo dado. */
function clavesCitadas(archivo: ts.SourceFile, prefijo: string): Literal[] {
  return nodos(archivo, (n): n is ts.StringLiteral => ts.isStringLiteral(n))
    .filter((s) => s.text.startsWith(prefijo))
    .map((s) => ({ valor: s.text, linea: lineaDe(archivo, s) }))
}

function objetoDeVariable(
  archivo: ts.SourceFile,
  variable: string,
): ts.ObjectLiteralExpression | undefined {
  const decl = nodos(
    archivo,
    (n): n is ts.VariableDeclaration =>
      ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === variable,
  )[0]
  if (!decl?.initializer) return undefined
  return ts.isObjectLiteralExpression(decl.initializer) ? decl.initializer : undefined
}

/** Claves `panel.sync*`: propiedades **directas** del objeto `panel`. */
function clavesDelPanel(archivo: ts.SourceFile, variable: string): Literal[] {
  const diccionario = objetoDeVariable(archivo, variable)
  if (!diccionario) throw new Error(`No se encontró el objeto \`${variable}\``)
  const panel = diccionario.properties.find(
    (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && nombreDe(p.name) === "panel",
  )
  if (!panel) throw new Error(`\`${variable}\` no declara la clave \`panel\``)
  if (!ts.isObjectLiteralExpression(panel.initializer)) {
    throw new Error("`panel` no es un objeto literal")
  }
  return panel.initializer.properties
    .filter(
      (p): p is ts.PropertyAssignment =>
        ts.isPropertyAssignment(p) && nombreDe(p.name).startsWith("sync"),
    )
    .map((p) => ({ valor: `panel.${nombreDe(p.name)}`, linea: lineaDe(archivo, p.name) }))
}

function archivosFuente(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue
    const p = join(dir, entrada)
    if (statSync(p).isDirectory()) archivosFuente(p, salida)
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) salida.push(p)
  }
  return salida
}

/** Dónde se cita cada clave `panel.sync*` fuera del diccionario. */
function citasEnSrc(): Map<string, string> {
  const citas = new Map<string, string>()
  for (const p of archivosFuente(join(RAIZ, "src"))) {
    if (p.startsWith(DIR_I18N)) continue
    const texto = readFileSync(p, "utf8")
    // Prefiltro barato: parsear todo `src` costaría segundos sin ganar nada.
    if (!texto.includes("panel.sync")) continue
    const sf = parsear(p, texto, p.endsWith(".tsx"))
    for (const s of nodos(sf, (n): n is ts.StringLiteral => ts.isStringLiteral(n))) {
      if (s.text.startsWith("panel.sync") && !citas.has(s.text)) {
        citas.set(s.text, `${relative(RAIZ, p)}:${lineaDe(sf, s)}`)
      }
    }
  }
  return citas
}

const SYNC = ast(RUTA_SYNC)
const BADGE = ast(RUTA_BADGE)
const ESTADOS = variantesDeUnion(SYNC, "PanelSyncState")
const TIPOS_CONFLICTO = variantesDeUnion(SYNC, "ConflictKind")
const CLAVES_ES = clavesDelPanel(ast(RUTA_ES), "es")
const CLAVES_EN = clavesDelPanel(ast(RUTA_EN), "en")

describe("detectores (fixtures sintéticas)", () => {
  it("variantesDeUnion lee una unión de strings y su línea", () => {
    const sf = parsear(
      "fixture.ts",
      `// comentario\ntype PanelSyncState = "idle" | "saving" | "error"\n`,
      false,
    )
    expect(variantesDeUnion(sf, "PanelSyncState")).toEqual([
      { valor: "idle", linea: 2 },
      { valor: "saving", linea: 2 },
      { valor: "error", linea: 2 },
    ])
  })

  it("variantesDeUnion falla en voz alta si no hay unión que leer", () => {
    const sf = parsear("fixture.ts", `type Otra = string\n`, false)
    expect(() => variantesDeUnion(sf, "PanelSyncState")).toThrow(/PanelSyncState/)
    expect(() => variantesDeUnion(sf, "Otra")).toThrow(/unión de strings/)
  })

  it("valoresComparados ve ===, ==, el orden invertido y switch/case", () => {
    const sf = parsear(
      "fixture.ts",
      [
        `declare const status: string`,
        `if (status === "a") {}`,
        `if ("b" == status) {}`,
        `switch (status) { case "c": break }`,
        `if (otra === "d") {}`,
      ].join("\n"),
      false,
    )
    expect(valoresComparados(sf, "status").map((v) => v.valor)).toEqual(["a", "b", "c"])
  })

  it("valoresComparados no confunde un comentario ni otra variable", () => {
    const sf = parsear(
      "fixture.ts",
      [`// status === "conflict" está pendiente`, `declare const status: string`].join("\n"),
      false,
    )
    expect(valoresComparados(sf, "status")).toEqual([])
  })

  it("clavesCitadas solo devuelve el prefijo pedido", () => {
    const sf = parsear(
      "fixture.tsx",
      `const a = t("panel.syncError")\nconst b = t("panel.syncConflictMerged")\nconst c = t("panel.title")\n`,
      true,
    )
    expect(clavesCitadas(sf, "panel.sync").map((c) => c.valor)).toEqual([
      "panel.syncError",
      "panel.syncConflictMerged",
    ])
  })

  it("clavesDelPanel lee las propiedades directas y no las anidadas", () => {
    const sf = parsear(
      "fixture.ts",
      [
        `export const es = {`,
        `  foodos: { pos: { syncMenu: "a", syncing: "b" } },`,
        `  panel: {`,
        `    syncSaving: "c",`,
        `    syncError: "d",`,
        `    title: "e",`,
        `  },`,
        `}`,
      ].join("\n"),
      false,
    )
    expect(clavesDelPanel(sf, "es").map((c) => c.valor)).toEqual([
      "panel.syncSaving",
      "panel.syncError",
    ])
  })
})

describe("perímetro: la máquina de estados contra su consumidor", () => {
  it("las uniones declaradas se pudieron leer", () => {
    expect(ESTADOS.map((e) => e.valor)).toContain("conflict")
    expect(ESTADOS.length).toBeGreaterThanOrEqual(4)
    expect(TIPOS_CONFLICTO.length).toBeGreaterThanOrEqual(2)
  })

  it("el badge distingue cada estado: a lo sumo uno puede quedar en la rama final", () => {
    const comparados = new Set(valoresComparados(BADGE, "status").map((v) => v.valor))
    const sinRama = ESTADOS.filter((e) => !comparados.has(e.valor))
    const detalle =
      `${RUTA_SYNC}:${ESTADOS[0]?.linea} declara PanelSyncState = ` +
      `${ESTADOS.map((e) => `"${e.valor}"`).join(" | ")}. ` +
      `${RUTA_BADGE} solo compara contra ` +
      `${[...comparados].map((v) => `"${v}"`).join(", ") || "(nada)"}. ` +
      `Sin rama propia quedan ${sinRama.length}: ` +
      `${sinRama.map((e) => `"${e.valor}"`).join(", ")}. ` +
      `La rama final (la que no compara) pinta TODOS los estados que no se ` +
      `comparan: con dos o más, dos estados distintos se ven idénticos.`
    expect(sinRama.length, detalle).toBeLessThanOrEqual(1)
  })

  it("el badge ramifica por ConflictKind y no por una constante", () => {
    const comparados = new Set(valoresComparados(BADGE, "conflict").map((v) => v.valor))
    const declarados = TIPOS_CONFLICTO.map((t) => t.valor)
    const detalle =
      `${RUTA_SYNC}:${TIPOS_CONFLICTO[0]?.linea} declara ConflictKind = ` +
      `${declarados.map((v) => `"${v}"`).join(" | ")}, pero ${RUTA_BADGE} no ` +
      `compara \`conflict\` contra ninguno de sus valores.`
    expect(comparados.size, detalle).toBeGreaterThanOrEqual(1)
  })
})

describe("perímetro: las cadenas traducidas se renderizan", () => {
  it("ninguna clave panel.sync* queda sin uso fuera del diccionario", () => {
    const citas = citasEnSrc()
    const huerfanas = CLAVES_ES.filter((k) => !citas.has(k.valor))
    const detalle = huerfanas
      .map(
        (k) =>
          `${RUTA_ES}:${k.linea} declara \`${k.valor}\` y no lo cita nadie en \`src\`. ` +
          `Una cadena traducida que ningún componente renderiza es una promesa ` +
          `que la UI no cumple.`,
      )
      .join("\n")
    expect(huerfanas.map((k) => k.valor), detalle).toEqual([])
  })

  it("es y en declaran el mismo juego de claves panel.sync*", () => {
    expect(CLAVES_EN.map((k) => k.valor).sort()).toEqual(CLAVES_ES.map((k) => k.valor).sort())
  })
})
