import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * Contrato de `pg_catalog` sobre constructos que son **gramática SQL, no
 * funciones**.
 *
 * Contexto: la única acción de la pantalla de moderación de FoodOS
 * (`/admin/foodos/restaurantes`) **nunca funcionó**. Aprobar un restaurante
 * devolvía:
 *
 *   POST /rest/v1/rpc/foodos_restaurant_review
 *   → 404 {"code":"42883","message":"function pg_catalog.coalesce(text, unknown) does not exist"}
 *
 * `COALESCE`, `NULLIF`, `GREATEST` y `LEAST` **no son funciones**. Son nodos de
 * la gramática (`CoalesceExpr`, `NullIfExpr`): el parser los reconoce por palabra
 * clave y los resuelve sin buscar nada en el catálogo. Escribir `pg_catalog.`
 * delante no los califica — los convierte en una llamada a una función que no
 * existe. Medido contra la base real:
 *
 *   pg_catalog.btrim(text)         → btrim(text)     (existe)
 *   pg_catalog.lower(text)         → lower(text)     (existe)
 *   pg_catalog.now()               → now()           (existe)
 *   pg_catalog.coalesce(text,text) → NO_EXISTE
 *   pg_catalog.nullif(text,text)   → NO_EXISTE
 *   pg_catalog.greatest(text,text) → NO_EXISTE
 *   pg_catalog.least(text,text)    → NO_EXISTE
 *
 * El defecto estaba en el `DECLARE` de la RPC, es decir **antes** de la
 * comprobación de administrador: la función fallaba para todo el mundo, incluido
 * un admin legítimo. Se arregló en `00181`, que deja `00168` intacto a
 * propósito: es el registro histórico del fallo.
 *
 * **Por qué ninguna guardia lo vio.** Siete comprobaciones de la migración
 * preguntaban si algo *existe* (`to_regprocedure`, `has_function_privilege`) o
 * si un objeto está presente (`pg_get_functiondef`, `pg_constraint`). Ninguna
 * **invocaba** la función. Un objeto puede existir, tener los permisos
 * correctos y aun así no funcionar. La lección quedó escrita en `00181`: toda
 * autocomprobación que importe debe invocar.
 *
 * La tentación contraria también es un defecto, y por eso existe R5: con
 * `SET search_path = ''` **hay que** calificar las funciones reales de
 * `pg_catalog` (`btrim`, `lower`, `now`). Un contrato que prohibiera todo
 * `pg_catalog.` rompería esas funciones correctas y sería ruido, no señal.
 *
 * Este contrato cierra cuatro formas de reintroducir el defecto:
 *
 *  1. **Una migración nueva califica un constructo de gramática.** Es la forma
 *     directa del fallo.
 *  2. **Una migración nueva reescribe `foodos_restaurant_review()` volviendo a
 *     calificar `coalesce`/`nullif`.** La firma de la regresión concreta.
 *  3. **Se sustituye el análisis de texto por uno que no tiene señal.** Si el
 *     regex se rompe, R1 pasaría por vacío y el contrato no vigilaría nada; R3
 *     es el control positivo que lo impide.
 *  4. **Se prohíbe `pg_catalog.` en bloque.** El contrato empezaría a marcar
 *     `btrim`/`lower`/`now`, que son correctas y necesarias; R5 es el control
 *     negativo.
 *
 * Límite conocido y aceptado: el análisis es textual y no entiende de
 * contextos. Un `coalesce` calificado dentro de una cadena literal se marcaría
 * como defecto. No ocurre en este repositorio, y si ocurriera, el aviso sería
 * correcto: en SQL no hay razón para escribir `esquema.coalesce`.
 */
const REPO = process.cwd()
const MIGRATIONS_DIR = join("supabase", "migrations")

/**
 * Las cuatro palabras clave que son gramática. Si Postgres añade otra (por
 * ejemplo `any_value`), entra aquí; `pg_catalog.any_value(...)` daría `42883`
 * igual que las demás.
 */
