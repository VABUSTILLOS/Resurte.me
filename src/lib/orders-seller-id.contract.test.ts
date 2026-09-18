import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Contrato de `orders.seller_id` — la columna que existió siete meses sin que
 * nadie la escribiera, y que la migración `00189` eliminó.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * Por qué hace falta congelar una eliminación
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `00052` añadió `orders.seller_id` (con FK a `profiles` e índice propio) para
 * "atribución de pedidos asistidos por el vendedor". Ninguna ruta la escribió
 * jamás y ninguna la leyó. Su único efecto real y medible fue **crear una
 * segunda FK `orders → profiles`**, que hizo que PostgREST rechazara todos los
 * embeds sin hint con `PGRST201` — el bug que obligó a introducir
 * `ORDERS_PROFILE_FK` y que está documentado en `src/lib/admin/order-selects.ts`.
 *
 * El modo de fallo que este contrato previene no es "alguien borra la columna":
 * es **volver a añadirla**. Una columna de atribución que siempre vale NULL no
 * se lee como un error, se lee como una promesa: la siguiente pantalla que la
 * use como si tuviera datos devolverá cero en silencio, y ese cero silencioso
 * es exactamente lo que `00155` se molestó en evitar cuando eligió resolver la
 * atribución por `crm_prospects.seller_id → user_id → orders.user_id`.
 *
 * Cómo romperlo (cualquiera de estos rompe este test):
 *
 *   1. Añadir en una migración nueva un `ALTER TABLE … orders … ADD COLUMN …
 *      seller_id`.
 *   2. Renombrar o vaciar `00189`, o quitarle el `IF EXISTS` (dejaría de ser
 *      re-ejecutable y el `db push` abortaría con `42703`).
 *   3. Meter en `00189` cualquier otra cosa que no sea este `DROP COLUMN`.
 *   4. Apuntar `ORDERS_PROFILE_FK` a la FK eliminada. El embed no fallaría
 *      —PostgREST resuelve el hint contra la relación nombrada— pero el nombre
 *      mentiría sobre qué relación se está pidiendo, que es justo el tipo de
 *      mentira silenciosa que este repo ya se comió una vez.
 *
 * Lo que este contrato **no** vigila: que el código lea la columna. No hace
 * falta — la columna no existe y PostgREST responde `42703` con nombre y todo,
 * que es un error ruidoso. El riesgo real era el de arriba: reintroducirla.
 */

const REPO = process.cwd()
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations")

/** La migración que elimina la columna. */
const DROP_MIGRATION = "00189_drop_orders_seller_id.sql"
/** La migración que la creó, que debe seguir intacta como historia. */
const CREATE_MIGRATION = "00052_comercializacion.sql"

const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort()

/** `00052` → `"00052"`. */
function versionDe(file: string): string {
  return /^(\d{5})_/.exec(file)?.[1] ?? ""
}

/**
 * Quita comentarios. Sin esto, los tres comentarios históricos que citan la
 * columna (`00052`, `00071`, `00155`) se leerían como si fueran SQL.
 */
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")
}

type Columna = { tabla: string; columna: string }

/**
 * `ALTER TABLE [IF EXISTS] [ONLY] [public.]x ADD COLUMN [IF NOT EXISTS] y`.
 * Devuelve el par (tabla, columna) en minúsculas.
 */
function columnasAñadidas(sql: string): Columna[] {
  const re =
    /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\s*\.\s*)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))/gi
  const out: Columna[] = []
  for (const m of sql.matchAll(re)) {
    out.push({ tabla: (m[1] ?? m[2] ?? "").toLowerCase(), columna: (m[3] ?? m[4] ?? "").toLowerCase() })
  }
  return out
}

/** Igual que `columnasAñadidas`, pero para `DROP COLUMN`. */
function columnasEliminadas(sql: string): Columna[] {
  const re =
    /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\s*\.\s*)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(?:"([^"]+)"|([a-z_][a-z0-9_]*))/gi
  const out: Columna[] = []
  for (const m of sql.matchAll(re)) {
    out.push({ tabla: (m[1] ?? m[2] ?? "").toLowerCase(), columna: (m[3] ?? m[4] ?? "").toLowerCase() })
  }
  return out
}

function leer(file: string): { file: string; version: string; sql: string; crudo: string } {
  const crudo = readFileSync(join(MIGRATIONS_DIR, file), "utf8")
  return { file, version: versionDe(file), sql: sinComentarios(crudo), crudo }
}

const MIGRACIONES = MIGRATION_FILES.map(leer)

const VERSION_DROP = versionDe(DROP_MIGRATION)

