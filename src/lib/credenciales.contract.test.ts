import { describe, expect, it } from "vitest"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * Contrato de `docs/CREDENCIALES.md`.
 *
 * POR QUÉ EXISTE: la guía de credenciales es el único documento del repo que
 * dice **dónde se consigue cada valor externo**. Su valor entero depende de que
 * no envejezca, y un documento así envejece de cuatro maneras concretas, todas
 * silenciosas:
 *
 *  1. **Se añade una integración y nadie la documenta.** El panel la muestra
 *     apagada, el operador no sabe qué pedir y no hay ningún aviso.
 *  2. **La guía nombra una variable que no existe.** Un `OPENAI_KEY` en vez de
 *     `OPENAI_API_KEY` manda a pegar el valor en el sitio equivocado y el
 *     operador concluye que "no funciona".
 *  3. **Un enlace de obtención queda obsoleto o inseguro** (`http://`, o el
 *     `docsUrl` del POS cambia en el registro y la guía sigue con el viejo).
 *  4. **Un puntero apunta a un archivo que ya no está**, y el lector persigue
 *     una ruta muerta.
 *
 * La lección de la Ronda 24 aplica aquí igual: **el contrato es bidireccional**.
 * No basta con que la guía no tenga basura; hay que impedir que el código
 * avance sin que la guía se entere, y al revés.
 *
 * LÍMITE CONOCIDO Y ACEPTADO: esto vigila la **forma** de la guía, no que los
 * trámites de verdad funcionen. Que Stripe apruebe una cuenta Connect o que el
 * SAT acepte un CSD no lo puede observar ningún test local.
 */

const REPO = process.cwd()

function read(relativePath: string): string {
  return readFileSync(join(REPO, relativePath), "utf8")
}

const GUIDE_PATH = "docs/CREDENCIALES.md"
const GUIDE = read(GUIDE_PATH)
const ENV_EXAMPLE = read(".env.local.example")
const INTEGRATION_STATUS = read("src/lib/integration-status.ts")
const POS_REGISTRY = read("src/lib/pos/registry.ts")

/**
 * Variables que la guía nombra **a propósito** aunque no existan todavía.
 *
 * Cada una lleva su razón: una excepción sin razón es una excepción que nadie
 * puede revisar. El contrato exige que la razón no esté vacía, así que añadir
 * una entrada aquí obliga a decidir por qué.
 */
const PROPUESTAS: Record<string, string> = {
  CFDI_PAC_API_KEY:
    "Propuesta del track CFDI (§3): no implementado. La guía lo dice explícitamente.",
  CFDI_PAC_BASE_URL:
    "Propuesta del track CFDI (§3): no implementado. La guía lo dice explícitamente.",
  CFDI_RFC_EMISOR:
    "Propuesta del track CFDI (§3): no implementado. La guía lo dice explícitamente.",
  CFDI_REGIMEN_FISCAL:
    "Propuesta del track CFDI (§3): no implementado. La guía lo dice explícitamente.",
  POSTGRES_PASSWORD:
    "Variable de plataforma (§0): la consume `psql`/el CLI de Supabase, no la app.",
  POSTGRES_URL:
    "Variable de plataforma (§0): la consume `psql`/el CLI de Supabase, no la app.",
}

/**
 * Texto de los spans en backticks. La guía nombra variables y rutas ahí dentro;
 * fuera de backticks el texto es prosa y no se vigila.
 */
function codeSpans(text: string): string[] {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1] ?? "")
}

/**
 * Tokens con forma de variable de entorno: mayúsculas, al menos dos segmentos
 * separados por `_`. Exige el guion bajo para no confundir `AU10`, `P1` ni
 * `REVOKE UPDATE` (con espacio) con variables.
 */
function envTokens(text: string): string[] {
  const found = new Set<string>()
  for (const span of codeSpans(text)) {
    for (const token of span.matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g)) {
      found.add(token[0])
    }
  }
  return [...found].sort()
}

/** Variables que `integration-status.ts` declara necesarias, por integración. */
function declaredIntegrationVars(source: string): string[] {
  const found = new Set<string>()
  for (const block of source.matchAll(/requires:\s*\[([^\]]*)\]/g)) {
    for (const name of (block[1] ?? "").matchAll(/"([A-Z0-9_]+)"/g)) {
      found.add(name[1] ?? "")
    }
  }
  return [...found].sort()
}

