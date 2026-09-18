import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { sinComentarios } from "./contrast"

/**
 * Contrato de los topes de las bitácoras de `/admin/bitacoras`.
 *
 * POR QUÉ EXISTE: las tres pestañas consultan con un `LIMIT` duro y ninguna
 * declaraba que se había cortado. Una lista truncada en silencio se lee como una
 * lista completa — y en `admin_audit_log` eso es perder evidencia de quién tocó
 * el dinero, el catálogo y los permisos.
 *
 * El contrato congela tres cosas por cada bitácora:
 *   1. su tope es una constante con nombre, no un literal suelto;
 *   2. la consulta pide `cap + 1` filas, que es la sonda de "¿hay más?";
 *   3. la pestaña declara el corte (`resumenDeCorte`) y ofrece export.
 *
 * Y falla si alguien añade una cuarta bitácora sin declararla, porque el
 * perímetro se descubre del disco y se compara con la tabla de abajo.
 *
 * Los `.tsx` se leen como texto: `vitest.config.ts` solo incluye
 * `src/**\/*.test.ts`, así que no se pueden importar aquí.
 */

const RAIZ = join(__dirname, "..", "..")
const CARPETA = join(RAIZ, "src", "app", "admin", "bitacoras")

interface Bitacora {
  /** Pestaña que la pinta (dentro de `bitacoras/`). */
  tab: string
  /** Archivo que ejecuta la consulta capada. */
  consulta: string
  /** Función de ese archivo que contiene la consulta; `null` = archivo entero. */
  funcion: string | null
  /** Constante con el tope. */
  cap: string
  /**
   * Dónde vive esa constante. Las tres viven en el mismo sitio a propósito:
   * ver el bloque "un solo número por tope".
   */
  capEn: string
  /** Columna del `ORDER BY`. */
  orden: string
}

const BITACORAS: Bitacora[] = [
  {
    tab: "auditoria-tab.tsx",
    consulta: "src/app/admin/actions.ts",
    funcion: "getAdminAuditLog",
    cap: "AUDIT_LOG_PAGE_SIZE",
    capEn: "src/lib/audit-log.ts",
    orden: "created_at",
  },
  {
    tab: "errores-tab.tsx",
    consulta: "src/lib/admin-errors.ts",
    funcion: "getErrorLogs",
    cap: "ERROR_LOG_CAP",
    capEn: "src/lib/bitacora.ts",
    orden: "created_at",
  },
  {
    tab: "emails-tab.tsx",
    consulta: "src/app/api/admin/email-logs/route.ts",
    funcion: null,
    cap: "EMAIL_LOG_CAP",
    capEn: "src/lib/bitacora.ts",
    orden: "sent_at",
  },
]

/**
 * Archivos de la carpeta que no son pestañas de lista: el armazón de la página,
 * el conmutador de pestañas y el layout.
 */
const NO_SON_BITACORA = ["page.tsx", "layout.tsx", "bitacoras-client.tsx"]

function leer(rel: string): string {
  return readFileSync(join(RAIZ, rel), "utf8")
}

/** El cuerpo de una función de nivel superior, para no barrer el archivo entero. */
function cuerpoDe(fuente: string, nombre: string): string {
  const lineas = fuente.split("\n")
  const inicio = lineas.findIndex((l) =>
    new RegExp(`^(export\\s+)?(async\\s+)?function\\s+${nombre}\\b`).test(l)
  )
  if (inicio === -1) throw new Error(`no encontré la función ${nombre}`)
  const fin = lineas.findIndex((l, i) => i > inicio && l === "}")
  return lineas.slice(inicio, fin === -1 ? undefined : fin + 1).join("\n")
}

/** El código que realmente consulta, sin comentarios. */
function consultaDe(b: Bitacora): string {
  const fuente = sinComentarios(leer(b.consulta))
  return b.funcion ? cuerpoDe(fuente, b.funcion) : fuente
}

/**
 * Todos los archivos `.ts`/`.tsx` de `src/`, para poder preguntar dónde se
 * declara de verdad una constante y no solo dónde la tabla dice que vive.
 */
function archivosDeSrc(dir = join(RAIZ, "src")): string[] {
  const out: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entrada.name)
    if (entrada.isDirectory()) out.push(...archivosDeSrc(full))
    else if (entrada.name.endsWith(".ts") || entrada.name.endsWith(".tsx")) out.push(full)
  }
  return out
}

/** Dónde está declarada `export const <nombre> = <número>`, en rutas relativas. */
function dondeSeDeclara(nombre: string): string[] {
  const re = new RegExp(`export const ${nombre}\\s*=\\s*\\d+`)
  return archivosDeSrc()
    .filter((f) => re.test(readFileSync(f, "utf8")))
    .map((f) => f.slice(RAIZ.length + 1))
    .sort()
}

