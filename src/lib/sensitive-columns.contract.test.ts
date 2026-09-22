import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import {
  PRIVATE_ADDRESSES_COLUMNS,
  PRIVATE_COLUMNS,
  PRIVATE_FOODOS_AI_MESSAGES_COLUMNS,
  PRIVATE_FOODOS_AI_USAGE_COLUMNS,
  PRIVATE_FOODOS_COURIERS_COLUMNS,
  PRIVATE_FOODOS_DELIVERIES_COLUMNS,
  PRIVATE_FOODOS_DELIVERY_ZONES_COLUMNS,
  PRIVATE_FOODOS_ORDER_PAYMENTS_COLUMNS,
  PRIVATE_FOODOS_ORDERS_COLUMNS,
  PRIVATE_FOODOS_POS_CONNECTIONS_COLUMNS,
  PRIVATE_FOODOS_WALLET_PASSES_COLUMNS,
  PRIVATE_FOODOS_WEBHOOKS_COLUMNS,
  PRIVATE_FOODOS_WHATSAPP_CONNECTIONS_COLUMNS,
  PRIVATE_ORDERS_COLUMNS,
  PUBLIC_ADDRESSES_COLUMNS,
  PUBLIC_ADDRESSES_SELECT,
  PUBLIC_FOODOS_ORDERS_COLUMNS,
  PUBLIC_FOODOS_ORDERS_SELECT,
  PUBLIC_FOODOS_ORDER_PAYMENTS_SELECT,
  PUBLIC_ORDERS_COLUMNS,
  PUBLIC_ORDERS_DETAIL_SELECT,
  PUBLIC_ORDERS_SELECT,
  PUBLIC_ORDERS_WITH_ITEMS_SELECT,
  SENSITIVE_TABLES,
} from "@/lib/sensitive-columns"

/**
 * Contrato SQL ↔ código de los privilegios de columna de `00195`.
 *
 * Es el hermano de `foodos-columns.contract.test.ts` y `product-columns.contract.test.ts`
 * para las trece tablas que quedaron fuera de aquellos dos. Trece tablas tienen
 * `GRANT SELECT` **a nivel de tabla** para `anon` y `authenticated` (del
 * `ALTER DEFAULT PRIVILEGES` de Supabase, el mecanismo que documenta `00160`) y
 * sus políticas RLS filtran **filas, no columnas**: con la llave anónima que
 * viaja en el navegador se podía pedir
 *
 *     GET /rest/v1/orders?select=restore_token
 *     GET /rest/v1/foodos_webhooks?select=secret
 *     GET /rest/v1/foodos_couriers?select=access_token
 *
 * y leer 21 columnas que son credenciales o márgenes nuestros. El arreglo vive
 * en dos mitades que tienen que decir lo mismo:
 *
 *   1. `supabase/migrations/00195_columnas_sensibles.sql` — el `GRANT
 *      SELECT (…)` a `anon` y a `authenticated`, más su `$guard$`.
 *   2. `src/lib/sensitive-columns.ts` — lo que el código pide.
 *
 * Si divergen, PostgREST falla la consulta **entera** con `42501` (expande el
 * select a columnas de su caché) y la pantalla se queda en blanco. Sin base de
 * datos, el contrato se lee como **texto**, igual que los otros dos; la
 * comprobación contra producción la hace el `$guard$` de la propia migración,
 * que falla ruidoso.
 */

const REPO = process.cwd()
const MIGRACION = join(REPO, "supabase", "migrations", "00195_columnas_sensibles.sql")

/** Quita comentarios para no confundir la prosa (que nombra columnas) con SQL. */
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")
}

function leerMigracion(): string {
  return readFileSync(MIGRACION, "utf8")
}

/**
 * Columnas del `GRANT SELECT ( … ) ON public.<tabla> TO <roles>` pedido.
 *
 * Devuelve la lista de cada rol. Un `TO anon, authenticated` concede la misma
 * lista a los dos, que es como está escrita `addresses`.
 */