/**
 * Todo el texto de código del repo, en una sola pasada y cacheado.
 *
 * Se cachea porque el recorrido es de unos cientos de archivos y tres reglas lo
 * consultan. Se busca el nombre como **palabra suelta** y no como
 * `process.env.X`: el código accede a menudo por un parámetro inyectable
 * (`env.OPENAI_API_KEY`), y exigir el prefijo daría falsos negativos —que es
 * justo el error que un contrato no puede permitirse.
 */
let codeTextCache: string | null = null
function codeText(): string {
  if (codeTextCache !== null) return codeTextCache

  const roots = ["src", "e2e", "scripts", "supabase"]
  const extensions = new Set([".ts", ".tsx", ".mjs", ".js", ".sql", ".json"])
  const chunks: string[] = []

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        walk(path)
      } else if (extensions.has(entry.slice(entry.lastIndexOf(".")))) {
        chunks.push(readFileSync(path, "utf8"))
      }
    }
  }

  for (const root of roots) {
    const absolute = join(REPO, root)
    if (existsSync(absolute)) walk(absolute)
  }

  codeTextCache = chunks.join("\n")
  return codeTextCache
}

/** `true` si la variable está declarada en `.env.local.example`, comentada o no. */
function declaredInEnvExample(name: string): boolean {
  return new RegExp(`^#?\\s*${name}\\s*=`, "m").test(ENV_EXAMPLE)
}

/** `true` si el nombre aparece en el código como palabra suelta. */
function referencedInCode(name: string): boolean {
  return new RegExp(`\\b${name}\\b`).test(codeText())
}