/** Todas las pestañas `.tsx` de la carpeta, sin las de armazón. */
function pestanasEnDisco(): string[] {
  return readdirSync(CARPETA)
    .filter((f) => f.endsWith("-tab.tsx"))
    .sort()
}

describe("topes de las bitácoras de /admin/bitacoras", () => {
  it("el perímetro de pestañas es exactamente el declarado", () => {
    // Si aparece una cuarta pestaña y nadie la añade a BITACORAS, esto se pone
    // rojo: es la regla que impide que una bitácora nueva vuelva a cortarse sin
    // decirlo.
    expect(pestanasEnDisco()).toEqual(BITACORAS.map((b) => b.tab).sort())
  })

  it("la carpeta no tiene pestañas sueltas fuera del perímetro", () => {
    const archivos = readdirSync(CARPETA)
    const inesperados = archivos.filter(
      (f) => f.endsWith(".tsx") && !NO_SON_BITACORA.includes(f) && !f.endsWith("-tab.tsx")
    )
    expect(inesperados).toEqual([])
  })

  it.each(BITACORAS)("$cap es una constante con nombre y valor literal", (b) => {
    const fuente = leer(b.capEn)
    const m = fuente.match(new RegExp(`export const ${b.cap}\\s*=\\s*(\\d+)`))
    expect(m, `${b.cap} debe estar declarada en ${b.capEn}`).not.toBeNull()
    const valor = Number((m as RegExpMatchArray)[1])
    expect(valor).toBeGreaterThan(0)
  })

  it.each(BITACORAS)("$consulta pide cap + 1 filas (la sonda)", (b) => {
    const fuente = consultaDe(b)
    // Todo `.limit(...)` de la consulta debe terminar en `+ 1` y no ser un
    // literal suelto: sin la fila de más no hay forma de saber que se cortó.
    const limites = Array.from(fuente.matchAll(/\.limit\(\s*([^)]*?)\s*\)/g)).map((m) => m[1])
    expect(limites.length, `${b.consulta} debe acotar su consulta`).toBeGreaterThan(0)
    for (const arg of limites) {
      expect(arg, `.limit(${arg}) debe pedir una fila de más`).toMatch(/\+\s*1$/)
      expect(arg, `.limit(${arg}) no puede ser un literal suelto`).not.toMatch(/^\d+$/)
    }
  })

  it.each(BITACORAS)("$consulta ordena por $orden descendente", (b) => {
    expect(consultaDe(b)).toContain(`order("${b.orden}", { ascending: false })`)
  })

  it.each(BITACORAS)("$tab declara el corte con resumenDeCorte", (b) => {
    const fuente = leer(join("src", "app", "admin", "bitacoras", b.tab))
    // La llamada, no el import: importar el vocabulario y no usarlo dejaría la
    // bitácora cortándose en silencio otra vez.
    expect(fuente, `${b.tab} debe declarar cuántas filas muestra`).toMatch(/resumenDeCorte\(/)
    expect(fuente, `${b.tab} debe importar el vocabulario compartido`).toContain("@/lib/bitacora")
    expect(fuente, `${b.tab} debe exponer si se cortó`).toContain("truncated")
  })

  it.each(BITACORAS)("$tab ofrece exportar", (b) => {
    const fuente = leer(join("src", "app", "admin", "bitacoras", b.tab))
    // Se exige la *llamada*, no el import: un `import { downloadCsv }` sin uso
    // dejaría el botón sin efecto y la regla pasaría.
    expect(fuente, `${b.tab} debe permitir exportar lo que muestra`).toMatch(/downloadCsv\(/)
    expect(fuente, `${b.tab} debe construirlo con toCsv`).toMatch(/toCsv\(/)
    expect(fuente, `${b.tab} debe ofrecer el botón`).toContain("Exportar CSV")
  })
})

describe("un total nunca es el número de filas devueltas", () => {
  it.each(BITACORAS)("$consulta no deriva `total` de las filas devueltas", (b) => {
    // `total: x.length` / `total: entries.length` es exactamente el defecto que
    // esta ronda corrigió: un campo llamado `total` que significaba "mostradas".
    // Se lee el cuerpo de la consulta y sin comentarios: la prosa que *explica*
    // el defecto no es el defecto, y un agregado en memoria sobre todas las
    // filas sí puede llamarse `total` sin mentir.
    expect(consultaDe(b)).not.toMatch(/total:\s*[\w.]*\.length/)
  })

  it("el conteo real se pide con count: \"exact\", no se estima", () => {
    for (const b of BITACORAS.filter((x) => x.funcion !== "getAdminAuditLog")) {
      expect(consultaDe(b), `${b.consulta} debe pedir el total al servidor`).toContain(
        'count: "exact"'
      )
    }
  })

  it("la bitácora de auditoría no inventa un total que no consultó", () => {
    // La auditoría no pide `count`, así que su `total` viaja como `null` —que es
    // "no se preguntó"— y la UI lo dice. Rellenarlo con `shown` sería la mentira
    // de vuelta.
    const auditoria = BITACORAS.find((b) => b.funcion === "getAdminAuditLog")
    if (!auditoria) throw new Error("la auditoría desapareció del perímetro")
    expect(consultaDe(auditoria)).toMatch(
      /paginaCapada\(\s*\(data \?\? \[\]\) as AuditLogEntry\[\],\s*AUDIT_LOG_PAGE_SIZE\s*\)/
    )
  })
})

describe("un solo número por tope", () => {
  it.each(BITACORAS)("$consulta no esconde un segundo tope sin nombre", (b) => {
    // `getErrorLogs` tenía dos números para una sola cosa: el tope declarado
    // (`200`) y un `100` suelto dentro del `Math.max(...)` que era el que de
    // verdad se aplicaba. Ninguno de los dos se veía desde la UI. La regla: en
    // las líneas que calculan el tope no hay literales de tres dígitos —cada
    // cantidad es un nombre—, así que un tope escondido vuelve a poner esto
    // rojo. Se miran solo esas líneas para no confundir un tope con un código
    // HTTP.
    //
    // La definición de la constante es la única excepción legítima: ahí el
    // número *debe* estar escrito una vez, y de ahí lo lee la UI.
    const fuente = consultaDe(b).replace(/^\s*export const \w+\s*=\s*\d+\s*$/gm, "")
    const sospechosas = fuente
      .split("\n")
      .filter((l) => /\b(limit|cap)\b/i.test(l) || /Math\.(min|max)/.test(l))
      .flatMap((l) => Array.from(l.matchAll(/\b(\d{3,})\b/g)).map((m) => `${m[1]} en: ${l.trim()}`))
    expect(sospechosas, `${b.consulta} tiene cantidades sin nombre`).toEqual([])
  })

  it.each(BITACORAS)("$cap no vive donde no puede vivir", (b) => {
    // Un tope es un valor en tiempo de ejecución, y hay dos módulos que NO
    // pueden declararlo:
    //   - un módulo "use server": un valor exportado invalida el módulo entero
    //     y el fallo aparece a dos archivos de distancia, en el bundler;
    //   - un route handler: exporta endpoints, no números de producto.
    // Las dos cosas se probaron: `ERROR_LOG_CAP` y `ERROR_LOG_PAGE_DEFAULT`
    // vivieron en `src/lib/admin-errors.ts` ("use server") y el build del
    // bundler no lo dijo — lo dijo `src/lib/use-server.contract.test.ts`.
    // La pregunta no es "¿dónde dice la tabla que vive?" sino "¿dónde está?".
    // Se busca la declaración en todo `src/`: si existe en más de un sitio hay
    // dos números para un solo tope; si existe en un módulo que no puede
    // declararla, el fallo lo paga el bundler.
    const declaraciones = dondeSeDeclara(b.cap)
    expect(declaraciones, `${b.cap} debe declararse exactamente una vez`).toEqual([b.capEn])
    for (const ruta of declaraciones) {
      const fuente = leer(ruta)
      const primera = fuente.trimStart().split("\n", 1)[0]?.trim()
      expect(
        primera === '"use server"' || primera === "\x27use server\x27",
        `${b.cap} no puede vivir en un módulo "use server"`
      ).toBe(false)
      expect(ruta.endsWith("/route.ts"), `${b.cap} no puede vivir en un route handler`).toBe(false)
    }
  })

  it("el tope aplicado es el que la UI declara", () => {
    // El techo (`ERROR_LOG_CAP`) y la página por omisión
    // (`ERROR_LOG_PAGE_DEFAULT`) son dos nombres distintos a propósito; el que
    // `paginaCapada` recibe —y por tanto el que la pestaña declara— es el que
    // se aplicó.
    const fuente = sinComentarios(leer("src/lib/admin-errors.ts"))
    expect(fuente).toContain("ERROR_LOG_PAGE_DEFAULT")
    expect(fuente).toMatch(/paginaCapada\([\s\S]*?,\s*limit,\s*count/)
    expect(fuente, "el default no puede volver a ser un literal").not.toMatch(/\?\?\s*\d{2,}/)
  })
})

describe("el vocabulario compartido", () => {
  it("paginaCapada corta por la sonda y no por el largo del array", () => {
    const fuente = leer("src/lib/bitacora.ts")
    expect(fuente).toContain("filas.length > cap")
    expect(fuente).toContain("filas.slice(0, cap)")
  })

  it("resumenDeCorte sabe decir que hay más", () => {
    expect(leer("src/lib/bitacora.ts")).toContain("hay más")
  })
})
