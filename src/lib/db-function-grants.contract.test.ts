import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * Contrato de privilegios de ejecución sobre funciones: **cerrar un RPC exige
 * nombrar a los tres roles.**
 *
 * Contexto: Supabase deja dos `ALTER DEFAULT PRIVILEGES` en `public`, uno de
 * `postgres` y otro de `supabase_admin`, y **los dos conceden `EXECUTE` a
 * `anon`, `authenticated` y `service_role`** sobre toda función nueva. Por eso
 * `REVOKE ... FROM PUBLIC` —el patrón que usaban veinte migraciones de este
 * repositorio— era **inerte**: quitaba el grant implícito a PUBLIC pero dejaba
 * en pie el grant directo a `anon` y `authenticated`. Y por eso
 * `REVOKE ... FROM anon, authenticated` —el patrón que usaba `00155`— también lo
 * era: quitaba los dos grants directos pero dejaba el `=X` de PUBLIC. El
 * resultado medido en producción fue que `pay_commission_period`,
 * `cancel_commission_period` y `accrue_commission_period`, que son
 * `SECURITY DEFINER` y **no comprueban ni `is_admin()` ni `auth.uid()`**, eran
 * ejecutables por cualquier visitante anónimo: se podía marcar un periodo de
 * comisiones como pagado sin tener cuenta.
 *
 * La regla que se congela aquí es **por archivo y por función, no por
 * sentencia**: hay migraciones correctas que reparten el cierre en dos
 * sentencias (`00042`, `00117`: una para PUBLIC y otra para `anon,
 * authenticated`) y migraciones correctas que lo escriben dentro de un
 * `EXECUTE '...'` (`00141`). Lo que importa es que la **unión** de roles
 * revocados en el archivo cubra PUBLIC, `anon` y `authenticated`.
 *
 * Este contrato cierra cuatro formas de reintroducir el agujero:
 *
 *  1. **Una migración nueva cierra un RPC a medias.** Es el caso de `00155`:
 *     `REVOKE ... FROM anon, authenticated` sin PUBLIC. El `proacl` queda
 *     `{=X/postgres,postgres=X,service_role=X}` — se lee limpio y está abierto.
 *  2. **Se vacía la lista de excepciones con motivos.** Las tres listas de
 *     abajo son datos con razón escrita al lado; cada entrada se comprueba
 *     contra el archivo, así que no sirven para tapar un RPC todavía abierto.
 *  3. **Desaparece la normalización.** `00165` es el archivo que arregla lo que
 *     ya estaba mal; si se borra o se vacía, los defectos históricos vuelven a
 *     estar abiertos en una base nueva.
 *  4. **Vuelve el grant por defecto.** `00166` es el archivo que revoca el
 *     `ALTER DEFAULT PRIVILEGES`; sin él, la siguiente función que se cree nace
 *     abierta otra vez y el agujero se reabre solo.
 *
 * Límite conocido y aceptado: esto vigila la **forma de los archivos de
 * migración**, no el estado real de la base. El suite de tests no tiene acceso a
 * Postgres. Lo que sí se comprobó contra producción, una sola vez y a mano, fue
 * que tras `00165` el `proacl` de las tres funciones de comisiones es
 * `{postgres=X/postgres,service_role=X/postgres}` y que
 * `has_function_privilege('anon', …, 'EXECUTE')` devuelve `false`.
 */

const REPO = process.cwd()
const MIGRATIONS_DIR = "supabase/migrations"

/**
 * Los tres roles que hay que nombrar para que un cierre sea real. En minúsculas
 * porque `PUBLIC` es una palabra clave de SQL, no un rol: `FROM public` y
 * `FROM PUBLIC` son lo mismo, y varias migraciones lo escriben en minúsculas.
 */
const ROLES_OBLIGATORIOS = ["public", "anon", "authenticated"]

type Revoke = { fn: string; roles: string[] }

/** Quita comentarios de linea y de bloque para no confundir ilustraciones con codigo. */
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")
}

/**
 * Un `REVOKE ... ON FUNCTION <nombre>(<args>) FROM <roles>` por sentencia.
 * `ON FUNCTIONS` (plural, de `ALTER DEFAULT PRIVILEGES`) no casa a propósito.
 */
