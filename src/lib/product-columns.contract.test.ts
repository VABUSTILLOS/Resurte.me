import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import {
  PRIVATE_PRODUCT_COLUMNS,
  PUBLIC_PRODUCT_COLUMNS,
  PUBLIC_PRODUCT_SELECT,
} from "@/lib/product-columns"
import { REORDER_CATALOG_COLUMNS } from "@/lib/order-reorder"

/**
 * Contrato SQL ↔ código de los privilegios de columna de `products`.
 *
 * El agujero que cierra `00192` no era un descuido de código: era un
 * **privilegio**. `anon` tenía `SELECT` a nivel de tabla sobre `products` y la
 * política RLS es `USING (true)`, así que `GET /rest/v1/products?select=cost`
 * devolvía el costo de compra de los 475 productos con la llave que viaja en el
 * navegador. RLS filtra filas; de columnas se encarga el privilegio.
 *
 * El arreglo vive en **dos mitades que tienen que decir lo mismo**:
 *
 *   1. `supabase/migrations/00192_products_column_privileges.sql` — qué
 *      columnas concede `GRANT SELECT (…)` a `anon` y `authenticated`.
 *   2. `src/lib/product-columns.ts` — qué columnas pide el código. PostgREST
 *      expande `select("*")` a todas las columnas de su caché, así que si el
 *      código pide una que no está concedida la consulta **entera** falla con
 *      `42501` y la tienda se queda sin catálogo.
 *
 * Ninguna de las dos mitades avisa si la otra se mueve: añadir una columna a
 * `products`, concederla y olvidarla en el `select` no rompe nada hasta que
 * alguien abre la tienda. Este contrato es el que avisa.
 *
 * Sin base de datos, el contrato se lee como **texto**, igual que
 * `db-function-grants.contract.test.ts`. Límite aceptado y explícito: esto
 * vigila la forma de los archivos, no el `relacl` real. La comprobación contra
 * producción la hace el `$guard$` de la propia migración, que falla ruidoso.
 */

const REPO = process.cwd()
const MIGRATION = join(REPO, "supabase", "migrations", "00192_products_column_privileges.sql")

/**
 * Archivos que leen `products` con un cliente que **no** es `service_role`.
 * Se listan para que el caso "alguien los borra del barrido" sea visible.
 */
const CONSUMIDORES_PUBLICOS = [
  "src/lib/data.ts",
  "src/lib/catalog.ts",
  "src/components/shop/repeat-order-button.tsx",
  "src/app/api/orders/route.ts",
]

/**
 * Excepciones explícitas: archivos que leen columnas privadas y **no** arman el
 * cliente ellos mismos, lo reciben por parámetro, así que la heurística de
 * `esDeServicio` no los ve.
 *
 * La excepción se **verifica**: cada llamador declarado tiene que construir el
 * cliente con `createServiceClient()`. Si un llamador se cambia al cliente de
 * sesión, esta prueba falla y la excepción deja de valer — no sirve para tapar
 * una fuga real.
 */
const EXCEPCIONES_DE_SERVICIO: Record<string, { motivo: string; llamadores: string[] }> = {
  "src/lib/trash.ts": {
    motivo:
      "recibe el SupabaseClient por parámetro; lee deleted_at para purgar la papelera de productos",
    llamadores: [
      "src/app/api/admin/products/purge-trash/route.ts",
      "src/app/api/cron/daily/route.ts",
    ],
  },
}

/**
 * Un archivo es "de servicio" —y por tanto puede leer columnas privadas— si
 * vive bajo `src/app/admin/`, bajo `src/app/api/admin/` o construye el cliente
 * con `createServiceClient()`. `service_role` no pasa por los privilegios de
 * `anon`/`authenticated`, así que ahí leer `cost` es correcto y deliberado.
 */
function esDeServicio(archivo: string, src: string): boolean {
  return (
    archivo.includes("/admin/") ||
    archivo.includes("/api/admin/") ||
    src.includes("createServiceClient")
  )
}

/** Todos los `.ts`/`.tsx` de `src/`, sin pruebas ni tipos. */
function archivosFuente(dir = join(REPO, "src")): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...archivosFuente(full))
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/** Quita comentarios de línea y de bloque para no confundir prosa con SQL. */
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")
}

function leerMigracion(): string {
  return readFileSync(MIGRATION, "utf8")
}

/**
 * Columnas del `GRANT SELECT ( … ) ON public.products TO anon, authenticated`.
 * Se ancla en `ON public.products` para no capturar el `GRANT` de `service_role`.
 */
function columnasConcedidas(sql: string): string[] {
  const limpio = sinComentarios(sql)
  const m = limpio.match(
    /GRANT\s+SELECT\s*\(([^)]*)\)\s*ON\s+public\.products\s+TO\s+anon\s*,\s*authenticated/i
  )
  if (!m) return []
  const grupo = m[1]
  if (!grupo) return []
  return grupo
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .sort()
}

/** Columnas de un `.select("a, b, c")` sobre products, en un archivo dado. */
function columnasSeleccionadas(archivo: string): string[][] {
  const src = readFileSync(join(REPO, archivo), "utf8")
  const out: string[][] = []
  const re = /\.from\(\s*"products"\s*\)\s*\.select\(\s*"([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const grupo = m[1]
    if (!grupo) continue
    out.push(
      grupo
        .split(",")
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean)
        .sort()
    )
  }
  return out
}

