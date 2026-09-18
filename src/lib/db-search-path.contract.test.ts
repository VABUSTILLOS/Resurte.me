import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/**
 * Contrato de `search_path` en funciones `SECURITY DEFINER`: **una función de
 * trigger no puede depender del `search_path` de la sesión que la dispara.**
 *
 * Contexto: el 2026-09-18 **nadie podía registrarse en el sitio**. Las dos rutas
 * de alta devolvían el mismo fallo opaco:
 *
 *   POST /auth/v1/signup       → 500 "Database error saving new user"
 *   POST /auth/v1/admin/users  → 500 "Database error creating new user"
 *
 * No era GoTrue, ni el email, ni la API key: era un trigger de Postgres. La
 * cadena real del alta es ésta:
 *
 *   GoTrue  INSERT INTO auth.users
 *     └─ trigger on_auth_user_created → public.handle_new_user()
 *          └─ INSERT INTO public.profiles
 *               └─ trigger trg_set_referral_code → public.set_referral_code()
 *                    └─ generate_referral_code()          ← SIN CALIFICAR
 *
 * `set_referral_code()` es `SECURITY DEFINER` pero **no fijaba `search_path`**.
 * Un `SECURITY DEFINER` no hereda el `search_path` del definidor: si la función
 * no lo fija, la resolución de nombres usa el `search_path` de la **sesión**. La
 * sesión es la de GoTrue (`supabase_auth_admin`), cuyo `rolconfig` es
 * `search_path=auth` — sin `public`. `generate_referral_code()` vive en
 * `public`. Resultado medido:
 *
 *   42883 :: function generate_referral_code() does not exist
 *            :: PL/pgSQL function public.set_referral_code() line 4 at assignment
 *
 * La función **sí existía**: `to_regprocedure('public.generate_referral_code()')`
 * resuelve. Era puramente un fallo de resolución de nombres. La excepción subió
 * por `handle_new_user()` —que no la capturaba—, abortó el INSERT en
 * `auth.users` y GoTrue devolvió 500. El alta quedó imposible para todo el
 * mundo.
 *
 * No fue una regresión de una migración de este repositorio: el `search_path` de
 * `supabase_auth_admin` es configuración de la plataforma. Los tres perfiles
 * existentes se crearon cuando esa resolución aún alcanzaba `public`. Es decir,
 * el defecto **estaba latente desde `00018`** y sólo esperaba a que la
 * plataforma cambiara una configuración que este repositorio no controla.
 *
 * Una auditoría de clase encontró el **mismo patrón, byte por byte**, en la
 * cadena de prospectos del CRM (`00052`): `set_crm_prospect_code()` llamaba
 * `generate_crm_prospect_code()` sin calificar y sin `search_path`. Ese par
 * **todavía no había explotado** sólo porque `anon`/`authenticated` no tienen
 * `search_path` en su `rolconfig` y heredan el de PostgREST (`public`).
 *
 * Este contrato cierra cinco formas de reintroducir el defecto:
 *
 *  1. **Una migración nueva define una función `SECURITY DEFINER` sin fijar
 *     `search_path`.** Es la forma directa del fallo.
 *  2. **Una migración nueva reescribe una de las funciones de las dos cadenas
 *     sin calificar la llamada hermana.** Fijar `search_path = ''` y dejar la
 *     llamada sin calificar es peor que el defecto original: convierte un fallo
 *     dependiente de la sesión en un fallo garantizado.
 *  3. **Se le quita el manejador de excepción a `handle_new_user()`.** Crear la
 *     cuenta no puede depender de un efecto secundario. Sin el `EXCEPTION`, un
 *     fallo al crear el perfil vuelve a dejar a todo el mundo sin registrarse.
 *  4. **Queda un archivo de diagnóstico en `supabase/migrations/`.** Las sondas
 *     temporales que se usaron para encontrar la causa raíz contenían versiones
 *     instrumentadas de `handle_new_user()` que **se tragaban el error**. Si un
 *     archivo así sobrevive, `supabase db reset` reinstala la versión silenciada
 *     y el fallo real vuelve a quedar oculto. (Ocurrió: `00170`, `00171`,
 *     `00173`, `00174`, `00176` se aplicaron de verdad en producción.)
 *  5. **Se rompe el analizador y el contrato pasa por vacío.** Hay un canario de
 *     no-vacuidad, y una prueba explícita de que se aceptan las dos sintaxis de
 *     `SET search_path` (`=` y `TO`) — las tres definiciones de `00165` usan
 *     `TO` y un analizador que sólo mirara `=` las daría por defectuosas.
 *
 * Límite conocido y aceptado: esto vigila la **forma de los archivos de
 * migración**, no el estado real de la base — el suite no tiene acceso a
 * Postgres. Lo que sí se comprobó contra producción, a mano, fue: (a) que tras
 * `00179`/`00180` el `proconfig` de las seis funciones de las dos cadenas
 * contiene `search_path=`; (b) que un INSERT en `auth.users` ejecutado con
 * `SET LOCAL search_path = auth` crea el perfil con `referral_code`; (c) que un
 * INSERT en `public.crm_prospects` con `search_path = ''` también; y (d) que
 * `st_estimatedextent(...)` (3 sobrecargas de PostGIS, `SECURITY DEFINER` sin
 * `search_path`) es **irreparable desde migraciones** porque su propietario es
 * `supabase_admin` y `postgres` no es superusuario ni miembro de ese rol —
 * `ALTER FUNCTION` responde `42501 must be owner of function`. Ese residual es
 * de la plataforma, no de esta aplicación: ninguna de las tres la invoca un
 * trigger, así que queda fuera del alcance de la regla 1 por construcción.
 */

