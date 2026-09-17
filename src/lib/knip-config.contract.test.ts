import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Contrato del quinto gate de CI: `npm run knip`.
 *
 * Contexto: el paso `Knip (dead code audit)` llevaba en `.github/workflows/ci.yml`
 * desde el principio y **nunca se había verificado**. Al medirlo por primera vez
 * daba 479 problemas, casi todos falsos: `--production` esconde los archivos de
 * test, así que todo export consumido *solo* desde un `*.test.ts` se reportaba
 * como muerto, y `ignoreExportsUsedInFile` (que resuelve los exports usados
 * dentro de su propio módulo) estaba sin poner. La respuesta había sido una
 * lista de 65 entradas en `knip.ignoreIssues` que **no suprimía nada** — todas
 * eran del mismo ruido que la opción ausente ya habría eliminado. Un gate que
 * siempre está rojo no es un gate: es un paso de CI que todos aprenden a ignorar.
 *
 * Este contrato fija las cuatro decisiones que lo pusieron en verde, para que
 * ninguna se revierta por descuido:
 *
 *  1. **Sin `--production`.** Oculta los tests y con ellos la mitad del uso real.
 *  2. **`ignoreExportsUsedInFile: true`.** Elimina el ruido estructural de raíz,
 *     que es lo que hacía inútil la lista de supresiones.
 *  3. **CI y local corren exactamente lo mismo** (`npm run knip`, sin flags).
 *  4. **La allowlist no puede crecer sin una justificación escrita aquí.**
 *
 * El punto 4 es el ratchet. `ignoreIssues` es a nivel de *archivo*, no de
 * símbolo: una entrada suprime toda la categoría en ese archivo. Eso lo hace
 * cómodo y peligroso — por eso la lista está congelada por igualdad exacta y
 * cada entrada necesita su motivo en `JUSTIFICATIONS`. Añadir una entrada
 * rompe este test a propósito; la salida correcta es arreglar el código, y solo
 * cuando de verdad no se pueda, ampliar la lista *y* documentarla.
 *
 * Límite conocido y aceptado: como el mecanismo es por archivo, un export
 * muerto *nuevo* dentro de un archivo ya listado no falla aquí. Es el precio de
 * no tocar archivos que otras sesiones tienen en vuelo.
 */

const REPO = process.cwd()

/** Categorías de `ignoreIssues` que este repo permite suprimir. */
const ALLOWED_ISSUE_TYPES = ["exports", "types"] as const

/**
 * Por qué cada entrada existe. Si una entrada desaparece de la allowlist, su
 * motivo debe desaparecer también (lo comprueba el último test), para que esto
 * no se convierta en un cementerio de justificaciones obsoletas.
 */
const JUSTIFICATIONS: Record<string, string> = {
  "ignoreDependencies:sharp":
    "Importado por los scripts de imágenes de `scripts/archive/*.mjs`. knip no los " +
    "analiza porque `scripts/**` está en `knip.ignore`, así que el uso es invisible.",
  "ignoreDependencies:supabase":
    "Es el CLI del flujo de migraciones documentado en `docs/OPS.md` " +
    "(`npx supabase db push`, `migration new`, `login`): 12 invocaciones. Uso real, no código.",
  "ignoreDependencies:vercel":
    "Es el CLI de los runbooks de operación de `docs/OPS.md` " +
    "(`vercel redeploy`, `vercel api`, `vercel metrics`). Uso real, no código.",

  "src/app/admin/actions.ts":
    "Cinco server actions de escritura del CRM a medio construir: `saveQuickReply`, " +
    "`deleteQuickReply`, `distributeCrmProspects`, `getAdminSellerLoads`, " +
    "`cancelSequenceEnrollment`. La mitad *lectora* sí está cableada " +
    "(`LeadConversations.tsx` llama `getAdminQuickReplies`; `LeadSequences.tsx` muestra " +
    "`activeEnrollments`), así que no es código abandonado: es una función sin terminar.",
  "src/lib/ai/kie-ai.ts":
    "`pollTaskUntilComplete` se declara en su docstring como API cómoda para usos " +
    "piloto/demo de corta duración. Es superficie pública deliberada, no residuo.",
  "src/lib/cart-sync-queue.ts":
    "`readCartSyncEntry` es la mitad lectora de la cola de carrito y no tiene consumidor: " +
    "el service worker lee con su propio `readCartSync()` en `public/sw.js` y el respaldo " +
    "`online` del cliente reenvía el estado vivo. Duplicado pendiente de decisión.",
  "src/lib/crm-filters.ts":
    "`INBOX_VIEW_LABEL` duplica con las mismas cadenas el mapa de etiquetas de " +
    "`crm-inbox.ts`, que es el que usa la UI. Duplicado de fuente única pendiente de decisión.",
  "src/lib/integration-status.ts":
    "Archivo **nuevo y sin trackear** de otra sesión, que lo está adoptando ahora mismo " +
    "(`sendEmail()` devolvía `ok: true` con id `dev-logged`). No se toca para no chocar.",
  "src/types/foodos.ts":
    "`FoodosWalletPass`, `FoodosCourier`, `FoodosDeliveryZone`, `FoodosDelivery` y " +
    "`FoodosDeliveryEvent` espejan tablas que sí existen en migraciones " +
    "(`foodos_wallet_passes`, `foodos_couriers`, `foodos_delivery_zones`, `foodos_deliveries`, " +
    "`foodos_delivery_events`). Espejo legítimo del esquema, no código muerto.",
  "src/types/index.ts":
    "`ProductCityAvailability`, `Supplier` y `ProductSupplier` espejan las tablas " +
    "`product_city_availability`, `suppliers` y `product_suppliers`, verificadas en " +
    "migraciones. Mismo caso que `types/foodos.ts`.",
}

