import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join, relative, sep } from "node:path"

/**
 * Contrato del núcleo de fechas (`@/lib/local-date`).
 *
 * Contexto: el checkout ofrecía "Hoy — jueves 17" construyendo el día con
 * setters locales y serializándolo con `toISOString()` (UTC). Entre las 18:00
 * y las 24:00 locales la opción por defecto enviaba el día siguiente al
 * servidor, que interpreta `schedule.date` como día de pared en CDMX. El bug
 * era invisible en horario de oficina y no tenía ninguna prueba.
 *
 * La causa raíz no fue el arreglo puntual sino que hubiera varias autoridades
 * de fecha. Este contrato vigila las dos formas de reintroducirlo:
 *
 *  1. Recortar un instante con el reloj UTC (`toISOString().slice(0, 10)`).
 *  2. Construir una clave de día con la zona del runtime
 *     (`toLocaleDateString("en-CA")` sin `timeZone`, o un `Intl.DateTimeFormat`
 *     sin `timeZone`), que es la zona del servidor en producción.
 *
 * Lo que NO prohíbe: `toISOString()` sin recorte. Los timestamps de auditoría
 * (`created_at`, `sent_at`, `expires_at`…) deben ser UTC por diseño.
 */

const REPO = process.cwd()
const SRC_DIR = join(REPO, "src")