const REPO = process.cwd()
const MIGRATIONS_DIR = "supabase/migrations"

/**
 * Las dos cadenas que sufrieron el defecto. Se vigilan aparte y con más detalle
 * que la regla general porque son las que ya rompieron producción una vez.
 */
const CADENAS = {
  set_referral_code: {
    hermanoCalificado: "public.generate_referral_code()",
    defineEn: "00179_fix_registro_search_path.sql",
  },
  generate_referral_code: {
    tablaCalificada: "public.profiles",
    defineEn: "00179_fix_registro_search_path.sql",
  },
  set_crm_prospect_code: {
    hermanoCalificado: "public.generate_crm_prospect_code()",
    defineEn: "00180_fix_crm_prospect_search_path.sql",
  },
  generate_crm_prospect_code: {
    tablaCalificada: "public.crm_prospects",
    defineEn: "00180_fix_crm_prospect_search_path.sql",
  },
  handle_new_user: {
    tablaCalificada: "public.profiles",
    defineEn: "00179_fix_registro_search_path.sql",
  },
} as const

/**
 * Lo que delata una migración de diagnóstico temporal **no es nombrar las
 * sondas, es crearlas**. `00179` nombra `zz_diag_log`, `zz_probe_def`,
 * `zz_probe_inv` y `zz_before_ins` porque su sección 4 las **borra**, y eso es
 * justo lo que hay que hacer. Lo prohibido es un `CREATE` sobre un objeto `zz_`,
 * o el canal de diagnóstico que se usaba para leer la base desde `db push`.
 */
// `[^;]` acota la coincidencia a UNA sentencia (y cruza saltos de línea, que es
// lo que hace falta para el cuerpo de una función). `[\s\S]*?` no sirve: salta de
// un `CREATE` cualquiera al `DROP ... zz_` de más abajo y da un falso positivo.
const CREA_SONDA = /\bCREATE\b[^;]*\bzz_/i
const CANAL_DE_DIAGNOSTICO = /RAISE\s+EXCEPTION\s+'DIAGNOSTICO/i

type Definicion = {
  archivo: string
  nombre: string
  /** Cabecera de la función: lo que va entre `CREATE FUNCTION` y el cuerpo. */
  cabecera: string
  /** Cuerpo entre el delimitador dollar-quote. Vacío si no se pudo aislar. */
  cuerpo: string
  esSecdef: boolean
  fijaSearchPath: boolean
}

/** Quita comentarios de línea y de bloque para no confundir ilustraciones con código. */
function sinComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ")
}

/**
 * Aísla el cuerpo dollar-quoted (`AS $$ ... $$` o `AS $fn$ ... $fn$`).
 * Devuelve la cabecera y el cuerpo por separado: la cabecera es donde viven
 * `SECURITY DEFINER` y `SET search_path`, y el cuerpo es donde se comprueban las
 * calificaciones. Mezclarlos haría que un `COMMENT ON FUNCTION` que nombre una
 * función hermana contara como si la llamara.
 */
function partirFuncion(bloque: string): { cabecera: string; cuerpo: string } {
  const m = /\bAS\s+(\$[A-Za-z0-9_]*\$)/.exec(bloque)
  if (!m) return { cabecera: bloque, cuerpo: "" }
  const tag = m[1] ?? ""
  const inicio = m.index + m[0].length
  const fin = bloque.indexOf(tag, inicio)
  if (fin === -1) return { cabecera: bloque.slice(0, inicio), cuerpo: bloque.slice(inicio) }
  return { cabecera: bloque.slice(0, inicio), cuerpo: bloque.slice(inicio, fin) }
}