function columnasConcedidas(
  sql: string,
  tabla: string
): { anon: string[]; authenticated: string[] } {
  const limpio = sinComentarios(sql)
  const out: { anon: string[]; authenticated: string[] } = { anon: [], authenticated: [] }
  const re = new RegExp(
    `GRANT\\s+SELECT\\s*\\(([^)]*)\\)\\s*ON\\s+public\\.${tabla}\\s+TO\\s+([^;]*);`,
    "gi"
  )
  for (const m of limpio.matchAll(re)) {
    const cols = (m[1] ?? "")
      .split(",")
      .map((c) => c.trim().replace(/^"|"$/g, "").toLowerCase())
      .filter(Boolean)
      .sort()
    const roles = (m[2] ?? "").toLowerCase()
    if (/\banon\b/.test(roles)) out.anon = cols
    if (/\bauthenticated\b/.test(roles)) out.authenticated = cols
  }
  return out
}

const TABLAS = SENSITIVE_TABLES.map((t) => t.table)

function archivosFuente(dir = join(REPO, "src")): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...archivosFuente(full))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/**
 * Qué cliente usa cada variable de un archivo.
 *
 * No basta con «el archivo usa `createServiceClient`»: `actions.ts` lo usa para
 * las tablas de `00193` y a la vez lee `foodos_orders` con `ctx.client`, que es
 * el cliente de **sesión**. Si se marcara el archivo entero como de servicio,
 * el barrido de abajo no vería justo la lectura que sí se rompe.
 *
 * Y tampoco basta con un mapa por archivo: en `actions.ts` el nombre
 * `supabase` es el cliente de servicio en unas funciones y el de sesión en
 * otras. Por eso el rol se resuelve **en el sitio de la llamada**, buscando la
 * asignación más cercana hacia atrás.
 */
function rolEnSitio(src: string, indice: number, receptor: string): "service" | "sesion" | "anonimo" {
  const nombre = receptor.split(".")[0] ?? ""
  const prefijo = src.slice(0, indice)
  let ultimo = -1
  let rol: "service" | "sesion" | "anonimo" = "sesion"

  const anota = (indiceMatch: number, valor: "service" | "sesion" | "anonimo") => {
    if (indiceMatch > ultimo) {
      ultimo = indiceMatch
      rol = valor
    }
  }

  // `const { supabase, ownerUserId } = await requireFoodosAuth()`: hay que
  // comprobar que el nombre está en el desestructurado, no solo que la llamada
  // exista.
  for (const m of prefijo.matchAll(/const\s+\{([^}]*?)\}\s*=\s*await\s+requireFoodosAuth\(\)/g)) {
    const nombres = (m[1] ?? "")
      .split(",")
      .map((n) => (n.trim().split(":")[0] ?? "").trim())
    if (nombres.includes(nombre)) anota(m.index ?? -1, "sesion")
  }

  const patrones: Array<[RegExp, "service" | "sesion" | "anonimo"]> = [
    [
      new RegExp(`const\\s+${nombre}\\s*=\\s*(?:await\\s+)?createServiceClient\\(\\)`, "g"),
      "service",
    ],
    [new RegExp(`const\\s+${nombre}\\s*=\\s*(?:await\\s+)?createClient\\(\\)`, "g"), "anonimo"],
    [new RegExp(`const\\s+${nombre}\\s*=\\s*ctx\\.client\\b`, "g"), "sesion"],
    [new RegExp(`const\\s+${nombre}\\s*=\\s*service\\b`, "g"), "service"],
    [new RegExp(`${nombre}\\s*:\\s*ServiceClient\\b`, "g"), "service"],
  ]
  for (const [re, valor] of patrones) {
    for (const m of prefijo.matchAll(re)) anota(m.index ?? -1, valor)
  }

  if (ultimo >= 0) return rol
  // Sin asignación a la vista: una función que recibe el cliente por parámetro
  // (`supabase: SupabaseClient`). Se trata como cliente de sesión, que es el
  // camino normal de esas libs; el barrido ya exige que no pidan nada revocado
  // de `authenticated`.
  return "sesion"
}

/** El receptor de `.from("t")`: `supabase`, `db`, `ctx.client`, … */
function receptorDe(src: string, indice: number): string {
  const antes = src.slice(0, indice)
  const m = antes.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*$/)
  return m?.[1] ?? ""
}

/** Resuelve `const NAME = "…"` del propio archivo, un solo nivel. */
function constanteLocal(src: string, nombre: string): string | null {
  const m = src.match(new RegExp(`const\\s+${nombre}\\s*=\\s*\\n?\\s*(\`[^\`]*\`|"[^"]*")`))
  return m ? (m[1] ?? "").slice(1, -1) : null
}

