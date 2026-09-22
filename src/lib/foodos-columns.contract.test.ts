import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import {
  PRIVATE_FOODOS_MENU_ITEM_COLUMNS,
  PRIVATE_FOODOS_RESTAURANT_COLUMNS,
  PUBLIC_FOODOS_MENU_ITEM_COLUMNS,
  PUBLIC_FOODOS_MENU_ITEM_SELECT,
  PUBLIC_FOODOS_RESTAURANT_COLUMNS,
  PUBLIC_FOODOS_RESTAURANT_SELECT,
} from "@/lib/foodos-columns"

/**
 * Contrato SQL ↔ código de los privilegios de columna de FoodOS.
 *
 * `00193` cierra el mismo defecto que `00192` cerró en `products`: las
 * políticas RLS de `foodos_restaurants` y `foodos_menu_items` son de **fila**
 * (`status = 'active'`), y RLS no filtra columnas, así que con la llave
 * anónima se leía la comisión, la cuenta de Stripe y el costo del menú de
 * cualquier restaurante activo.
 *
 * El arreglo vive en dos mitades que tienen que decir lo mismo:
 *
 *   1. `supabase/migrations/00193_foodos_column_privileges.sql` — el `GRANT
 *      SELECT (…)` a `anon` y `authenticated`.
 *   2. `src/lib/foodos-columns.ts` — lo que el código pide.
 *
 * Si divergen, PostgREST falla la consulta **entera** con `42501` (expande el
 * select a columnas de su caché) y la tienda o el panel se quedan en blanco.
 *
 * Sin base de datos, el contrato se lee como **texto**, igual que
 * `db-function-grants.contract.test.ts`. La comprobación contra producción la
 * hace el `$guard$` de la propia migración, que falla ruidoso.
 */

const REPO = process.cwd()
const MIGRATION = join(REPO, "supabase", "migrations", "00193_foodos_column_privileges.sql")

/** Quita comentarios para no confundir la prosa (que nombra columnas) con SQL. */
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")
}

function leerMigracion(): string {
  return readFileSync(MIGRATION, "utf8")
}

/** Columnas del `GRANT SELECT ( … ) ON <tabla> TO <roles>` pedido. */
function columnasConcedidas(sql: string, tabla: string, roles: RegExp): string[] {
  const limpio = sinComentarios(sql)
  const re = new RegExp(
    `GRANT\\s+SELECT\\s*\\(([^)]*)\\)\\s*ON\\s+public\\.${tabla}\\s+TO\\s+${roles.source}`,
    "i"
  )
  const m = limpio.match(re)
  if (!m || !m[1]) return []
  return m[1]
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .sort()
}

const ROLES_ANON = /anon(?!\s*,\s*authenticated)/i
const ROLES_AMBOS = /anon\s*,\s*authenticated/i

/**
 * Un archivo es "de servicio" si construye el cliente con
 * `createServiceClient()` **o** lo declara como parámetro tipado `ServiceClient`
 * (`src/lib/stripe-connect.ts` lo recibe así: la lectura de los `stripe_*` vive
 * ahí y quien la llama le pasa el cliente de servicio). `service_role` no pasa
 * por los privilegios de `anon`/`authenticated`, así que leer ahí es correcto.
 */
function esDeServicio(src: string): boolean {
  return src.includes("createServiceClient") || /:\s*ServiceClient\b/.test(src)
}

function archivosFuente(dir = join(REPO, "src")): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...archivosFuente(full))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