describe("contrato de docs/CREDENCIALES.md", () => {
  it("la extracción de variables funciona (un contrato que no encuentra nada no vigila nada)", () => {
    // Si alguien rompe el regex —o cambia el formato de la guía— las tres reglas
    // siguientes pasarían vacías y en verde. Esta guarda convierte ese fallo
    // silencioso en un rojo explícito.
    const tokens = envTokens(GUIDE)
    expect(tokens.length, `solo se encontraron ${tokens.length} variables en la guía`).toBeGreaterThan(
      30
    )

    const declared = declaredIntegrationVars(INTEGRATION_STATUS)
    expect(declared.length, "no se extrajo ninguna variable de integration-status.ts").toBeGreaterThan(
      8
    )
  })

  it("toda integración declarada en integration-status.ts está en la guía (regla 1)", () => {
    // Dirección código → guía: añadir una integración obliga a documentarla.
    // Sin esto, el operador ve el panel apagado y no sabe qué pedir.
    const declared = declaredIntegrationVars(INTEGRATION_STATUS)
    const missing = declared.filter((name) => !GUIDE.includes(name))

    expect(
      missing,
      `Estas variables de integration-status.ts no aparecen en ${GUIDE_PATH}: ` +
        `${missing.join(", ")}. Añadir una integración obliga a documentar dónde ` +
        `se consigue su credencial, cuánto cuesta y cómo se verifica.`
    ).toEqual([])
  })

  it("toda variable nombrada en la guía existe de verdad (regla 2)", () => {
    // Dirección guía → código: prohibir variables fantasma. Un nombre mal escrito
    // manda a pegar el valor en el sitio equivocado.
    const ghosts = envTokens(GUIDE).filter(
      (name) =>
        !referencedInCode(name) &&
        !declaredInEnvExample(name) &&
        PROPUESTAS[name] === undefined
    )

    expect(
      ghosts,
      `Estas variables se nombran en ${GUIDE_PATH} pero no existen: no aparecen en ` +
        `el código ni en .env.local.example, y no están en PROPUESTAS. ` +
        `${ghosts.join(", ")}. Corrige el nombre, o añádelas a PROPUESTAS con su razón.`
    ).toEqual([])
  })

  it("toda excepción de PROPUESTAS lleva una razón (regla 2, la excepción no se exime sola)", () => {
    // Una excepción sin razón es una excepción que nadie puede revisar. Esto
    // impide que PROPUESTAS se convierta en un vertedero para callar la regla 2.
    const sinRazon = Object.entries(PROPUESTAS)
      .filter(([, reason]) => reason.trim().length < 20)
      .map(([name]) => name)

    expect(sinRazon, `estas excepciones no explican por qué lo son: ${sinRazon.join(", ")}`).toEqual(
      []
    )

    const sobran = Object.keys(PROPUESTAS).filter((name) => !GUIDE.includes(name))
    expect(
      sobran,
      `PROPUESTAS exime variables que la guía ya no nombra: ${sobran.join(", ")}. ` +
        `Borra la entrada: una excepción de más es una regla 2 más débil.`
    ).toEqual([])
  })

  it("todo enlace de obtención es https (regla 3)", () => {
    // Un `http://` en una guía de credenciales es un enlace que un operador puede
    // seguir y rellenar con un secreto. localhost se exceptúa: es documentación
    // de desarrollo, no un destino real.
    const insecure = [...GUIDE.matchAll(/http:\/\/[^\s`)"']+/g)]
      .map((m) => m[0])
      .filter((url) => !url.includes("localhost") && !url.includes("127.0.0.1"))

    expect(
      insecure,
      `Estos enlaces de ${GUIDE_PATH} no usan https: ${insecure.join(", ")}. ` +
        `Una guía que manda a pegar credenciales no puede usar http.`
    ).toEqual([])
  })

  it("los `docsUrl` del POS en la guía coinciden con el registro (regla 3)", () => {
    // Dirección código → guía. El registro es la fuente de verdad del panel: si
    // allí cambia una URL y la guía no, el restaurantero lee dos cosas distintas.
    //
    // Se comparan URLs **exactas**, no por subcadena. Con `includes()` una guía
    // que dijera `https://developer.clip.mx/VIEJO/` pasaba el contrato, porque
    // la URL buena es prefijo de la mala. Ese agujero lo destapó un sabotaje.
    const registryUrls = [...POS_REGISTRY.matchAll(/docsUrl:\s*"([^"]+)"/g)].map((m) => m[1] ?? "")
    expect(registryUrls.length, "no se extrajo ningún docsUrl de pos/registry.ts").toBeGreaterThan(5)

    const guideUrls = new Set(
      [...GUIDE.matchAll(/https?:\/\/[^\s`)"'<>]+/g)].map((m) =>
        (m[0] ?? "").replace(/[.,;:]+$/, "")
      )
    )

    const missing = registryUrls.filter((url) => !guideUrls.has(url))
    expect(
      missing,
      `Estos docsUrl de src/lib/pos/registry.ts no aparecen literalmente en ` +
        `${GUIDE_PATH}: ${missing.join(", ")}. La guía y el panel deben decir lo mismo, ` +
        `y una URL parecida no es la misma URL.`
    ).toEqual([])
  })

  it("todo path de repo citado en la guía existe (regla 4)", () => {
    // Un puntero a un archivo borrado manda al lector a una ruta muerta. Se
    // vigilan sólo las rutas con prefijo de directorio del repo: los nombres
    // sueltos (`printers.ts`, `pass.json`) son artefactos o ficheros eliminados
    // a propósito, y la guía los nombra justo para explicar que no están.
    const prefix = /^(?:src|docs|e2e|scripts|supabase|public|\.github)\//
    const suffix = /\.(?:md|ts|tsx|mjs|js|json|sql|ya?ml|example)$/

    const cited = new Set<string>()
    for (const span of codeSpans(GUIDE)) {
      for (const path of span.matchAll(/[\w./[\]-]+/g)) {
        const candidate = path[0]
        if (prefix.test(candidate) && suffix.test(candidate)) cited.add(candidate)
      }
    }

    expect(cited.size, "no se citó ningún path de repo: el regex dejó de funcionar").toBeGreaterThan(
      5
    )

    const missing = [...cited].filter((path) => !existsSync(join(REPO, path))).sort()
    expect(
      missing,
      `Estos paths citados en ${GUIDE_PATH} no existen: ${missing.join(", ")}. ` +
        `Actualiza el puntero o borra la referencia.`
    ).toEqual([])
  })
})