/** Sustituye `${PUBLIC_…}` por su valor y borra el resto de interpolaciones. */
function interpolar(texto: string): string {
  let out = texto
  for (const [nombre, valor] of CONSTANTES_PUBLICAS) {
    out = out.replaceAll("${" + nombre + "}", valor)
  }
  return out.replace(/\$\{[^}]*\}/g, " ")
}

/** Quita los grupos entre paréntesis: el `*` de un embed no es el `*` del select. */
function sinEmbeds(select: string): string {
  let out = select
  for (let i = 0; i < 8; i++) {
    const siguiente = out.replace(/\([^()]*\)/g, " ")
    if (siguiente === out) break
    out = siguiente
  }
  return out
}

/** Los `PUBLIC_*_SELECT` exportados, para resolver un identificador suelto. */
const CONSTANTES_PUBLICAS = new Map<string, string>([
  ["PUBLIC_ORDERS_SELECT", PUBLIC_ORDERS_SELECT],
  ["PUBLIC_ORDERS_WITH_ITEMS_SELECT", PUBLIC_ORDERS_WITH_ITEMS_SELECT],
  ["PUBLIC_ORDERS_DETAIL_SELECT", PUBLIC_ORDERS_DETAIL_SELECT],
  ["PUBLIC_ADDRESSES_SELECT", PUBLIC_ADDRESSES_SELECT],
  ["PUBLIC_FOODOS_ORDERS_SELECT", PUBLIC_FOODOS_ORDERS_SELECT],
  ["PUBLIC_FOODOS_ORDER_PAYMENTS_SELECT", PUBLIC_FOODOS_ORDER_PAYMENTS_SELECT],
])