describe("detectores — se prueban antes de mirar el perímetro", () => {
  it("reconoce un ADD COLUMN con y sin `public.` y con y sin comillas", () => {
    expect(columnasAñadidas("ALTER TABLE public.orders ADD COLUMN seller_id UUID")).toEqual([
      { tabla: "orders", columna: "seller_id" },
    ])
    expect(columnasAñadidas('ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "seller_id" UUID')).toEqual([
      { tabla: "orders", columna: "seller_id" },
    ])
    expect(columnasAñadidas("ALTER TABLE ONLY orders ADD COLUMN IF NOT EXISTS seller_id UUID")).toEqual([
      { tabla: "orders", columna: "seller_id" },
    ])
  })

  it("no confunde una columna de otra tabla con la de orders", () => {
    const sql = [
      "ALTER TABLE public.crm_prospects ADD COLUMN IF NOT EXISTS seller_id UUID",
      "ALTER TABLE public.crm_tasks ADD COLUMN seller_id UUID",
    ].join("\n")
    expect(columnasAñadidas(sql).map((c) => c.tabla)).toEqual(["crm_prospects", "crm_tasks"])
    expect(columnasAñadidas(sql).filter((c) => c.tabla === "orders")).toEqual([])
  })

  it("reconoce el DROP COLUMN", () => {
    expect(columnasEliminadas("ALTER TABLE public.orders DROP COLUMN IF EXISTS seller_id;")).toEqual([
      { tabla: "orders", columna: "seller_id" },
    ])
  })

  it("el filtro de comentarios deja fuera el `--` pero no un `//` de una URL", () => {
    expect(sinComentarios("-- ALTER TABLE orders ADD COLUMN seller_id\nSELECT 1")).not.toMatch(/seller_id/)
    expect(sinComentarios("const u = 'https://x.test' // nota")).toContain("https://x.test")
  })
})

describe("orders.seller_id — congelado", () => {
  it("00052 la crea: la eliminación es de algo que existió", () => {
    const creada = MIGRACIONES.find((m) => m.file === CREATE_MIGRATION)
    expect(creada, `${CREATE_MIGRATION} debe seguir en el repo`).toBeDefined()

    const pares = columnasAñadidas(creada!.sql)
    expect(pares).toContainEqual({ tabla: "orders", columna: "seller_id" })
  })

  it("ninguna migración la vuelve a añadir", () => {
    const reincidentes = MIGRACIONES.filter((m) =>
      columnasAñadidas(m.sql).some((c) => c.tabla === "orders" && c.columna === "seller_id")
    ).map((m) => m.file)

    // Solo 00052 puede nombrarla, y solo como creación original.
    expect(reincidentes).toEqual([CREATE_MIGRATION])
  })

  it("exactamente una migración la elimina, y es posterior a la que la crea", () => {
    const eliminan = MIGRACIONES.filter((m) =>
      columnasEliminadas(m.sql).some((c) => c.tabla === "orders" && c.columna === "seller_id")
    )

    expect(eliminan.map((m) => m.file)).toEqual([DROP_MIGRATION])
    expect(VERSION_DROP > versionDe(CREATE_MIGRATION)).toBe(true)
  })

  it("00189 hace solo eso, y con IF EXISTS para ser re-ejecutable", () => {
    const migracion = MIGRACIONES.find((m) => m.file === DROP_MIGRATION)
    expect(migracion, `${DROP_MIGRATION} debe existir`).toBeDefined()

    expect(migracion!.sql).toMatch(
      /ALTER\s+TABLE\s+public\.orders\s+DROP\s+COLUMN\s+IF\s+EXISTS\s+seller_id/i
    )
    // Una migración que además crea, altera o concede otra cosa deja de ser
    // "borrar una columna vacía" y pasa a necesitar su propia revisión.
    expect(migracion!.sql).not.toMatch(/\b(CREATE|GRANT|REVOKE|INSERT|UPDATE|DELETE)\b/i)
    expect(columnasAñadidas(migracion!.sql)).toEqual([])
    expect(columnasEliminadas(migracion!.sql)).toHaveLength(1)
  })

  it("el hint de embed no apunta a la FK eliminada", () => {
    const fuente = readFileSync(join(REPO, "src", "lib", "admin", "order-selects.ts"), "utf8")
    const declarado = /export const ORDERS_PROFILE_FK\s*=\s*"([^"]+)"/.exec(fuente)?.[1]

    expect(declarado).toBe("orders_user_id_fkey")
    expect(fuente).not.toMatch(/ORDERS_PROFILE_FK\s*=\s*"orders_seller_id_fkey"/)
  })
})