const GRAMATICA = ["coalesce", "nullif", "greatest", "least"] as const

/** `esquema.constructo(` — cualquier esquema, no sólo `pg_catalog`. */
const CALIFICA_GRAMATICA = new RegExp(
  String.raw`\b([A-Za-z_][A-Za-z0-9_]*)\.(${GRAMATICA.join("|")})\s*\(`,
  "i",
)

/** `pg_catalog.<nombre>(` para cualquier nombre: la forma legítima. */
const CALIFICA_PG_CATALOG = /\bpg_catalog\.([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi

/** Quita comentarios para no confundir una explicación con código. */
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")
}

function archivosDeMigracion(): string[] {
  return readdirSync(join(REPO, MIGRATIONS_DIR))
    .filter((n) => n.endsWith(".sql"))
    .sort()
}

function leer(archivo: string): string {
  return readFileSync(join(REPO, MIGRATIONS_DIR, archivo), "utf8")
}

type Definicion = {
  archivo: string
  nombre: string
  /** Todo el bloque de la definición: cabecera + cuerpo + lo que la sigue. */
  bloque: string
}

/**
 * La última definición gana: las migraciones se reproducen en orden y
 * `CREATE OR REPLACE` sustituye. `00168` califica `coalesce` y eso es correcto —
 * es el registro histórico del fallo. Lo que no puede pasar es que la
 * **última** definición lo repita.
 */
function leerDefiniciones(): Definicion[] {
  const todas: Definicion[] = []
  const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([A-Za-z0-9_."]+)\s*\(/gi

  for (const archivo of archivosDeMigracion()) {
    const texto = sinComentarios(leer(archivo))
    for (const m of texto.matchAll(re)) {
      const nombre = (m[1] ?? "").replace(/"/g, "").toLowerCase().split(".").pop() ?? ""
      if (nombre === "") continue
      const desde = m.index ?? 0
      const siguiente = texto.indexOf("CREATE", desde + m[0].length)
      todas.push({
        archivo,
        nombre,
        bloque: texto.slice(desde, siguiente === -1 ? texto.length : siguiente),
      })
    }
  }
  return todas
}

const DEFINICIONES = leerDefiniciones()

const ULTIMAS = new Map<string, Definicion>()
for (const d of DEFINICIONES) ULTIMAS.set(d.nombre, d)

const ULTIMAS_CON_DEFECTO = [...ULTIMAS.values()].filter((d) =>
  CALIFICA_GRAMATICA.test(d.bloque),
)

/**
 * Todo el historial, no sólo las últimas: para confinar el defecto a `00168`.
 * Incluye el `pg_catalog.coalesce` de `00168`, que es el registro del fallo y se
 * deja intacto a propósito.
 */
const TODO_EL_HISTORIAL = archivosDeMigracion().flatMap((archivo) => {
  const texto = sinComentarios(leer(archivo))
  return [...texto.matchAll(new RegExp(CALIFICA_GRAMATICA, "gi"))].map((m) => ({
    archivo,
    encontrado: m[0] ?? "",
  }))
})

/**
 * Nombres calificados en las definiciones **vigentes** (la última de cada
 * función). Es lo que describe el estado real del esquema; el historial incluiría
 * el `coalesce` de `00168` y mezclaría el registro del fallo con el código vivo.
 */
const PGCATALOG_EN_VIGOR = [
  ...new Set(
    [...ULTIMAS.values()].flatMap((d) =>
      [...d.bloque.matchAll(CALIFICA_PG_CATALOG)].map((m) => (m[1] ?? "").toLowerCase()),
    ),
  ),
].sort()

describe("contrato de gramática SQL calificada con esquema", () => {
  it("R1 — ninguna última definición califica coalesce/nullif/greatest/least", () => {
    const malas = ULTIMAS_CON_DEFECTO.map((d) => `${d.archivo} → ${d.nombre}()`)
    expect(
      malas,
      "COALESCE, NULLIF, GREATEST y LEAST son gramática del parser, no funciones del " +
        "catálogo. Ponerles esquema delante no los califica: los convierte en una llamada a " +
        "una función inexistente y el error es 42883. Es lo que dejó muerta la única acción " +
        "de /admin/foodos/restaurantes (arreglado en 00181). Escribe `coalesce(...)` sin " +
        "esquema; funciona igual con `SET search_path = ''` porque no necesita resolución.",
    ).toEqual([])
  })

  it("R2 — el canario: hay definiciones finales que revisar", () => {
    // Si el analizador se rompe (por ejemplo, porque cambia la forma de escribir
    // `CREATE FUNCTION`), R1 pasaría por vacío y el contrato no vigilaría nada.
    expect(ULTIMAS.size).toBeGreaterThanOrEqual(60)
    expect(DEFINICIONES.length).toBeGreaterThanOrEqual(ULTIMAS.size)
    expect(archivosDeMigracion().length).toBeGreaterThanOrEqual(150)
  })

  it("R3 — el analizador tiene señal: detecta el defecto real de 00168", () => {
    // Control positivo. Sin esto, un regex roto haría pasar R1 y el contrato
    // sería decorativo. `00168` califica `coalesce` y `nullif` en su DECLARE y
    // se deja intacto a propósito: es el registro histórico del fallo.
    const en00168 = TODO_EL_HISTORIAL.filter(
      (h) => h.archivo === "00168_foodos_restaurant_moderation.sql",
    )
    expect(
      en00168.length,
      "el analizador no ve la calificación de 00168: el regex perdió la señal",
    ).toBeGreaterThanOrEqual(2)

    const constructos = new Set(
      en00168.map((h) => h.encontrado.toLowerCase().replace(/^.*\./, "").replace(/\s*\($/, "")),
    )
    expect([...constructos].sort()).toEqual(["coalesce", "nullif"])
  })

  it("R4 — la última definición de foodos_restaurant_review es la corregida", () => {
    const ultima = ULTIMAS.get("foodos_restaurant_review")
    expect(ultima, "foodos_restaurant_review() desapareció de las migraciones").toBeDefined()
    expect(ultima?.archivo).toBe("00181_fix_foodos_review_coalesce.sql")
    expect(CALIFICA_GRAMATICA.test(ultima?.bloque ?? "")).toBe(false)
  })

  it("R5 — calificar funciones REALES de pg_catalog sigue permitido y se usa", () => {
    // Control negativo. Con `SET search_path = ''` hay que calificar `btrim`,
    // `lower` y `now`; un contrato que prohibiera todo `pg_catalog.` marcaría
    // esas funciones correctas como defectos.
    expect(PGCATALOG_EN_VIGOR).toContain("btrim")
    expect(PGCATALOG_EN_VIGOR).toContain("now")

    for (const gramatical of GRAMATICA) {
      expect(
        PGCATALOG_EN_VIGOR,
        `\`pg_catalog.${gramatical}\` calificado en una definición vigente: ` +
          "un constructo de gramática no puede tratarse como función",
      ).not.toContain(gramatical)
    }

    // Y el arreglo usa las dos cosas a la vez: `search_path` fijado y los
    // constructos sin calificar. Es la prueba de que la gramática no necesita
    // resolución de nombres.
    const ultima = ULTIMAS.get("foodos_restaurant_review")
    expect(ultima?.bloque).toMatch(/SET\s+search_path\s*=\s*''/i)
    expect(ultima?.bloque).toMatch(/\bcoalesce\s*\(/i)
    expect(ultima?.bloque).toMatch(/\bnullif\s*\(/i)
    expect(ultima?.bloque).not.toMatch(CALIFICA_GRAMATICA)
  })

  it("R6 — el defecto queda confinado a 00168 y no se reintroduce", () => {
    const archivosAfectados = [...new Set(TODO_EL_HISTORIAL.map((h) => h.archivo))]
    expect(
      archivosAfectados,
      "una migración nueva volvió a calificar un constructo de gramática",
    ).toEqual(["00168_foodos_restaurant_moderation.sql"])
  })
})
