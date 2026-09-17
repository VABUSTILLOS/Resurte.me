import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

/**
 * Contrato de los módulos `"use server"`: **solo pueden exportar funciones
 * asíncronas y tipos**.
 *
 * Contexto (Ronda 7, F4): al añadir `src/lib/comercializacion/actions/etiquetas.ts`
 * con un `export const BULK_TAG_LIMIT = 200`, el build de Turbopack falló con
 * `The export setProspectTags was not found in module …/actions.ts`. La causa no
 * estaba donde apuntaba el error: un valor exportado en un módulo `"use server"`
 * **invalida el módulo entero**, y Turbopack lo trata como "unexpected export *
 * used with module … which has no exports". El `export *` del barrel
 * (`comercializacion/actions.ts`) dejaba de resolver, y el síntoma aparecía a dos
 * archivos de distancia.
 *
 * Ni `tsc` ni ESLint lo detectan: es una regla del bundler. Este contrato la
 * convierte en un test, que es donde se ve.
 *
 * Permitido: `export async function`, `export default async function`,
 * `export type`, `export interface`, `export declare`, y `export * from` (el
 * módulo reexportado se valida por su cuenta). Todo lo demás —`const`, `let`,
 * `class`, `enum`, y funciones no asíncronas— es una violación.
 */

const REPO = process.cwd()
const SRC = join(REPO, "src")
const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist"])

/** Export que NO es válido dentro de un módulo `"use server"`. */
const BAD_EXPORT_RE =
  /^export\s+(?!async\s+function\b|default\s+async\s+function\b|type\b|interface\b|declare\b|\*\s*from\b)([^\n]*)/gm

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full)
  }
  return out
}

/** Primer enunciado del archivo, sin comentarios ni espacios por delante. */
function isUseServerModule(source: string): boolean {
  const first = source.trimStart().split("\n", 1)[0]?.trim() ?? ""
  return first === '"use server"' || first === "'use server'"
}

const modules = walk(SRC)
  .map((path) => ({ path, rel: relative(REPO, path), source: readFileSync(path, "utf8") }))
  .filter((m) => isUseServerModule(m.source))

describe("contrato de los módulos \"use server\"", () => {
  it("el barrido encuentra los módulos del proyecto", () => {
    // Si el walk se rompe (o alguien mueve `src/`), el resto del contrato pasaría
    // en vacío. Este test es el que impide ese falso verde.
    expect(modules.length).toBeGreaterThan(10)
  })

  it("ningún módulo \"use server\" exporta un valor en tiempo de ejecución", () => {
    const offenders: string[] = []
    for (const mod of modules) {
      for (const match of mod.source.matchAll(BAD_EXPORT_RE)) {
        const line = mod.source.slice(0, match.index).split("\n").length
        offenders.push(`${mod.rel}:${line} → ${match[0].trim().slice(0, 80)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("la propia comprobación detecta el caso que la motivó", () => {
    // El bug original, literal: un `export const` junto a la función asíncrona.
    const regressed = [
      '"use server"',
      "",
      "export const BULK_TAG_LIMIT = 200",
      "",
      "export async function setProspectTags(id: number): Promise<void> {",
      "  void id",
      "}",
      "",
    ].join("\n")
    const found = [...regressed.matchAll(BAD_EXPORT_RE)].map((m) => m[0].trim())
    expect(found).toEqual(["export const BULK_TAG_LIMIT = 200"])

    // Y el módulo sano, sin falsos positivos.
    const healthy = [
      '"use server"',
      "",
      "export interface Row { id: number }",
      "export type Alias = Row",
      "export async function load(): Promise<Row[]> { return [] }",
      'export * from "./other"',
      "",
    ].join("\n")
    expect([...healthy.matchAll(BAD_EXPORT_RE)]).toEqual([])
  })
})