/**
 * Las dos sintaxis que Postgres acepta. `00165` escribe `SET search_path TO
 * 'public'`; `00179`/`00180` escriben `SET search_path = ''`. Un analizador que
 * sólo mirara `=` declararía defectuosas tres definiciones correctas.
 */
const FIJA_SEARCH_PATH = /SET\s+search_path\s*(?:=|\bTO\b)/i

function leerDefiniciones(): Definicion[] {
  const archivos = readdirSync(join(REPO, MIGRATIONS_DIR))
    .filter((n) => n.endsWith(".sql"))
    .sort()

  const todas: Definicion[] = []
  for (const archivo of archivos) {
    const texto = sinComentarios(readFileSync(join(REPO, MIGRATIONS_DIR, archivo), "utf8"))
    const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([A-Za-z0-9_."]+)\s*\(/gi
    for (const m of texto.matchAll(re)) {
      const nombreCrudo = m[1] ?? ""
      const nombre = nombreCrudo.replace(/"/g, "").toLowerCase().split(".").pop() ?? ""
      if (nombre === "") continue
      const desde = m.index ?? 0
      const siguiente = texto.indexOf("CREATE", desde + m[0].length)
      const bloque = texto.slice(desde, siguiente === -1 ? texto.length : siguiente)
      const { cabecera, cuerpo } = partirFuncion(bloque)
      todas.push({
        archivo,
        nombre,
        cabecera,
        cuerpo,
        esSecdef: /SECURITY\s+DEFINER/i.test(cabecera),
        fijaSearchPath: FIJA_SEARCH_PATH.test(cabecera),
      })
    }
  }
  return todas
}

const DEFINICIONES = leerDefiniciones()

/**
 * La última definición gana: las migraciones se reproducen en orden y
 * `CREATE OR REPLACE` sustituye. `00018` define `set_referral_code()` sin
 * `search_path` y eso es correcto — es el registro histórico del defecto. Lo que
 * no puede pasar es que la **última** definición lo repita.
 */
const ULTIMAS = new Map<string, Definicion>()
for (const d of DEFINICIONES) ULTIMAS.set(d.nombre, d)

const SECDEF_FINALES = [...ULTIMAS.values()].filter((d) => d.esSecdef)

describe("contrato de search_path en funciones SECURITY DEFINER", () => {
  it("R1 — ninguna última definición SECURITY DEFINER se queda sin search_path fijo", () => {
    const sinFijar = SECDEF_FINALES.filter((d) => !d.fijaSearchPath).map(
      (d) => `${d.archivo} → ${d.nombre}()`,
    )
    expect(
      sinFijar,
      "Una función SECURITY DEFINER que no fija search_path resuelve los nombres con el " +
        "search_path de la SESIÓN que la llama, no con el del definidor. Es exactamente el " +
        "defecto que impidió registrarse a todo el mundo el 2026-09-18: `set_referral_code()` " +
        "llamaba `generate_referral_code()` sin calificar y la sesión de GoTrue " +
        "(search_path=auth) no alcanzaba `public`. Fija `search_path` y califica todo: " +
        "`SET search_path = ''` + `public.lo_que_sea()`.",
    ).toEqual([])
  })

  it("R2 — el canario: hay definiciones SECURITY DEFINER que revisar", () => {
    // Si el analizador se rompe (por ejemplo, porque cambia la forma de escribir
    // `CREATE FUNCTION`), R1 pasaría por vacío y el contrato no vigilaría nada.
    expect(SECDEF_FINALES.length).toBeGreaterThanOrEqual(40)
    expect(DEFINICIONES.length).toBeGreaterThanOrEqual(60)
  })

  it("R3 — el analizador acepta las dos sintaxis de SET search_path", () => {
    // `00165` escribe `SET search_path TO 'public'`; `00179` escribe `= ''`.
    // Un analizador que sólo mirara `=` daría por defectuosas tres funciones
    // correctas y el contrato sería ruido, no señal.
    const conTo = DEFINICIONES.filter((d) =>
      /SET\s+search_path\s+TO\b/i.test(d.cabecera),
    )
    const conIgual = DEFINICIONES.filter((d) =>
      /SET\s+search_path\s*=/i.test(d.cabecera),
    )
    expect(conTo.length, "ninguna definición usa `SET search_path TO`").toBeGreaterThan(0)
    expect(conIgual.length, "ninguna definición usa `SET search_path =`").toBeGreaterThan(0)
  })

  it("R4 — las cinco funciones de las dos cadenas fijan search_path", () => {
    for (const nombre of Object.keys(CADENAS)) {
      const def = ULTIMAS.get(nombre)
      expect(def, `${nombre}() no está definida en ninguna migración`).toBeDefined()
      expect(
        def?.fijaSearchPath,
        `${nombre}() es de la cadena que rompió el registro (o de su gemela del CRM) y su ` +
          "última definición no fija search_path.",
      ).toBe(true)
    }
  })

  it("R5 — las dos cadenas califican sus llamadas y sus tablas", () => {
    // Fijar `search_path = ''` sin calificar la llamada hermana es peor que el
    // defecto original: convierte un fallo dependiente de la sesión en uno
    // garantizado en cualquier sesión.
    for (const [nombre, esperado] of Object.entries(CADENAS)) {
      const def = ULTIMAS.get(nombre)
      expect(def, `${nombre}() no está definida`).toBeDefined()
      const cuerpo = def?.cuerpo ?? ""
      expect(cuerpo, `no se pudo aislar el cuerpo de ${nombre}()`).not.toBe("")

      const hermano = "hermanoCalificado" in esperado ? esperado.hermanoCalificado : null
      const tabla = "tablaCalificada" in esperado ? esperado.tablaCalificada : null

      if (hermano) {
        expect(
          cuerpo,
          `${nombre}() debe llamar \`${hermano}\` con el esquema explícito. Su ` +
            "`search_path` está fijado en vacío, así que una llamada sin calificar no " +
            "resolvería nunca.",
        ).toContain(hermano)
      }
      if (tabla) {
        expect(
          cuerpo,
          `${nombre}() debe referirse a \`${tabla}\` con el esquema explícito.`,
        ).toContain(tabla)
      }
    }
  })

  it("R6 — handle_new_user() no deja el alta dependiendo del perfil", () => {
    // Crear la cuenta es el dato crítico; crear el perfil es un efecto
    // secundario. El 2026-09-18 un fallo en el efecto secundario impidió
    // registrarse a todo el mundo.
    const def = ULTIMAS.get("handle_new_user")
    expect(def, "handle_new_user() no está definida").toBeDefined()
    const cuerpo = def?.cuerpo ?? ""
    expect(
      cuerpo,
      "handle_new_user() debe envolver el INSERT del perfil en un bloque " +
        "`EXCEPTION WHEN OTHERS`. Sin él, cualquier fallo al crear el perfil —una " +
        "columna nueva, un trigger hermano, un search_path— aborta el INSERT en " +
        "auth.users y deja el sitio sin registro.",
    ).toContain("EXCEPTION WHEN OTHERS")
  })

  it("R7 — no queda ninguna migración de diagnóstico en el repositorio", () => {
    // Las sondas que encontraron la causa raíz sustituían handle_new_user() por
    // una versión que se tragaba el error. Cinco de ellas se aplicaron de verdad
    // en producción (00170, 00171, 00173, 00174, 00176). Si un archivo así
    // sobrevive, `supabase db reset` reinstala la versión silenciada y el fallo
    // real vuelve a quedar oculto.
    const archivos = readdirSync(join(REPO, MIGRATIONS_DIR)).filter((n) => n.endsWith(".sql"))
    const sospechosos: string[] = []
    for (const archivo of archivos) {
      if (/_diag\d*\.sql$/i.test(archivo)) {
        sospechosos.push(`${archivo} (nombre de diagnóstico)`)
        continue
      }
      const texto = readFileSync(join(REPO, MIGRATIONS_DIR, archivo), "utf8")
      if (CREA_SONDA.test(texto)) {
        sospechosos.push(`${archivo} (crea un objeto zz_)`)
      } else if (CANAL_DE_DIAGNOSTICO.test(texto)) {
        sospechosos.push(`${archivo} (usa el canal de diagnóstico DIAGNOSTICO:)`)
      }
    }
    expect(
      sospechosos,
      "Hay archivos de diagnóstico que CREAN sondas en supabase/migrations/. Se aplican " +
        "de verdad en producción y, en el caso de las sondas de auth, sustituyen " +
        "handle_new_user() por una versión que silencia el error real. Bórralos y repara el " +
        "ledger con `npx supabase migration repair --status reverted <versión>`. (Nombrar " +
        "las sondas para borrarlas sí está bien: eso es lo que hace 00179.)",
    ).toEqual([])
  })

  it("R8 — las migraciones que arreglan el defecto existen y están nombradas", () => {
    // Las dos migraciones del arreglo son load-bearing: si desaparecen, una base
    // reconstruida desde cero vuelve a nacer con el defecto.
    const archivos = new Set(
      readdirSync(join(REPO, MIGRATIONS_DIR)).filter((n) => n.endsWith(".sql")),
    )
    for (const { defineEn } of Object.values(CADENAS)) {
      expect(archivos, `falta la migración ${defineEn}`).toContain(defineEn)
    }
  })
})