function revokes(sql: string): Revoke[] {
  const re = /REVOKE\s+(?:ALL|EXECUTE)[^;]*?ON\s+FUNCTION\s+([^\s;(]+)\s*\(([^)]*)\)\s*FROM\s*([^;]*);/gi
  const out: Revoke[] = []
  for (const m of sinComentarios(sql).matchAll(re)) {
    const fn = (m[1] ?? "").split(".").pop()?.trim() ?? ""
    if (!fn) continue
    const roles = (m[3] ?? "")
      .replace(/['"]/g, "")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((r) => r.toLowerCase())
    out.push({ fn, roles })
  }
  return out
}

function lee(rel: string): string {
  return readFileSync(join(REPO, rel), "utf8")
}

const ARCHIVOS: { file: string; sql: string }[] = readdirSync(join(REPO, MIGRATIONS_DIR))
  .filter((n) => n.endsWith(".sql"))
  .sort()
  .map((n) => ({ file: `${MIGRATIONS_DIR}/${n}`, sql: lee(`${MIGRATIONS_DIR}/${n}`) }))

/** Unión de roles revocados por (archivo, función). */
const REVOCADO = new Map<string, Set<string>>()
for (const { file, sql } of ARCHIVOS) {
  for (const r of revokes(sql)) {
    const k = `${file}::${r.fn}`
    const set = REVOCADO.get(k) ?? new Set<string>()
    for (const role of r.roles) set.add(role)
    REVOCADO.set(k, set)
  }
}

function clave(file: string, fn: string): string {
  return `${MIGRATIONS_DIR}/${file}::${fn}`
}

/** Cierres incompletos por decisión: el RPC es público a propósito. */
const PUBLICO_POR_DISENO: { file: string; fn: string; motivo: string }[] = [
  { file: "00038_get_products_by_collection.sql", fn: "get_products_by_collection", motivo: "Catálogo público: lo consume el navegador sin sesión. Revoca PUBLIC y vuelve a conceder a anon y authenticated." },
  { file: "00065_product_city_availability.sql", fn: "get_available_product_ids", motivo: "Catálogo público: lo consume el navegador sin sesión. Revoca PUBLIC y vuelve a conceder a anon y authenticated." },
  { file: "00111_collection_sale_window.sql", fn: "get_products_by_collection", motivo: "Recrea la RPC anterior; mismo motivo." },
  { file: "00158_product_review_feed.sql", fn: "product_review_feed", motivo: "Reseñas públicas de producto: se muestran en la ficha, que se prerenderiza. Revoca PUBLIC y vuelve a conceder a anon y authenticated." },
]

/** Cierres incompletos por decisión: `authenticated` conserva EXECUTE. */
const PARCIAL_INTENCIONAL: { file: string; fn: string; motivo: string }[] = [
  { file: "00165_function_execute_privileges.sql", fn: "foodos_next_folio", motivo: "La llaman acciones de servidor que corren con la sesión del dueño, no con service_role. anon y PUBLIC sí se cierran." },
  { file: "00165_function_execute_privileges.sql", fn: "increment_foodos_coupon_usage", motivo: "Se invoca dentro de la creación de pedido FoodOS con el cliente inyectado; `authenticated` lo necesita. anon y PUBLIC sí se cierran." },
  { file: "00186_foodos_coupon_release.sql", fn: "decrement_foodos_coupon_usage", motivo: "Su gemela del incremento: la llaman la ruta de cancelación del comensal (con service_role) y el panel del dueño (con su sesión), así que `authenticated` lo necesita. El guardián de la función limita la llamada a un restaurante propio o admin. anon y PUBLIC sí se cierran." },
]

/** Cierres incompletos que son defectos: los normaliza `00165`. */
const DEFECTOS_NORMALIZADOS_POR_00165: { file: string; fn: string; faltaba: string }[] = [
  { file: "00039_rate_limits.sql", fn: "consume_rate_limit", faltaba: "anon y authenticated: solo revocaba PUBLIC, que contra los grants directos por defecto es inerte." },
  { file: "00050_addresses_is_default.sql", fn: "set_default_address", faltaba: "anon y authenticated: solo revocaba PUBLIC." },
  { file: "00091_price_index.sql", fn: "refresh_price_index", faltaba: "anon y authenticated: solo revocaba PUBLIC." },
  { file: "00155_commission_ledger.sql", fn: "accrue_commission_period", faltaba: "PUBLIC: revocaba anon y authenticated pero dejaba el `=X`, así que seguía siendo ejecutable por cualquiera." },
  { file: "00155_commission_ledger.sql", fn: "pay_commission_period", faltaba: "PUBLIC: revocaba anon y authenticated pero dejaba el `=X`. Es el peor caso: SECURITY DEFINER, sin is_admin(), y marcaba el periodo como pagado." },
  { file: "00155_commission_ledger.sql", fn: "cancel_commission_period", faltaba: "PUBLIC: revocaba anon y authenticated pero dejaba el `=X`." },
]

const NORMALIZADOR = "00165_function_execute_privileges.sql"

/** Los RPC que sí tienen que quedar abiertos a `anon`: revocar de más los rompe. */
const PUBLICOS_ESPERADOS = [
  "get_available_product_ids",
  "get_products_by_collection",
  "product_review_feed",
  "is_admin",
]

describe("privilegios de ejecución sobre funciones", () => {
  it("todo REVOKE cierra los tres roles, o está en una lista con motivo", () => {
    const excepciones = new Set<string>([
      ...PUBLICO_POR_DISENO.map((e) => clave(e.file, e.fn)),
      ...PARCIAL_INTENCIONAL.map((e) => clave(e.file, e.fn)),
      ...DEFECTOS_NORMALIZADOS_POR_00165.map((e) => clave(e.file, e.fn)),
    ])

    const abiertos: string[] = []
    for (const [k, roles] of REVOCADO) {
      if (excepciones.has(k)) continue
      const faltan = ROLES_OBLIGATORIOS.filter((r) => !roles.has(r))
      if (faltan.length > 0) abiertos.push(`${k} (falta ${faltan.join(", ")})`)
    }

    expect(
      abiertos,
      "Estos RPC quedan ejecutables por roles que no deberían: el REVOKE no nombra los tres " +
        "roles, así que el grant directo por defecto (o el `=X` de PUBLIC) sobrevive y la función " +
        "sigue siendo invocable sin cuenta. Si el RPC es público a propósito, decláralo en " +
        "PUBLICO_POR_DISENO o PARCIAL_INTENCIONAL con el motivo; si no, añade el rol que falta " +
        "al REVOKE.",
    ).toEqual([])
  })

  it("las listas de excepciones no están rancias: cada entrada describe un hueco real", () => {
    const rancias: string[] = []

    for (const e of [...PUBLICO_POR_DISENO, ...PARCIAL_INTENCIONAL, ...DEFECTOS_NORMALIZADOS_POR_00165]) {
      const k = clave(e.file, e.fn)
      if (!REVOCADO.has(k)) {
        rancias.push(`${k}: la lista la cita pero el archivo ya no revoca esa función`)
        continue
      }
      const roles = REVOCADO.get(k)!
      const faltan = ROLES_OBLIGATORIOS.filter((r) => !roles.has(r))
      if (faltan.length === 0) {
        rancias.push(`${k}: ya cierra los tres roles, sobra la excepción`)
      }
    }

    expect(
      rancias,
      "Una lista de excepciones que ya no describe la realidad deja de proteger: o el archivo se " +
        "arregló y hay que quitar la entrada, o la entrada apunta a un archivo que se renombró.",
    ).toEqual([])
  })

  it("los RPC públicos por diseño vuelven a concederse a anon explícitamente", () => {
    const sinGrant: string[] = []
    for (const e of PUBLICO_POR_DISENO) {
      const sql = sinComentarios(ARCHIVOS.find((a) => a.file === `${MIGRATIONS_DIR}/${e.file}`)?.sql ?? "")
      const re = new RegExp(
        `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+[^;]*?${e.fn}\\s*\\([^)]*\\)\\s*TO\\s+[^;]*\\banon\\b`,
        "i",
      )
      if (!re.test(sql)) sinGrant.push(`${e.file}::${e.fn}`)
    }

    expect(
      sinGrant,
      "Estos RPC están en PUBLICO_POR_DISENO pero su archivo no vuelve a conceder EXECUTE a anon. " +
        "Sin el GRANT, revocar PUBLIC deja la función inutilizable para quien de verdad la usa: " +
        "el catálogo y las reseñas públicas dejan de cargar.",
    ).toEqual([])
  })

  it("los RPC parciales por diseño conservan el EXECUTE de authenticated", () => {
    const sinGrant: string[] = []
    for (const e of PARCIAL_INTENCIONAL) {
      const sql = sinComentarios(ARCHIVOS.find((a) => a.file === `${MIGRATIONS_DIR}/${e.file}`)?.sql ?? "")
      const re = new RegExp(
        `GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+[^;]*?${e.fn}\\s*\\([^)]*\\)\\s*TO\\s+[^;]*\\bauthenticated\\b`,
        "i",
      )
      if (!re.test(sql)) sinGrant.push(`${e.file}::${e.fn}`)
    }

    expect(
      sinGrant,
      "Estos RPC cierran anon y PUBLIC pero dejan authenticated a propósito; si el archivo deja de " +
        "concederle EXECUTE, las acciones de servidor que los llaman con la sesión del dueño fallan " +
        "con 42501 y el panel deja de guardar.",
    ).toEqual([])
  })

  it("00165 normaliza cada defecto histórico nombrando los tres roles", () => {
    const sql = sinComentarios(ARCHIVOS.find((a) => a.file === `${MIGRATIONS_DIR}/${NORMALIZADOR}`)?.sql ?? "")
    const faltantes: string[] = []

    for (const d of DEFECTOS_NORMALIZADOS_POR_00165) {
      const re = new RegExp(
        `REVOKE\\s+(?:ALL|EXECUTE)\\s+ON\\s+FUNCTION\\s+[^;]*?\\b${d.fn}\\s*\\([^)]*\\)\\s*FROM\\s+([^;]*);`,
        "gi",
      )
      const roles = new Set<string>()
      for (const m of sql.matchAll(re)) {
        for (const r of (m[1] ?? "").split(/[\s,]+/).filter(Boolean)) {
          roles.add(r.replace(/['"]/g, "").toLowerCase())
        }
      }
      const sinCerrar = ROLES_OBLIGATORIOS.filter((r) => !roles.has(r))
      if (sinCerrar.length > 0) faltantes.push(`${d.fn} (falta ${sinCerrar.join(", ")})`)
    }

    expect(
      faltantes,
      "00165 es el único archivo que arregla los defectos históricos: una base creada desde cero " +
        "aplica 00039/00050/00091/00155 tal como están y luego 00165. Si 00165 no cierra estos RPC " +
        "nombrando los tres roles, el agujero sigue abierto en cualquier entorno nuevo.",
    ).toEqual([])
  })

  it("00166 revoca el privilegio por defecto de funciones para anon y authenticated", () => {
    const sql = sinComentarios(ARCHIVOS.find((a) => a.file === `${MIGRATIONS_DIR}/00166_default_function_privileges.sql`)?.sql ?? "")
    expect(sql.length, "00166 desapareció: sin él, toda función nueva vuelve a nacer abierta").toBeGreaterThan(0)

    const re = /ALTER\s+DEFAULT\s+PRIVILEGES\s+IN\s+SCHEMA\s+public\s+REVOKE\s+EXECUTE\s+ON\s+FUNCTIONS\s+FROM\s+([^;]*);/gi
    const roles = new Set<string>()
    for (const m of sql.matchAll(re)) {
      for (const r of (m[1] ?? "").split(/[\s,]+/).filter(Boolean)) {
        roles.add(r.replace(/['"]/g, "").toLowerCase())
      }
    }

    expect(
      [...roles].sort(),
      "El ACL por defecto de `postgres` sobre funciones es la causa raíz: mientras conceda EXECUTE " +
        "a anon y authenticated, el próximo RPC que se cree nace ejecutable sin cuenta y hay que " +
        "volver a arreglarlo a mano. Tienen que aparecer los dos roles.",
    ).toEqual(["anon", "authenticated"])
  })

  it("00164 y 00165 cierran sus RPC nombrando los tres roles", () => {
    const abiertos: string[] = []
    for (const fn of ["panel_entry_put"]) {
      for (const file of ["00164_panel_entries_conflict_safe.sql", NORMALIZADOR]) {
        const roles = REVOCADO.get(clave(file, fn))
        if (!roles) continue
        const faltan = ROLES_OBLIGATORIOS.filter((r) => !roles.has(r))
        if (faltan.length > 0) abiertos.push(`${file}::${fn} (falta ${faltan.join(", ")})`)
      }
    }

    expect(
      abiertos,
      "`panel_entry_put` es SECURITY DEFINER y no comprueba el dueño: recibe `p_user_id` y " +
        "`p_guest_token` como parámetros. Si queda ejecutable por anon o authenticated, cualquiera " +
        "puede escribir el panel de cualquier otro pasando su UUID, sin pasar por RLS.",
    ).toEqual([])
  })

  it("el barrido encontró migraciones y revokes de verdad", () => {
    expect(ARCHIVOS.length, "No se leyó ningún archivo de migración: el barrido es vacuo").toBeGreaterThanOrEqual(150)
    expect(
      REVOCADO.size,
      "No se reconoció ningún REVOKE de función: el barrido es vacuo y no protege nada",
    ).toBeGreaterThanOrEqual(40)
    expect(PUBLICOS_ESPERADOS.length).toBe(4)
  })
})
