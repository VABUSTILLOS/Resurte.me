import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Contrato de moderación FoodOS (E.3).
 *
 * **El invariante que este archivo congela: `status = 'active'` no se escribe
 * desde ningún camino que alcance el dueño del restaurante.**
 *
 * Por qué hace falta un contrato y no basta con los tests del módulo:
 *
 * `foodos_restaurants.status` es la única puerta a `/r/[slug]`
 * (`fetchPublicRestaurantBySlug` y `fetchPublicMarketplace` filtran
 * `.eq("status", "active")`). Hasta `00168` la política RLS del dueño
 * (`00023_foodos.sql`, `FOR ALL USING (auth.uid() = user_id)`) más la lista
 * blanca de columnas de `00160` —que deja `status` entre las columnas que
 * `authenticated` puede escribir— convertían publicarse en un acto unilateral:
 * un PATCH de una columna y el micrositio quedaba en línea, sin menú, sin
 * revisión y sin que nadie de Resurte.me lo viera.
 *
 * Eso no era una fuga de datos, era la ausencia de un modelo de publicación. La
 * regla de `00168` es la máquina de estados `draft → pending_review → active`
 * (más `paused` y el rechazo `pending_review → draft`) donde **sólo un admin
 * escribe `active`**. El invariante vive en tres capas y este archivo comprueba
 * las tres, porque romper cualquiera de ellas basta para reabrir el agujero:
 *
 *   1. **La base** — el trigger `foodos_restaurant_moderation_guard` levanta
 *      `42501` si quien escribe `active` no es admin. Es la única capa que no se
 *      puede saltar, así que si desaparece, la regla desaparece.
 *   2. **El módulo puro** — `src/lib/foodos-moderation.ts` es la fuente única
 *      del vocabulario de estados y de la tabla de transiciones del dueño. Si
 *      `active` apareciera como destino permitido, la interfaz volvería a
 *      ofrecer el botón que la base rechaza.
 *   3. **La superficie del dueño** — ningún archivo bajo `src/app/panel/foodos/`
 *      ni `src/lib/foodos/` escribe `status: "active"`, y `setRestaurantStatus`
 *      valida con `checkOwnerTransition` antes de escribir.
 *
 * Cómo se reintroduce el bug (lo que este test debe impedir):
 *
 *   a. Añadir `status?: FoodosRestaurantStatus` a la entrada de
 *      `upsertRestaurant` y meterlo en el `payload`. Ya pasó una vez en sentido
 *      contrario —el payload llevaba `input.status ?? "draft"`, así que **cada
 *      guardado del perfil despublicaba un restaurante `active`**— y por eso R3
 *      prohíbe que `status` esté en esa entrada.
 *   b. Volver `handleToggleStatus` a un interruptor `active ↔ paused` que
 *      llame a `setRestaurantStatus(id, "active")`. R1 y R2 lo cazan.
 *   c. Quitar la comprobación de `active` del trigger de `00168` «porque el
 *      módulo ya lo valida». R4 lo caza: el módulo es una comodidad de la
 *      interfaz, la autoridad es la base.
 *   d. Añadir un `GET`/`PATCH` a la ruta admin que salte `validateReviewInput`.
 *      R5 congela que la ruta sólo exponga `POST`.
 *
 * Límite conocido y aceptado: este contrato es estático. No ejecuta la base ni
 * el navegador, así que comprueba que las tres capas *existen y dicen lo
 * correcto*, no que la base responda `42501` en vivo. Esa comprobación la hace
 * `files/test-00168.mjs` contra el proyecto real, y la hizo la verificación de
 * `00168` al aplicarse (7 guardas). Un contrato estático es lo que se puede
 * correr en cada `npm test` sin credenciales; el precio es que un cambio en el
 * SQL que no toque estas cadenas podría pasar. Por eso R4 busca la forma
 * exacta del rechazo y no sólo el nombre del trigger.
 */

const REPO = process.cwd()

/** La superficie que un dueño de restaurante puede alcanzar. */
const PERIMETRO_DEL_DUENO = ["src/app/panel/foodos", "src/lib/foodos"]

/** El módulo puro y la migración que define la regla. */
const MODULO = "src/lib/foodos-moderation.ts"
const MIGRACION = "supabase/migrations/00168_foodos_restaurant_moderation.sql"
const ACCIONES_DEL_DUENO = "src/app/panel/foodos/actions.ts"
const RUTA_ADMIN = "src/app/api/admin/foodos/restaurantes/route.ts"
const SUPERFICIE_PUBLICA = "src/lib/foodos-public.ts"

function read(path: string): string {
  return readFileSync(join(REPO, path), "utf8")
}

/** Quita comentarios de línea y de bloque: una mención en un comentario no es una escritura. */
function sinComentarios(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
}