describe("contrato de privilegios de columna de FoodOS (00193)", () => {
  it("encuentra la migración y le extrae los dos GRANT", () => {
    const sql = leerMigracion()
    expect(columnasConcedidas(sql, "foodos_restaurants", ROLES_ANON).length).toBeGreaterThan(0)
    expect(columnasConcedidas(sql, "foodos_menu_items", ROLES_AMBOS).length).toBeGreaterThan(0)
  })

  it("la lista de restaurantes del SQL es la del código", () => {
    const concedidas = columnasConcedidas(leerMigracion(), "foodos_restaurants", ROLES_ANON)
    expect(concedidas).toEqual([...PUBLIC_FOODOS_RESTAURANT_COLUMNS].sort())
  })

  it("la lista de platillos del SQL es la del código", () => {
    const concedidas = columnasConcedidas(leerMigracion(), "foodos_menu_items", ROLES_AMBOS)
    expect(concedidas).toEqual([...PUBLIC_FOODOS_MENU_ITEM_COLUMNS].sort())
  })

  it("ninguna columna privada se coló en los GRANT", () => {
    const sql = leerMigracion()
    const r = new Set(columnasConcedidas(sql, "foodos_restaurants", ROLES_ANON))
    const i = new Set(columnasConcedidas(sql, "foodos_menu_items", ROLES_AMBOS))
    const coladas = [
      ...PRIVATE_FOODOS_RESTAURANT_COLUMNS.filter((c) => r.has(c)).map((c) => `restaurants.${c}`),
      ...PRIVATE_FOODOS_MENU_ITEM_COLUMNS.filter((c) => i.has(c)).map((c) => `menu_items.${c}`),
    ]
    expect(coladas, `no deben ser legibles por anon: ${coladas.join(", ")}`).toEqual([])
  })

  it("`user_id` sigue siendo pública: 67 políticas RLS la necesitan para evaluarse", () => {
    // No es un descuido. Las políticas de dueño (`auth.uid() = user_id`, o un
    // `EXISTS` que entra a `foodos_restaurants` por `user_id`) están declaradas
    // con rol `{public}`; para anon `auth.uid()` es NULL, así que nunca dan
    // filas, pero **igual se evalúan** y evaluarlas exige leer la columna. La
    // primera versión de 00193 la revocaba y la tienda se quedó sin menú con
    // `42501 permission denied for table foodos_restaurants`.
    const publicas = new Set<string>(PUBLIC_FOODOS_RESTAURANT_COLUMNS)
    expect(publicas.has("user_id"), "user_id debe seguir en la lista pública").toBe(true)

    const anon = columnasConcedidas(leerMigracion(), "foodos_restaurants", ROLES_ANON)
    expect(anon, "el GRANT a anon debe incluir user_id").toContain("user_id")

    const auth = columnasConcedidas(leerMigracion(), "foodos_restaurants", /authenticated/i)
    expect(auth, "authenticated también la necesita").toContain("user_id")
  })

  it("ninguna política RLS de FoodOS referencia una columna privada", () => {
    // Si una política leyera `platform_fee_percent` o `cost`, revocárselos a
    // anon rompería la consulta con 42501 igual que pasó con `user_id`. Hoy no
    // pasa; esto avisa el día que alguien escriba una política así.
    const migraciones = readdirSync(join(REPO, "supabase", "migrations")).filter((f) =>
      /^00(1[0-9]{2}|0[0-9]{2})_.*\.sql$/.test(f)
    )
    const privadas = [
      ...PRIVATE_FOODOS_RESTAURANT_COLUMNS,
      ...PRIVATE_FOODOS_MENU_ITEM_COLUMNS,
    ]
    const culpables: string[] = []
    for (const archivo of migraciones) {
      const sql = readFileSync(join(REPO, "supabase", "migrations", archivo), "utf8")
      if (!/CREATE\s+POLICY|ALTER\s+POLICY/i.test(sql)) continue
      // Solo el cuerpo de las políticas, no los comentarios ni los GRANT.
      const politicas = sql.match(/CREATE\s+POLICY[\s\S]*?;/gi) ?? []
      for (const bloque of politicas) {
        for (const c of privadas) {
          if (new RegExp(`\\b${c}\\b`).test(bloque)) culpables.push(`${archivo}: ${c}`)
        }
      }
    }
    expect(culpables, `una política lee una columna privada: ${culpables.join(", ")}`).toEqual([])
  })

  it("los datos de transferencia siguen siendo públicos (los pinta el storefront)", () => {
    // No son una fuga: el comensal paga por SPEI a esa cuenta. Si alguien los
    // «limpia» por parecer sensibles, rompe el cobro por transferencia.
    const publicas = new Set<string>(PUBLIC_FOODOS_RESTAURANT_COLUMNS)
    for (const c of ["transfer_clabe", "transfer_bank", "transfer_beneficiary"]) {
      expect(publicas.has(c), `${c} debe seguir pública`).toBe(true)
    }
  })

  it("revoca el SELECT de tabla antes de conceder columnas", () => {
    // El orden importa **por tabla**: con el privilegio de tabla en pie, el
    // GRANT de columna de esa misma tabla no restringe nada (es el tropiezo que
    // dejó escrito 00160).
    const limpio = sinComentarios(leerMigracion())
    for (const tabla of ["foodos_restaurants", "foodos_menu_items"]) {
      const revoke = limpio.search(
        new RegExp(`REVOKE\\s+SELECT\\s+ON\\s+public\\.${tabla}\\s+FROM\\s+anon`, "i")
      )
      const grant = limpio.search(
        new RegExp(`GRANT\\s+SELECT\\s*\\([^)]*\\)\\s*ON\\s+public\\.${tabla}\\s+TO`, "i")
      )
      expect(revoke, `falta el REVOKE SELECT de ${tabla}`).toBeGreaterThanOrEqual(0)
      expect(grant, `falta el GRANT SELECT (…) de ${tabla}`).toBeGreaterThanOrEqual(0)
      expect(revoke, `en ${tabla} el GRANT va antes que el REVOKE`).toBeLessThan(grant)
    }
  })

  it("no revoca la escritura: el dueño sí edita su menú", () => {
    // `00160` acotó el UPDATE de `foodos_restaurants` a 18 columnas. Revocar
    // aquí INSERT/UPDATE/DELETE desharía ese trabajo y rompería el panel.
    const limpio = sinComentarios(leerMigracion())
    const escrituras = limpio.match(/REVOKE\s+(INSERT|UPDATE|DELETE)[^;]*ON\s+public\.foodos_/gi)
    expect(escrituras, `00193 no debe revocar escritura: ${escrituras?.join(" | ")}`).toBeNull()
  })

  it("ningún lector sin service_role pide una columna privada", () => {
    const privadas = new Set<string>([
      ...PRIVATE_FOODOS_RESTAURANT_COLUMNS,
      ...PRIVATE_FOODOS_MENU_ITEM_COLUMNS,
    ])
    const fugas: string[] = []
    for (const abs of archivosFuente()) {
      const rel = abs.slice(REPO.length + 1)
      const src = readFileSync(abs, "utf8")
      if (!/\.from\(\s*"foodos_(restaurants|menu_items)"\s*\)/.test(src)) continue
      if (esDeServicio(src)) continue
      const re = /\.from\(\s*"(foodos_(?:restaurants|menu_items))"\s*\)\s*\.select\(\s*"([^"]*)"/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src)) !== null) {
        const cols = (m[2] ?? "").split(",").map((c) => c.trim().toLowerCase())
        for (const c of cols) {
          if (privadas.has(c)) fugas.push(`${rel}: ${m[1]}.${c}`)
        }
      }
    }
    expect(fugas, `lectores sin service_role pidiendo columnas privadas:\n${fugas.join("\n")}`).toEqual([])
  })

  it("el storefront público no vuelve a pedir select(\"*\")", () => {
    const src = readFileSync(join(REPO, "src/lib/foodos-public.ts"), "utf8")
    const estrella = /\.from\(\s*"foodos_(restaurants|menu_items)"\s*\)\s*\.select\(\s*"\*"/.test(src)
    expect(estrella, "foodos-public.ts volvió a pedir select(\"*\")").toBe(false)
  })

  it("los SELECT son literales para que supabase-js infiera la fila", () => {
    // Con un select construido en runtime (`array.join(", ")`) supabase-js cae
    // a `GenericStringError` y cada acceso a `.id` deja de compilar. El `as
    // const` es lo que mantiene la inferencia; sin él, el tipo se pierde.
    const src = readFileSync(join(REPO, "src/lib/foodos-columns.ts"), "utf8")
    expect(/PUBLIC_FOODOS_RESTAURANT_SELECT\s*=\s*\n?\s*"[^"]+" as const/.test(src)).toBe(true)
    expect(/PUBLIC_FOODOS_MENU_ITEM_SELECT\s*=\s*\n?\s*"[^"]+" as const/.test(src)).toBe(true)
  })

  it("las constantes derivan del literal, sin duplicar la lista", () => {
    expect(PUBLIC_FOODOS_RESTAURANT_SELECT.split(", ")).toEqual([...PUBLIC_FOODOS_RESTAURANT_COLUMNS])
    expect(PUBLIC_FOODOS_MENU_ITEM_SELECT.split(", ")).toEqual([...PUBLIC_FOODOS_MENU_ITEM_COLUMNS])
  })
})