describe("contrato de privilegios de columna de las 21 columnas sensibles (00195)", () => {
  it("el registro cubre 13 tablas y 21 columnas privadas", () => {
    expect(SENSITIVE_TABLES).toHaveLength(13)
    expect(PRIVATE_COLUMNS).toHaveLength(21)
    expect(new Set(TABLAS).size).toBe(13)
    expect(new Set(PRIVATE_COLUMNS).size).toBe(21)
  })

  it("ninguna lista tiene repetidos y lo privado no está en lo público", () => {
    for (const t of SENSITIVE_TABLES) {
      expect(new Set(t.publicColumns).size, `${t.table}: públicas repetidas`).toBe(
        t.publicColumns.length
      )
      expect(new Set(t.authenticatedColumns).size, `${t.table}: de authenticated repetidas`).toBe(
        t.authenticatedColumns.length
      )
      const publicas = new Set(t.publicColumns)
      const coladas = t.privateColumns.filter((c) => publicas.has(c))
      expect(coladas, `${t.table}: privadas dentro de las públicas`).toEqual([])
      // `authenticated` ve un superconjunto de lo que ve `anon`: revocar de más
      // es lo único que este cambio hace.
      const auth = new Set(t.authenticatedColumns)
      const faltan = t.publicColumns.filter((c) => !auth.has(c))
      expect(faltan, `${t.table}: authenticated no ve lo que ve anon`).toEqual([])
    }
  })

  it("encuentra la migración y le extrae los dos GRANT de cada tabla", () => {
    const sql = leerMigracion()
    for (const t of SENSITIVE_TABLES) {
      const g = columnasConcedidas(sql, t.table)
      expect(g.anon.length, `falta el GRANT a anon de ${t.table}`).toBeGreaterThan(0)
      expect(g.authenticated.length, `falta el GRANT a authenticated de ${t.table}`).toBeGreaterThan(0)
    }
  })

  it("las listas del SQL son las del código, tabla por tabla", () => {
    const sql = leerMigracion()
    for (const t of SENSITIVE_TABLES) {
      const g = columnasConcedidas(sql, t.table)
      expect(g.anon, `GRANT a anon de ${t.table}`).toEqual([...t.publicColumns].sort())
      expect(g.authenticated, `GRANT a authenticated de ${t.table}`).toEqual(
        [...t.authenticatedColumns].sort()
      )
    }
  })

  it("ninguna columna revocada de los dos roles se coló en los GRANT", () => {
    // Las que `authenticated` conserva (secret, access_token_enc, …) sí
    // aparecen en su GRANT: eso es correcto y está declarado en el registro.
    const sql = leerMigracion()
    const coladas: string[] = []
    for (const t of SENSITIVE_TABLES) {
      const g = columnasConcedidas(sql, t.table)
      const soloService = t.privateColumns.filter((c) => !t.authenticatedColumns.includes(c))
      for (const c of [...g.anon, ...g.authenticated]) {
        if (soloService.includes(c)) coladas.push(`${t.table}.${c}`)
      }
    }
    expect(coladas, `no deben ser legibles: ${coladas.join(", ")}`).toEqual([])
  })

  it("las nueve columnas que `authenticated` conserva sí están en su GRANT", () => {
    // Si se revocaran también de `authenticated`, el panel del dueño se quedaría
    // sin webhooks firmados, sin WhatsApp, sin POS, sin tokens de mensajero y
    // sin el consumo de IA. La guarda de la migración lo afirma en positivo.
    const sql = leerMigracion()
    const conservadas: string[] = []
    for (const t of SENSITIVE_TABLES) {
      const g = columnasConcedidas(sql, t.table)
      for (const c of t.privateColumns.filter((p) => t.authenticatedColumns.includes(p))) {
        if (!g.authenticated.includes(c)) conservadas.push(`${t.table}.${c}`)
      }
    }
    expect(conservadas, `authenticated perdió: ${conservadas.join(", ")}`).toEqual([])
    // Nueve columnas se conservan para `authenticated` (ocho tablas; zonas
    // aporta dos): las nueve que el panel del dueño sí lee con el cliente de
    // sesión.
    const total = SENSITIVE_TABLES.flatMap((t) =>
      t.privateColumns.filter((c) => t.authenticatedColumns.includes(c))
    )
    expect(total).toHaveLength(9)
  })

  it("revoca el SELECT de tabla antes de conceder columnas, en las trece", () => {
    // El orden importa **por tabla**: con el privilegio de tabla en pie, el
    // GRANT de columna de esa misma tabla no restringe nada (es el tropiezo que
    // dejó escrito 00160).
    const limpio = sinComentarios(leerMigracion())
    for (const tabla of TABLAS) {
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

  it("revoca también el SELECT que `PUBLIC` pudiera tener", () => {
    // `PUBLIC` es el pseudo-rol al que pertenecen todos; un GRANT olvidado ahí
    // reabriría la tabla entera aunque `anon` ya no la tenga.
    const limpio = sinComentarios(leerMigracion())
    for (const tabla of TABLAS) {
      expect(
        new RegExp(`REVOKE\\s+SELECT\\s+ON\\s+public\\.${tabla}\\s+FROM\\s+PUBLIC`, "i").test(limpio),
        `falta el REVOKE … FROM PUBLIC de ${tabla}`
      ).toBe(true)
    }
  })

  it("no revoca la escritura: el dueño sigue escribiendo con el cliente de sesión", () => {
    // `00160` acotó el UPDATE de `foodos_restaurants` a 18 columnas y el panel
    // inserta pedidos, edita zonas y mensajeros y aprueba comprobantes. Revocar
    // aquí INSERT/UPDATE/DELETE rompería todo eso.
    const limpio = sinComentarios(leerMigracion())
    const escrituras = limpio.match(/REVOKE\s+(INSERT|UPDATE|DELETE|ALL)[^;]*/gi)
    expect(escrituras, `00195 no debe revocar escritura: ${escrituras?.join(" | ")}`).toBeNull()
  })

  it("service_role conserva la tabla completa en las trece", () => {
    // Es quien lee los `stripe_*`, el `restore_token`, los secretos y el
    // consumo de IA.
    const limpio = sinComentarios(leerMigracion())
    for (const tabla of TABLAS) {
      expect(
        new RegExp(`GRANT\\s+SELECT\\s+ON\\s+public\\.${tabla}\\s+TO\\s+service_role`, "i").test(
          limpio
        ),
        `falta el GRANT SELECT de tabla a service_role en ${tabla}`
      ).toBe(true)
    }
  })

  it("el $guard$ nombra las 21 columnas y falla si alguna sigue legible", () => {
    const limpio = sinComentarios(leerMigracion())
    expect(/\$guard\$/.test(limpio), "la migración perdió su guarda").toBe(true)
    expect(/has_column_privilege/.test(limpio), "la guarda no comprueba privilegios de columna").toBe(
      true
    )
    expect(/has_table_privilege/.test(limpio), "la guarda no comprueba el privilegio de tabla").toBe(
      true
    )
    expect(/RAISE\s+EXCEPTION/.test(limpio), "la guarda no falla ruidoso").toBe(true)
    for (const par of PRIVATE_COLUMNS) {
      expect(limpio, `la guarda no nombra ${par}`).toContain(`'${par}'`)
    }
  })

  it("la guarda comprueba la invariante exacta, no una muestra", () => {
    // Recorre `information_schema.columns` de cada tabla y exige que `anon`
    // pueda leer una columna si y solo si no está en la lista privada. Así
    // también falla el día que alguien añada una columna a una de estas tablas
    // sin actualizar la lista blanca.
    const limpio = sinComentarios(leerMigracion())
    expect(/information_schema\.columns/.test(limpio)).toBe(true)
    expect(/v_fuga\s*:=/.test(limpio) && /v_falta\s*:=/.test(limpio)).toBe(true)
  })

  it("los SELECT de cliente son literales para que supabase-js infiera la fila", () => {
    // Con un select construido en runtime (`array.join(", ")`) supabase-js cae
    // a `GenericStringError` y cada acceso a `.id` deja de compilar. El `as
    // const` es lo que mantiene la inferencia.
    const src = readFileSync(join(REPO, "src", "lib", "sensitive-columns.ts"), "utf8")
    for (const nombre of [
      "PUBLIC_ORDERS_SELECT",
      "PUBLIC_FOODOS_ORDERS_SELECT",
      "PUBLIC_ADDRESSES_SELECT",
    ]) {
      expect(
        new RegExp(`${nombre}\\s*=\\s*\\n?\\s*"[^"]+" as const`).test(src),
        `${nombre} debe ser un literal con as const`
      ).toBe(true)
    }
  })

  it("las constantes derivan del literal, sin duplicar la lista", () => {
    expect(PUBLIC_ORDERS_SELECT.split(", ")).toEqual([...PUBLIC_ORDERS_COLUMNS])
    expect(PUBLIC_FOODOS_ORDERS_SELECT.split(", ")).toEqual([...PUBLIC_FOODOS_ORDERS_COLUMNS])
    expect(PUBLIC_ADDRESSES_SELECT.split(", ")).toEqual([...PUBLIC_ADDRESSES_COLUMNS])
  })

  it("los select compuestos salen de la lista pública, no de una copia", () => {
    // Si alguien escribe el select a mano en la pantalla, la lista blanca deja
    // de ser la única fuente y una columna privada puede volver sin que el
    // contrato la vea.
    expect(PUBLIC_ORDERS_WITH_ITEMS_SELECT.startsWith(PUBLIC_ORDERS_SELECT)).toBe(true)
    expect(PUBLIC_ORDERS_DETAIL_SELECT.startsWith(PUBLIC_ORDERS_SELECT)).toBe(true)
    expect(PUBLIC_ORDERS_DETAIL_SELECT).toContain(`addresses(${PUBLIC_ADDRESSES_SELECT})`)
  })

  it("cada tabla privada está declarada por su propia constante", () => {
    // Un solo sitio donde se lee la lista de cada tabla, para que el contrato y
    // la guarda no puedan divergir del registro.
    const esperado: Record<string, readonly string[]> = {
      orders: PRIVATE_ORDERS_COLUMNS,
      foodos_orders: PRIVATE_FOODOS_ORDERS_COLUMNS,
      addresses: PRIVATE_ADDRESSES_COLUMNS,
      foodos_webhooks: PRIVATE_FOODOS_WEBHOOKS_COLUMNS,
      foodos_whatsapp_connections: PRIVATE_FOODOS_WHATSAPP_CONNECTIONS_COLUMNS,
      foodos_pos_connections: PRIVATE_FOODOS_POS_CONNECTIONS_COLUMNS,
      foodos_couriers: PRIVATE_FOODOS_COURIERS_COLUMNS,
      foodos_deliveries: PRIVATE_FOODOS_DELIVERIES_COLUMNS,
      foodos_delivery_zones: PRIVATE_FOODOS_DELIVERY_ZONES_COLUMNS,
      foodos_wallet_passes: PRIVATE_FOODOS_WALLET_PASSES_COLUMNS,
      foodos_order_payments: PRIVATE_FOODOS_ORDER_PAYMENTS_COLUMNS,
      foodos_ai_usage: PRIVATE_FOODOS_AI_USAGE_COLUMNS,
      foodos_ai_messages: PRIVATE_FOODOS_AI_MESSAGES_COLUMNS,
    }
    for (const t of SENSITIVE_TABLES) {
      expect(t.privateColumns, `${t.table}`).toEqual(esperado[t.table])
    }
  })

  it("ningún lector sin service_role pide una columna privada ni select(\"*\")", () => {
    // El barrido real. Dos reglas, una por rol:
    //
    //   · Un lector que **puede ser anónimo** (`createClient()` del navegador o
    //     del servidor sin sesión) no puede pedir `*` ni una columna privada de
    //     `anon` en ninguna de las trece tablas.
    //   · Un lector de sesión (`requireFoodosAuth()`, `ctx.client`, o una
    //     función que recibe el cliente por parámetro) sí puede pedir las
    //     columnas que `00195` conserva para `authenticated` —ocho tablas las
    //     mantienen enteras, y `flotilla/deliveries.ts` **filtra** por
    //     `access_token`— pero no las que también se le revocaron, ni `*` sobre
    //     las cinco tablas donde se le revocó algo.
    const fugas: string[] = []
    for (const abs of archivosFuente()) {
      const rel = abs.slice(REPO.length + 1)
      const src = readFileSync(abs, "utf8")
      if (!TABLAS.some((t) => src.includes(`"${t}"`))) continue

      const re = new RegExp(`\\.from\\(\\s*"(${TABLAS.join("|")})"\\s*\\)`, "g")
      for (const m of src.matchAll(re)) {
        const tabla = m[1]
        const info = SENSITIVE_TABLES.find((t) => t.table === tabla)!
        // La ventana termina en el próximo `.from(` (una cadena de consulta
        // nunca encadena dos) o a los 600 caracteres. Así un comentario largo
        // entre el `.from(` y el `.select(` no corta el nombre de la constante,
        // y un `.select(` de la consulta siguiente no se atribuye a esta tabla.
        const resto = src.slice((m.index ?? 0) + m[0].length)
        const corte = resto.indexOf(".from(")
        const ventana = (corte >= 0 ? resto.slice(0, corte) : resto).slice(0, 600)

        const sel = ventana.match(/\s*\.select\(\s*(`[^`]*`|"[^"]*"|[A-Za-z_$][\w$]*)/)
        if (!sel) continue

        const receptor = receptorDe(src, m.index ?? 0)
        const rol = rolEnSitio(src, m.index ?? 0, receptor)
        if (rol === "service") continue

        const linea = src.slice(0, m.index).split("\n").length
        const donde = `${rel}:${linea} (${tabla}, receptor ${receptor || "?"} = ${rol})`

        // `sinEmbeds` deja fuera los `*` de las relaciones anidadas
        // (`order_items(*)`), que son de otra tabla.
        let texto = sel[1] ?? ""
        if (texto.startsWith("`") || texto.startsWith('"')) {
          texto = interpolar(texto.slice(1, -1))
        } else if (CONSTANTES_PUBLICAS.has(texto)) {
          texto = CONSTANTES_PUBLICAS.get(texto)!
        } else {
          const local = constanteLocal(src, texto)
          if (local === null) {
            // Un identificador que no se puede leer aquí (un parámetro de
            // función) no es verificable de forma estática; el caso real es el
            // `select(columns)` de `email-workflows.ts` y el `select(select)`
            // de `stripe-webhook-handlers.ts`, y los dos van con
            // `service_role`, así que ya se saltaron arriba.
            fugas.push(`${donde}: select(${texto}) no es verificable`)
            continue
          }
          texto = interpolar(local)
        }

        // Lo que este rol no puede leer: para un lector anónimo, toda la lista
        // privada; para uno de sesión, solo lo que se revocó también de
        // `authenticated`.
        const prohibidas =
          rol === "anonimo"
            ? [...info.privateColumns]
            : info.privateColumns.filter((c) => !info.authenticatedColumns.includes(c))

        const plano = sinEmbeds(texto)
        if (prohibidas.length > 0 && /(^|[,\s])\*([,\s]|$)/.test(plano)) {
          fugas.push(`${donde}: select("*")`)
        }

        for (const col of prohibidas) {
          if (new RegExp(`(^|[,\\s(])${col}([,\\s)]|$)`).test(texto)) {
            fugas.push(`${donde}: ${tabla}.${col}`)
          }
        }
      }
    }
    expect(fugas, `lectores sin service_role pidiendo de más:\n${fugas.join("\n")}`).toEqual([])
  })
})