describe("contrato de privilegios de columna de products (00192)", () => {
  it("encuentra la migración y le extrae el GRANT de columnas", () => {
    const cols = columnasConcedidas(leerMigracion())
    expect(cols.length, "00192 no tiene un GRANT SELECT (…) ON public.products TO anon, authenticated").toBeGreaterThan(0)
  })

  it("la lista del SQL es exactamente la del código", () => {
    expect(columnasConcedidas(leerMigracion())).toEqual([...PUBLIC_PRODUCT_COLUMNS].sort())
  })

  it("ninguna columna privada se coló en el GRANT", () => {
    const concedidas = new Set(columnasConcedidas(leerMigracion()))
    const coladas = PRIVATE_PRODUCT_COLUMNS.filter((c) => concedidas.has(c))
    expect(coladas, `estas columnas no deben ser legibles por anon: ${coladas.join(", ")}`).toEqual([])
  })

  it("revoca el SELECT de tabla antes de conceder columnas", () => {
    // El orden importa: con el privilegio de tabla en pie, el GRANT de columna
    // no restringe nada (es el tropiezo que dejó escrito 00160).
    const limpio = sinComentarios(leerMigracion())
    const revoke = limpio.search(/REVOKE\s+[^;]*SELECT[^;]*ON\s+public\.products\s+FROM\s+anon/i)
    const grant = limpio.search(/GRANT\s+SELECT\s*\(/i)
    expect(revoke, "falta el REVOKE SELECT … FROM anon").toBeGreaterThanOrEqual(0)
    expect(grant, "falta el GRANT SELECT (…)").toBeGreaterThanOrEqual(0)
    expect(revoke).toBeLessThan(grant)
  })

  it("cada columna que el código público pide está concedida", () => {
    const concedidas = new Set(columnasConcedidas(leerMigracion()))
    const faltantes: string[] = []
    for (const archivo of CONSUMIDORES_PUBLICOS) {
      for (const cols of columnasSeleccionadas(archivo)) {
        for (const c of cols) {
          if (!concedidas.has(c)) faltantes.push(`${archivo}: ${c}`)
        }
      }
    }
    expect(faltantes, `el código pide columnas sin privilegio (42501):\n${faltantes.join("\n")}`).toEqual([])
  })

  it("ningún lector público pide una columna privada, en todo src/", () => {
    // El barrido general: si alguien añade mañana
    // `supabase.from("products").select("cost, price")` en una ruta con el
    // cliente de sesión, esto lo nombra en vez de esperar a que alguien mire
    // la respuesta JSON.
    const privadas = new Set<string>(PRIVATE_PRODUCT_COLUMNS)
    const fugas: string[] = []
    for (const abs of archivosFuente()) {
      const rel = abs.slice(REPO.length + 1)
      const src = readFileSync(abs, "utf8")
      if (!/\.from\(\s*"products"\s*\)/.test(src)) continue
      if (esDeServicio(rel, src)) continue
      if (rel in EXCEPCIONES_DE_SERVICIO) continue
      for (const cols of columnasSeleccionadas(rel)) {
        for (const c of cols) {
          if (privadas.has(c)) fugas.push(`${rel}: ${c}`)
        }
      }
    }
    expect(fugas, `lectores sin service_role pidiendo columnas privadas:\n${fugas.join("\n")}`).toEqual([])
  })

  it("cada excepción de servicio sigue teniendo llamadores con service_role", () => {
    for (const [archivo, { motivo, llamadores }] of Object.entries(EXCEPCIONES_DE_SERVICIO)) {
      expect(() => readFileSync(join(REPO, archivo)), `${archivo} ya no existe (${motivo})`).not.toThrow()
      expect(llamadores.length, `${archivo} no declara llamadores`).toBeGreaterThan(0)
      for (const llamador of llamadores) {
        const src = readFileSync(join(REPO, llamador), "utf8")
        expect(
          src.includes("createServiceClient"),
          `${llamador} dejó de usar createServiceClient: la excepción de ${archivo} ya no se sostiene`
        ).toBe(true)
      }
    }
  })

  it("los cuatro consumidores públicos siguen leyendo products", () => {
    // Si un refactor vacía el barrido (renombra el archivo, cambia a RPC), la
    // prueba de arriba pasaría sin comprobar nada. Esto lo impide.
    for (const archivo of CONSUMIDORES_PUBLICOS) {
      const src = readFileSync(join(REPO, archivo), "utf8")
      expect(/\.from\(\s*"products"\s*\)/.test(src), `${archivo} ya no lee products`).toBe(true)
    }
  })

  it("el catálogo público no vuelve a pedir select(\"*\") sobre products", () => {
    // `*` se expande a todas las columnas de la caché de PostgREST, incluidas
    // las privadas: la consulta falla entera y la tienda se queda vacía.
    const src = readFileSync(join(REPO, "src/lib/data.ts"), "utf8")
    const estrella = /\.from\(\s*"products"\s*\)\s*\.select\(\s*"\*"/.test(src)
    expect(estrella, "src/lib/data.ts volvió a pedir products con select(\"*\")").toBe(false)
  })

  it("la constante de TS cubre la lista del reordenar-pedido", () => {
    const publicas = new Set<string>(PUBLIC_PRODUCT_COLUMNS)
    const reorder = REORDER_CATALOG_COLUMNS.split(",").map((c) => c.trim().toLowerCase())
    const fuera = reorder.filter((c) => !publicas.has(c))
    expect(fuera, `REORDER_CATALOG_COLUMNS pide columnas privadas: ${fuera.join(", ")}`).toEqual([])
  })

  it("PUBLIC_PRODUCT_SELECT es la lista, sin duplicados ni huecos", () => {
    const partes = PUBLIC_PRODUCT_SELECT.split(",").map((c) => c.trim())
    expect(partes).toEqual([...PUBLIC_PRODUCT_COLUMNS])
    expect(new Set(partes).size).toBe(partes.length)
  })
})