function listarArchivos(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO, dir))) {
    const rel = join(dir, entry)
    if (statSync(join(REPO, rel)).isDirectory()) {
      listarArchivos(rel, out)
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(rel)
    }
  }
  return out
}

/** Los archivos de la superficie del dueño, sin tests. */
const ARCHIVOS_DEL_DUENO = PERIMETRO_DEL_DUENO.flatMap((dir) => listarArchivos(dir))

const MODULO_SRC = sinComentarios(read(MODULO))
const MIGRACION_SRC = sinComentarios(read(MIGRACION))
const ACCIONES_SRC = sinComentarios(read(ACCIONES_DEL_DUENO))
const RUTA_ADMIN_SRC = sinComentarios(read(RUTA_ADMIN))
const PUBLICO_SRC = sinComentarios(read(SUPERFICIE_PUBLICA))

/** Una escritura de estado con el literal `active`, en cualquier forma de objeto. */
const ESCRIBE_ACTIVE = /status\s*:\s*["']active["']/

describe("E.3 — la base es la autoridad", () => {
  it("R4 — 00168 rechaza con 42501 que un no-admin escriba `active`", () => {
    expect(MIGRACION_SRC).toContain("foodos_restaurant_moderation_guard")
    // El rechazo tiene que nombrar `active` y levantar 42501: si sólo comprobara
    // los campos de revisión, publicarse seguiría siendo posible.
    const rechazo = /NEW\.status\s*=\s*'active'[\s\S]{0,600}?ERRCODE\s*=\s*'42501'/
    expect(MIGRACION_SRC).toMatch(rechazo)
    expect(MIGRACION_SRC).toContain("is_admin")
  })

  it("R4b — el trigger es BEFORE y cubre INSERT y UPDATE", () => {
    // `INSERT` importa porque un restaurante puede nacer `active` si alguien
    // manda la fila completa; `UPDATE` es el caso normal.
    const trigger = /CREATE\s+TRIGGER\s+foodos_restaurant_moderation_guard[\s\S]{0,200}?BEFORE\s+(INSERT\s+OR\s+UPDATE|UPDATE\s+OR\s+INSERT)/i
    expect(MIGRACION_SRC).toMatch(trigger)
  })

  it("R4c — existe el RPC de revisión y exige admin", () => {
    expect(MIGRACION_SRC).toContain("foodos_restaurant_review")
    expect(MIGRACION_SRC).toMatch(/role\s*=\s*'admin'/)
  })
})

describe("E.3 — el módulo puro no habilita `active`", () => {
  it("R1a — `active` no aparece como destino en la tabla de transiciones del dueño", () => {
    const tabla = /const\s+TRANSICIONES_DEL_DUENO[^=]*=\s*\{([\s\S]*?)\n\}/
    const match = MODULO_SRC.match(tabla)
    expect(match).not.toBeNull()
    const cuerpo = match?.[1] ?? ""
    // Cada entrada es `<estado>: [<destinos>]`. Ningún destino puede ser `active`.
    const destinos = Array.from(cuerpo.matchAll(/:\s*\[([^\]]*)\]/g)).map((m) => m[1] ?? "")
    expect(destinos.length).toBe(4)
    for (const lista of destinos) {
      expect(lista).not.toContain("active")
    }
  })

  it("R1b — el único estado público es `active`, y sale de una constante", () => {
    expect(MODULO_SRC).toMatch(/FOODOS_PUBLIC_STATUS\s*=\s*["']active["']/)
  })

  it("R1c — `checkOwnerTransition` rechaza `active` antes de mirar la tabla", () => {
    const cuerpo = MODULO_SRC.match(
      /export function checkOwnerTransition[\s\S]*?\n\}/
    )?.[0]
    expect(cuerpo).toBeTruthy()
    const soloAdmin = cuerpo?.indexOf("solo_admin") ?? -1
    const tabla = cuerpo?.indexOf("TRANSICIONES_DEL_DUENO") ?? -1
    expect(soloAdmin).toBeGreaterThan(-1)
    expect(tabla).toBeGreaterThan(-1)
    // Si la tabla se consultara primero, `active` caería en
    // `transicion_invalida` y el dueño leería «recarga la página» cuando la
    // verdad es «no te toca».
    expect(soloAdmin).toBeLessThan(tabla)
  })
})

describe("E.3 — la superficie del dueño no escribe `active`", () => {
  it("R2 — ningún archivo del panel o de la lib de FoodOS escribe `status: \"active\"`", () => {
    const culpables = ARCHIVOS_DEL_DUENO.filter((rel) =>
      ESCRIBE_ACTIVE.test(sinComentarios(read(rel)))
    )
    expect(culpables).toEqual([])
  })

  it("R2b — el perímetro no está vacío (si lo estuviera, R2 pasaría por vacuidad)", () => {
    expect(ARCHIVOS_DEL_DUENO.length).toBeGreaterThanOrEqual(20)
    expect(ARCHIVOS_DEL_DUENO).toContain(ACCIONES_DEL_DUENO)
  })

  it("R3 — `upsertRestaurant` no acepta `status` en su entrada", () => {
    const firma = ACCIONES_SRC.match(/export async function upsertRestaurant\(([\s\S]*?)\n\}\)/)
    expect(firma).toBeTruthy()
    const entrada = firma?.[1] ?? ""
    // Antes aceptaba `status?: FoodosRestaurantStatus` y lo escribía como
    // `input.status ?? "draft"`: cada guardado del perfil despublicaba el
    // restaurante. La entrada no puede volver a tenerlo.
    expect(entrada).not.toMatch(/\bstatus\??\s*:/)
  })

  it("R3b — el `payload` de `upsertRestaurant` no lleva `status`", () => {
    const payload = ACCIONES_SRC.match(/const payload = \{([\s\S]*?)\n {2}\}/)
    expect(payload).toBeTruthy()
    expect(payload?.[1] ?? "").not.toMatch(/\bstatus\s*:/)
  })

  it("R3c — un restaurante nuevo nace en `draft`", () => {
    expect(ACCIONES_SRC).toMatch(/status:\s*["']draft["']/)
  })

  it("R2c — `setRestaurantStatus` valida con `checkOwnerTransition` antes de escribir", () => {
    const cuerpo = ACCIONES_SRC.match(
      /export async function setRestaurantStatus\([\s\S]*?\n\}/
    )?.[0]
    expect(cuerpo).toBeTruthy()
    expect(cuerpo).toContain("checkOwnerTransition")
    const valida = cuerpo?.indexOf("checkOwnerTransition") ?? -1
    const escribe = cuerpo?.indexOf(".update(") ?? -1
    expect(valida).toBeGreaterThan(-1)
    expect(escribe).toBeGreaterThan(-1)
    expect(valida).toBeLessThan(escribe)
    // El mensaje que ve el dueño sale del módulo, no de un literal suelto.
    expect(cuerpo).toContain("ownerStatusErrorMessage")
  })
})

describe("E.3 — la decisión del admin es el único camino a `active`", () => {
  it("R5 — sólo la ruta admin llama a `foodos_restaurant_review`", () => {
    const llamadores = ARCHIVOS_DEL_DUENO.filter((rel) =>
      /\.rpc\(\s*["']foodos_restaurant_review["']/.test(sinComentarios(read(rel)))
    )
    expect(llamadores).toEqual([])
    expect(RUTA_ADMIN_SRC).toMatch(/\.rpc\(\s*["']foodos_restaurant_review["']/)
  })

  it("R5b — la ruta admin sólo expone POST", () => {
    const exportados = Array.from(
      RUTA_ADMIN_SRC.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)
    ).map((m) => m[1])
    expect(exportados).toEqual(["POST"])
  })

  it("R5c — la ruta admin valida la entrada y pasa el actor", () => {
    expect(RUTA_ADMIN_SRC).toContain("validateReviewInput")
    expect(RUTA_ADMIN_SRC).toContain("p_actor")
    expect(RUTA_ADMIN_SRC).toContain("requireAdmin")
  })

  it("R5d — la decisión invalida la caché pública, para que el cambio se vea", () => {
    // Sin esto, aprobar un restaurante lo dejaría invisible hasta cinco minutos
    // (`getPublicRestaurantBySlug` tiene `revalidate: 300`).
    expect(RUTA_ADMIN_SRC).toContain("revalidateTag")
    expect(RUTA_ADMIN_SRC).toContain("foodos-public")
  })
})

describe("E.3 — la moderación sigue gobernando la visibilidad", () => {
  it("R6 — la superficie pública filtra por `status = 'active'`", () => {
    const filtros = PUBLICO_SRC.match(/\.eq\(\s*["']status["']\s*,\s*["']active["']\s*\)/g) ?? []
    // Dos: el micrositio por slug y el marketplace.
    expect(filtros.length).toBeGreaterThanOrEqual(2)
  })

  it("R6b — el estado público del módulo es el mismo literal que el filtro", () => {
    // Si alguien renombrara el estado público a `published`, el filtro de la
    // superficie pública seguiría diciendo `active` y los micrositios
    // desaparecerían sin que ningún test de unidad lo notara.
    expect(MODULO_SRC).toMatch(/FOODOS_PUBLIC_STATUS\s*=\s*["']active["']/)
    expect(PUBLICO_SRC).toMatch(/["']active["']/)
  })
})