type KnipBlock = {
  ignore?: string[]
  ignoreExportsUsedInFile?: boolean
  ignoreDependencies?: string[]
  ignoreIssues?: Record<string, string[]>
}

type PackageJson = {
  scripts?: Record<string, string>
  knip?: KnipBlock
}

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")) as PackageJson
}

function readCi(): string {
  return readFileSync(join(REPO, ".github", "workflows", "ci.yml"), "utf8")
}

/** Claves de la allowlist, normalizadas a `categoría:valor` para poder listarlas. */
function allowlistKeys(knip: KnipBlock): string[] {
  return [
    ...(knip.ignoreDependencies ?? []).map((dep) => `ignoreDependencies:${dep}`),
    ...Object.keys(knip.ignoreIssues ?? {}),
  ].sort()
}

const PKG = readPackageJson()
const KNIP: KnipBlock = PKG.knip ?? {}
const CI = readCi()

describe("contrato de configuración de knip", () => {
  it("el bloque knip existe (canario)", () => {
    // Si el bloque desaparece, las demás aserciones pasarían en vacío.
    expect(PKG.knip, "package.json no tiene bloque `knip`").toBeDefined()
    expect(allowlistKeys(KNIP).length).toBeGreaterThan(0)
  })

  it("existe el script `knip` y no lleva flags", () => {
    // Local y CI deben correr exactamente lo mismo: la configuración vive solo
    // en la clave `knip`. Un flag aquí reabriría la brecha que este contrato cierra.
    expect(PKG.scripts?.["knip"]).toBe("knip")
  })

  it("CI corre `npm run knip`, no `knip --production`", () => {
    // `--production` esconde los archivos de test y con ellos todo export usado
    // solo desde un test: 150 falsos positivos de los 479 originales.
    expect(CI).toContain("npm run knip")
    expect(
      /knip[^\n]*--production/.test(CI),
      "`--production` vuelve a estar en CI: es la causa raíz de los 479 hallazgos"
    ).toBe(false)
  })

  it("`ignoreExportsUsedInFile` está activo", () => {
    // Sin esto reaparecen los exports usados dentro de su propio módulo, que son
    // el ruido que hacía inútil la lista de 65 supresiones borrada en la ronda 5.
    expect(KNIP.ignoreExportsUsedInFile).toBe(true)
  })

  it("la allowlist está congelada (ratchet)", () => {
    // Igualdad exacta: la lista solo puede encoger. Añadir una entrada exige
    // editar este test, y editarlo exige escribir su justificación abajo.
    expect(KNIP.ignoreDependencies?.slice().sort()).toEqual(["sharp", "supabase", "vercel"])

    expect(KNIP.ignoreIssues).toEqual({
      "src/app/admin/actions.ts": ["exports"],
      "src/lib/ai/kie-ai.ts": ["exports"],
      "src/lib/cart-sync-queue.ts": ["exports"],
      "src/lib/crm-filters.ts": ["exports"],
      "src/lib/integration-status.ts": ["exports"],
      "src/types/foodos.ts": ["types"],
      "src/types/index.ts": ["types"],
    })
  })

  it("ninguna entrada suprime una categoría que tape código muerto de verdad", () => {
    // `files` y `devDependencies` a nivel de archivo apagarían la auditoría entera
    // en ese archivo. Solo se permite silenciar exports y tipos.
    const used = Object.values(KNIP.ignoreIssues ?? {}).flat()
    const forbidden = used.filter(
      (type) => !ALLOWED_ISSUE_TYPES.includes(type as (typeof ALLOWED_ISSUE_TYPES)[number])
    )

    expect(
      forbidden,
      `Estas categorías de ignoreIssues no están permitidas: ${forbidden.join(", ")}. ` +
        `Suprimir "files" o "devDependencies" a nivel de archivo oculta el hallazgo ` +
        `en vez de arreglarlo.`
    ).toEqual([])
  })

  it("cada entrada de la allowlist tiene su justificación escrita", () => {
    const undocumented = allowlistKeys(KNIP).filter((key) => !JUSTIFICATIONS[key])

    expect(
      undocumented,
      `Estas entradas no están justificadas en JUSTIFICATIONS: ${undocumented.join(", ")}. ` +
        `Una supresión sin motivo escrito es indistinguible de un descuido.`
    ).toEqual([])
  })

  it("no quedan justificaciones obsoletas", () => {
    // Cierra el otro lado del ratchet: al encoger la allowlist hay que limpiar su
    // motivo, para que este archivo no se vuelva un cementerio de excusas muertas.
    const stale = Object.keys(JUSTIFICATIONS).filter((key) => !allowlistKeys(KNIP).includes(key))

    expect(
      stale,
      `Estas justificaciones ya no corresponden a ninguna entrada: ${stale.join(", ")}. ` +
        `Bórralas junto con la entrada.`
    ).toEqual([])
  })
})