/** Recorte de un instante a fecha / mes / hora de pared usando el reloj UTC. */
const UTC_TRUNCATION_RE =
  /\.toISOString\(\)\s*\.(?:slice|substring|substr)\(\s*0\s*,|\.toISOString\(\)\s*\.split\(\s*["'`]T["'`]\s*\)/g

/** Clave de día "YYYY-MM-DD" construida con la zona del runtime. */
const RUNTIME_ZONE_DAY_RE = /\.toLocaleDateString\(\s*["'`]en-CA["'`]\s*(?!,\s*\{[^}]*timeZone)/g

/** `Intl.DateTimeFormat("en-CA", …)` — hay que comprobar que fija `timeZone`. */
const INTL_EN_CA_RE = /Intl\.DateTimeFormat\(\s*["'`]en-CA["'`]\s*,/g

type Allowance = { path: string; max: number; reason: string }

/**
 * Recortes UTC tolerados. Cada entrada es deuda consciente, no un olvido:
 * si se puede eliminar una, se elimina la entrada.
 */
const UTC_TRUNCATION_ALLOWED: Allowance[] = [
  {
    path: "src/lib/order-filters.ts",
    max: 1,
    reason:
      "isValidIsoDate valida por round-trip: exige que la fecha reconstruida en UTC coincida con el texto recibido. Es un validador de formato, no un día de negocio.",
  },
  {
    path: "src/lib/price-index.ts",
    max: 1,
    reason:
      "getIsoWeekMonday usa Date.UTC/getUTCDay/setUTCDate de forma consistente. Es la clave de semana ISO que consume wallet-progress; cambiar la zona alteraría el modelo de lealtad.",
  },
  {
    path: "src/app/admin/productos/page.tsx",
    max: 1,
    reason:
      "reportTo alimenta el filtro `created_at` de sales-report, que el servidor aplica en UTC (afirmado en route.test.ts). Pedir el día local recortaría las ventas de la tarde.",
  },
  {
    path: "src/app/panel/foodos/caja/page.tsx",
    max: 1,
    reason:
      "Nombre del CSV de cortes. Pendiente de migrar a dayKeyOf; el archivo está en vuelo en otra sesión y no se toca desde aquí para no pisar cambios.",
  },
]

function walkSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkSources(abs, acc)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue
    acc.push(relPath(abs))
  }
  return acc
}

/** Rutas siempre con `/` para que el contrato sea determinista entre plataformas. */
function relPath(abs: string): string {
  return relative(REPO, abs).split(sep).join("/")
}

function read(rel: string): string {
  return readFileSync(join(REPO, rel), "utf8")
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split("\n").length
}

function findAll(source: string, re: RegExp): { line: number; text: string }[] {
  const lines = source.split("\n")
  return [...source.matchAll(re)].map((m) => ({
    line: lineOf(source, m.index),
    text: (lines[lineOf(source, m.index) - 1] ?? "").trim(),
  }))
}

describe("núcleo de fechas · recortes UTC", () => {
  it("no hay ningún recorte de fecha en UTC fuera de los sitios declarados", () => {
    const allowed = new Map(UTC_TRUNCATION_ALLOWED.map((a) => [a.path, a]))
    const offenders: string[] = []

    for (const rel of walkSources(SRC_DIR)) {
      const hits = findAll(read(rel), UTC_TRUNCATION_RE)
      if (hits.length === 0) continue

      const permitido = allowed.get(rel)
      if (!permitido) {
        offenders.push(
          `${rel} (${hits.length}) → L${hits.map((h) => h.line).join(", L")}: ${hits[0]?.text}`
        )
        continue
      }
      if (hits.length > permitido.max) {
        offenders.push(
          `${rel} (${hits.length} > ${permitido.max} permitidos) → L${hits
            .map((h) => h.line)
            .join(", L")}`
        )
      }
    }

    expect(
      offenders,
      "Usa dayKeyOf()/localDateParts() de @/lib/local-date. Si el recorte en UTC es " +
        "intencional, añádelo a UTC_TRUNCATION_ALLOWED con el motivo."
    ).toEqual([])
  })

  it("cada excepción declara un motivo y un tope de ocurrencias", () => {
    for (const entry of UTC_TRUNCATION_ALLOWED) {
      expect(entry.reason.length, `${entry.path} necesita un motivo explicativo`).toBeGreaterThan(40)
      expect(entry.max, `${entry.path} necesita un tope >= 1`).toBeGreaterThanOrEqual(1)
      expect(entry.path.startsWith("src/"), `${entry.path} debe ser una ruta relativa a src/`).toBe(
        true
      )
    }
  })

  it("sigue sin prohibir los timestamps UTC legítimos", () => {
    // Guarda contra un contrato demasiado amplio: un toISOString() sin recorte
    // es la representación correcta de un instante y debe seguir permitido.
    expect(UTC_TRUNCATION_RE.test("const createdAt = new Date().toISOString()")).toBe(false)
    expect(UTC_TRUNCATION_RE.test("expires_at: new Date(Date.now() + 1000).toISOString()")).toBe(
      false
    )
  })
})

describe("núcleo de fechas · clave de día", () => {
  it('no queda ningún toLocaleDateString("en-CA") que dependa de la zona del runtime', () => {
    const offenders: string[] = []

    for (const rel of walkSources(SRC_DIR)) {
      const source = read(rel)
      const hits = findAll(source, RUNTIME_ZONE_DAY_RE)
      if (hits.length > 0) {
        offenders.push(`${rel} → L${hits.map((h) => h.line).join(", L")}: ${hits[0]?.text}`)
      }
    }

    expect(
      offenders,
      "El día del negocio es el del restaurante. Usa dayKeyOf(DEFAULT_TIMEZONE) en vez de " +
        "la zona del navegador o del servidor."
    ).toEqual([])
  })

  it("todo formateador Intl en-CA fija timeZone explícitamente", () => {
    const offenders: string[] = []

    for (const rel of walkSources(SRC_DIR)) {
      const source = read(rel)
      for (const match of source.matchAll(INTL_EN_CA_RE)) {
        // Las opciones pueden estar en la misma línea o en las siguientes.
        const tail = source.slice(match.index, match.index + 400)
        if (!/timeZone/.test(tail)) {
          offenders.push(`${rel} → L${lineOf(source, match.index)}: ${match[0]}`)
        }
      }
    }

    expect(
      offenders,
      "Un Intl.DateTimeFormat('en-CA') sin timeZone lee el día del runtime — es la " +
        "reimplementación de localDay que se eliminó en esta ronda."
    ).toEqual([])
  })
})

describe("núcleo de fechas · una sola autoridad", () => {
  it("getNextDays se define únicamente en el núcleo de calendario", () => {
    const definers = walkSources(SRC_DIR).filter((rel) =>
      /(?:export\s+)?(?:function|const)\s+getNextDays\b/.test(read(rel))
    )
    expect(definers).toEqual(["src/lib/delivery-days.ts"])
  })

  it("checkout-shared reexporta el calendario en vez de reimplementarlo", () => {
    const source = read("src/components/checkout/checkout-shared.tsx")
    expect(source).toContain('export { getNextDays } from "@/lib/delivery-days"')
    expect(source).not.toMatch(/function\s+getNextDays/)
    expect(source).not.toMatch(/\.toISOString\s*\(/)
  })

  it("delivery-days ancla en el día local, nunca en el reloj UTC", () => {
    const source = read("src/lib/delivery-days.ts")
    expect(source).toContain("dayKeyOf(")
    expect(source).not.toMatch(/\.toISOString\s*\(/)
  })

  it("el orquestador de IA no vuelve a definir un día local propio", () => {
    const source = read("src/lib/foodos-ai-wa/orchestrator.ts")
    expect(source).not.toMatch(/function\s+localDay\b/)
    expect(source).not.toMatch(/\.toLocaleDateString\s*\(/)
  })

  it("el servidor sigue leyendo schedule.date como día de pared en CDMX", () => {
    // Si esto cambia, el calendario del cliente deja de ser correcto y la
    // fecha de entrega vuelve a desplazarse un día.
    expect(read("src/app/api/orders/route.ts")).toContain(":00-06:00")
  })

  it("el núcleo expone la autoridad de día y el inverso de datetime-local", () => {
    const source = read("src/lib/local-date.ts")
    expect(source).toContain("export function dayKeyOf(")
    expect(source).toContain("export function toDatetimeLocalValue(")
    expect(source).toContain("export const DEFAULT_TIMEZONE")
  })
})
