import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { chromium, type FullConfig } from "@playwright/test"

/**
 * Calentamiento de rutas.
 *
 * En dev, Next compila cada ruta la primera vez que se pide. El primer spec
 * que toca una ruta paga esa compilación en frío y a veces agota el timeout
 * de 30 s: es la causa número uno de flakes de e2e en este repo. Este setup
 * compila las rutas antes de que arranque el primer test.
 *
 * Son **dos pasadas**, porque Next compila dos cosas distintas:
 *
 * 1. `warm()` — `fetch`. Compila los **módulos de servidor**: el HTML llega.
 * 2. `warmClient()` — un navegador real con `waitUntil: "load"`. Compila los
 *    **bundles de cliente**. Un `fetch` no ejecuta JavaScript, así que hasta
 *    que un navegador real pide una ruta su *client chunk* sigue sin
 *    compilarse — y esa compilación se paga dentro del presupuesto de la
 *    primera aserción, no en este setup.
 *
 * La segunda pasada no es un lujo, es una medición: en frío, el *client chunk*
 * de `/panel` tardó **23,6 s** en compilar con dos navegaciones en paralelo,
 * mientras que la primera pasada ya había calentado su parte de servidor. Eso
 * consumía entero el presupuesto de 8 s de la aserción del banner de cookies
 * y el de 30 s de `waitForSelector("main#main-content")` en `/` — fallos que
 * reportaban el servidor de desarrollo como si fueran defectos del producto.
 *
 * Ambas pasadas son **calentamiento, no aserción**: si una ruta no responde se
 * registra y el run continúa, porque el spec real es quien debe reportar el
 * fallo que importa. Los reintentos también cubren el caso de que el
 * `webServer` todavía no esté escuchando.
 */
const ROUTES = [
  // Públicas de marketing (las que más pesan: force-static + revalidate)
  "/",
  "/comer",
  "/blog",
  "/restaurantes",
  // Ciudad y sus derivadas
  "/cdmx",
  "/cdmx/carrito",
  "/cdmx/buscar",
  // Cuenta y monedero
  "/recompensas",
  // Panel y admin (redirigen a login sin sesión: también compilan)
  "/panel",
  "/admin",
  "/admin/restaurantes",
  "/admin/bitacoras",
  // Punto de venta (Fase 1–3 de la paridad con Maspedidos). Sin sesión
  // redirigen a login; lo que se paga en frío es la compilación del segmento.
  "/panel/foodos/tablero",
  "/panel/foodos/mostrador",
  "/panel/foodos/mesas",
  "/panel/foodos/caja",
  "/panel/foodos/pedidos",
  // Herramientas premium: e2e/foodos.spec.ts las visita sin sesión, así que
  // sin calentar cada una era un flake esperando a ocurrir.
  "/panel/foodos/inbox",
  "/panel/foodos/pos",
  "/panel/foodos/wallet",
  "/panel/foodos/catering",
  "/panel/foodos/sitio-ia",
  "/panel/foodos/mesero-ia",
  "/panel/foodos/flotilla",
  "/panel/foodos/clientes",
  // Marketplace: el 404 real de una ficha inexistente (ver foodos-pos.spec.ts).
  "/comer/no-existe-este-restaurante",
  // Micrositio de restaurante: el 404 real y su carta. Estas rutas devuelven
  // 404 a propósito (guard del layout); el calentamiento es de compilación, no
  // de datos, así que el status es indiferente.
  "/r/no-existe",
  "/r/no-existe/carta",
  // 404 raíz
  "/ruta-inexistente-xyz",
  // --- Auditoría de rutas (ronda 4) ---
  // Estas 17 rutas las visitan specs pero NO estaban calentadas, así que cada
  // una era un flake esperando a ocurrir: el primero que la tocaba pagaba la
  // compilación del segmento dentro de su propio timeout. Caso medido:
  // /compartir fallaba en frío y pasaba en caliente en el mismo server.
  // Se calienta un slug por segmento — la compilación es del segmento, no del
  // valor — por eso basta /cdmx/checkout y no también /chihuahua/checkout.
  "/admin/marketing",
  "/admin/pedidos",
  "/admin/productos",
  "/admin/usuarios",
  "/auth/login",
  "/auth/register",
  "/auth/reset",
  "/calificar",
  "/cart",
  "/compartir",
  "/negocio/credito",
  "/panel/comanda",
  "/panel/rentabilidad",
  "/cdmx/checkout",
  "/cdmx/mis-pedidos",
  "/catalogo/cdmx",
  "/blog/guia-marketing-restaurantes",
  // --- Auditoría de rutas (ronda 15) ---
  // Rutas que un spec `@ci` visita y que el calentamiento no cubría. Se midió
  // resolviendo cada ruta de los specs contra los patrones reales de
  // `src/app/**/page.tsx|route.ts`, no contra la lista: `/chihuahua/checkout`
  // parecía un hueco y no lo es (resuelve a `/[ciudad]/checkout`, ya
  // calentado), mientras que `/comercializacion/agente` sí lo era y no se veía
  // a simple vista. Se calienta un slug por patrón dinámico: la compilación es
  // del segmento, no del valor.
  "/admin/leads",
  "/comercializacion",
  "/comercializacion/prospectos",
  "/comercializacion/prospectos/999999",
  "/comercializacion/agente",
  "/comercializacion/pedidos",
  "/auth/callback",
  "/api/admin/products/audit",
  // --- Auditoría de rutas (ronda 22) ---
  // El barrido de guardas (`e2e/admin-guards.spec.ts`) recorre **todas** las
  // secciones de `ADMIN_SECTIONS`, no solo las que algún spec nombraba. Once de
  // ellas no aparecían en ningún spec, así que el calentamiento tampoco las
  // cubría: cada una habría pagado su compilación en frío dentro del timeout
  // de su propia prueba, que es justo el flake que este archivo existe para
  // evitar. El barrido visita las 19; estas 11 completan la lista.
  "/admin/comisiones",
  "/admin/conversion",
  "/admin/foodos/dispersiones",
  "/admin/foodos/restaurantes",
  "/admin/operar",
  "/admin/proveedores",
  "/admin/recompensas",
  "/admin/repartidores",
  "/admin/seo-ia",
  "/admin/sistema",
  "/admin/whatsapp",
]

const ATTEMPTS = 3

/**
 * Timeout por intento y por ruta.
 *
 * Antes 60 s, que con `ATTEMPTS = 3` daba **180 s para una sola ruta colgada**:
 * tres veces el presupuesto entero de abajo. Una ruta que no responde no debe
 * poder comerse el calentamiento de las otras 63.
 */
const ROUTE_TIMEOUT_MS = 15_000

/**
 * Presupuesto duro del calentamiento, en milisegundos.
 *
 * El peor caso teórico (rutas × intentos × timeout) siempre será mayor que este
 * número: la lista crece con el catálogo y el presupuesto no. Lo que impide que
 * el calentamiento se coma el job no es el timeout por ruta, es **este
 * deadline**: al agotarse, deja de calentar, nombra lo que faltó y devuelve el
 * control a los tests.
 *
 * 180 s es una fracción declarada del presupuesto del job (`timeout-minutes:
 * 25` = 1500 s). Antes eran 120 s, con la medición "en frío las 64 rutas tardan
 * del orden de 50 s". Esa cifra es falsa y ahora se sabe por qué: se tomó de
 * corridas en las que el manifest ya estaba corrupto, y un servidor que
 * responde 500 no compila nada, así que "calentar" 64 rutas parecía
 * instantáneo.
 *
 * Medido con `CONCURRENCY = 1` sobre `distDir` fresco y servidor recién
 * arrancado: 68 rutas en 107 s y en 169 s (la varianza entre corridas es de
 * ~1,6×, con la CPU compartida). Escalado a las 83 rutas reales el orden de
 * magnitud es 130–200 s. Con 120 s el presupuesto cortaba el calentamiento en
 * cada corrida fría, que es justo lo que este comentario quería evitar.
 *
 * Con esta cota el peor caso baja de 3,2 h a 3 min, y los tests conservan ~22
 * min. Al agotarse no se pierde nada: lo que falte se compila durante los tests.
 *
 * **Medido después: 180 s NO alcanzan en dev.** En una corrida fría real el
 * calentamiento hizo 48/83 en 21 s y luego se atascó ~159 s en una sola ruta
 * (`/api/admin/products/audit`, que no responde: 3 intentos × 15 s), y el
 * presupuesto se agotó con 29 rutas sin calentar — las 11 últimas de `ROUTES`
 * más las 18 de `API_ROUTES`. Las 130–200 s extrapoladas se quedaron cortas
 * porque la varianza entre corridas es mayor de lo medido, y porque el deadline
 * se comprueba **entre lotes**, así que una ruta en vuelo puede pasarse del
 * presupuesto sin que se la interrumpa.
 *
 * En modo "prod" del `webServer` esto deja de importar: sin compilación bajo
 * demanda las 83 rutas responden de inmediato y el calentamiento es casi
 * instantáneo. La cota sigue siendo la correcta para CI, que corre en dev.
 */
const WARM_BUDGET_MS = 180_000

/**
 * Rutas calentadas por lote. **Debe quedarse en 1.**
 *
 * El bucle era estrictamente secuencial "porque en paralelo varias
 * compilaciones simultáneas de Next en dev se pelean por la CPU". Una ronda
 * anterior subió esta constante a 4 con una medición de *rendimiento*
 * (1 → 2,9 s, 2 → 2,6 s, 4 → 2,45 s, 8 → 2,3 s, 16 → 2,6 s: la ganancia se
 * agota en 4). La medición era correcta y aun así la conclusión era errónea: el
 * costo de la concurrencia no es la CPU, es la **corrupción del manifest**.
 *
 * Next en dev reescribe `dev/prerender-manifest.json` cada vez que descubre una
 * ruta prerenderizable, y **no trunca**: si la escritura nueva es más corta que
 * la anterior, deja la cola de la vieja pegada al final y el archivo deja de
 * ser JSON. Con una sola ruta en vuelo cada escritura es un superconjunto de la
 * anterior, así que el archivo solo crece y nunca queda basura. Con cuatro, dos
 * descubrimientos que terminan en la misma ventana escriben a la vez y el más
 * corto gana.
 *
 * Medido con `warm()` sobre `distDir` fresco y servidor recién arrancado (solo
 * `fetch`, sin navegador): con `CONCURRENCY = 4` el manifest queda corrupto en
 * la ruta 8 de 64 (`pos=1468 len=1631`), y con `CONCURRENCY = 1` sobrevive sano
 * a las 68 rutas (`OK 14712`), en dos corridas.
 *
 * El daño es permanente para esa instancia: el `SyntaxError` hace crashear a
 * `next-server`, `next dev` lo reinicia, el reinicio reescribe otro manifest
 * corto sin truncar y la corrupción se perpetúa. Borrar el archivo no lo
 * recupera; solo parar el servidor y borrar el `distDir`. Por eso la corrida
 * que se corrompe no falla de forma legible: deja cientos de errores JSON y
 * todos los tests en timeout. `assertManifestSano` corta ese caso al principio.
 *
 * En modo "prod" del `webServer` nada de esto puede ocurrir: sin `next dev` no
 * hay manifest que reescribir, así que la constante pasa a ser una simple
 * cortesía de carga y podría subirse. Se queda en 1 porque en prod tampoco
 * cuesta: sin compilación que serializar, las rutas responden al instante.
 */
const CONCURRENCY = 1

/** Cada cuántas rutas se imprime progreso. */
const PROGRESS_EVERY = 8

/**
 * Rutas de API que los specs golpean **directamente** (`request.post`) o que
 * las páginas llaman desde el cliente al montar. Un `GET` basta para
 * compilarlas: las que solo exportan `POST`/`PATCH` responden 405, pero el
 * módulo queda compilado — que es todo lo que buscamos aquí.
 *
 * Se añadieron tras medir el caso contrario: con las páginas calentadas pero
 * estas sin calentar, `/api/addresses/guest` tardó **10,9 s** en su primera
 * petición y tumbó el primer test de `compartir.spec.ts` en el primer
 * proyecto. Es el mismo fallo que el agujero de páginas, una capa más abajo.
 */
const API_ROUTES = [
  "/api/addresses/guest",
  "/api/orders",
  "/api/orders/1/status",
  "/api/reviews",
  "/api/redeem",
  "/api/foodos/orders",
  "/api/foodos/catering/request",
  "/api/payments/stripe/create-intent",
  "/api/admin/audit-log",
  "/api/admin/drivers",
  "/api/admin/products/list",
  "/api/admin/products/update",
  "/api/admin/products/city-availability",
  "/api/admin/products/bulk",
  // Resumen por proveedor del apartado "Proveedores" de /admin/productos.
  "/api/admin/suppliers/overview",
  // Carrito y cupón: los llama la UI del carrito al montar. `/api/cart/bumps`
  // se midió compilando en frío dentro de un test (money-flows, cupón válido).
  "/api/cart",
  "/api/cart/bumps",
  "/api/coupons/validate",
  "/manifest.json",
]

const ALL_ROUTES = [...ROUTES, ...API_ROUTES]

/**
 * Rutas cuyo **bundle de cliente** se compila con un navegador real.
 *
 * Es un subconjunto, no la lista entera: la primera pasada ya cubre los
 * módulos de servidor de las 83, y lo que queda por pagar aquí es el *client
 * chunk*. Se eligen las que un spec `@ci` visita en su **primera** aserción
 * —que es donde la compilación compite con el timeout— y las de bundle más
 * pesado. La compilación es del segmento, no del valor, así que un slug por
 * patrón dinámico basta.
 *
 * Criterio de inclusión: la ruta aparece en la primera aserción de un spec con
 * un presupuesto corto (8–30 s) o es la raíz de un segmento grande
 * (`/panel`, `/admin`, `/comer`).
 */
const BROWSER_ROUTES = [
  // Raíces de los segmentos grandes: el chunk más caro de cada uno.
  "/",
  "/comer",
  "/cdmx",
  "/panel",
  "/admin",
  // Primera aserción de a11y.spec.ts y keyboard.spec.ts (presupuesto 30 s).
  "/blog",
  "/cdmx/carrito",
  "/cdmx/buscar",
  "/recompensas",
  "/ruta-inexistente-xyz",
  // Primera aserción de first-visit.spec.ts (presupuesto 8 s) y del carrito.
  "/cdmx/checkout",
  // Rutas dinámicas: a11y.spec.ts descubre estos enlaces en tiempo de ejecución
  // y navega a ellos. Si el módulo `[slug]` no está compilado, la primera
  // navegación compila y el servidor de desarrollo tira la conexión
  // (`net::ERR_ABORTED` / `ECONNRESET`) dentro del presupuesto de 30 s.
  // Los slugs son de `supabase/seed.sql`; si el dato no existe la ruta se
  // compila igual (renderiza 404), que es justo lo que hace falta.
  "/cdmx/categoria/frutas-verduras",
  "/cdmx/producto/manzana-roja",
]

/** Timeout por ruta en la pasada de navegador. */
const BROWSER_ROUTE_TIMEOUT_MS = 30_000

/**
 * Presupuesto de la pasada de navegador, en milisegundos.
 *
 * Tiene su **propio** deadline en vez de compartir el de la primera pasada:
 * compartirlo haría que un calentamiento de servidor lento se comiera
 * justamente la pasada que evita los flakes, que es el fallo que este archivo
 * existe para no tener. 90 s es una fracción declarada del job
 * (`timeout-minutes: 25` = 1500 s); medido, las 11 rutas tardan del orden de
 * 25 s en frío.
 */
const BROWSER_WARM_BUDGET_MS = 90_000

/**
 * Compila los *client chunks* de `routes` navegando con un navegador real.
 *
 * `waitUntil: "load"` es la clave y no un margen: se cumple cuando los scripts
 * diferidos ya se descargaron **y ejecutaron**, que es exactamente cuando el
 * bundle de cliente está compilado y disponible. `domcontentloaded` dispara
 * antes de eso, así que no serviría para calentar. `networkidle` tampoco:
 * varias de estas rutas mantienen peticiones de fondo y no lo alcanzan.
 *
 * Se reutiliza un solo contexto y una sola página — la compilación es por
 * ruta, no por pestaña — y un fallo se registra sin abortar el resto.
 */
async function warmClient(
  baseURL: string,
  routes: readonly string[],
  deadline: number
): Promise<string[]> {
  const failures: string[] = []
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
  try {
    browser = await chromium.launch()
  } catch (error) {
    // Sin navegador no hay segunda pasada, pero los tests corren igual: es un
    // calentamiento, no un requisito.
    console.warn(`[e2e] Pasada de navegador omitida: no se pudo lanzar chromium (${String(error)})`)
    return [...routes]
  }

  try {
    const context = await browser.newContext()
    const page = await context.newPage()
    for (const route of routes) {
      if (Date.now() >= deadline) {
        failures.push(route)
        continue
      }
      try {
        await page.goto(new URL(route, baseURL).toString(), {
          waitUntil: "load",
          timeout: BROWSER_ROUTE_TIMEOUT_MS,
        })
      } catch {
        // Un timeout o un error de navegación no aborta: la ruta queda como
        // "no calentada" y los tests que la toquen pagarán la compilación,
        // igual que antes de que esta pasada existiera.
        failures.push(route)
      }
    }
    await context.close()
  } finally {
    await browser.close()
  }
  return failures
}

async function warm(baseURL: string, route: string, deadline: number): Promise<boolean> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    if (Date.now() >= deadline) return false
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS)
    try {
      // El status no importa (404 y redirects también compilan la ruta):
      // lo que importa es que la petición se complete.
      await fetch(new URL(route, baseURL), { signal: controller.signal })
      return true
    } catch {
      // Se agotó el tiempo o el server aún no escuchaba: reintentar.
    } finally {
      clearTimeout(timer)
    }
  }
  return false
}

/**
 * Aborta si el manifest de prerenderizado de `next dev` está corrupto.
 *
 * `next dev` escribe `<distDir>/dev/prerender-manifest.json` de forma no
 * atómica y, de vez en cuando, un escritor con contenido **más corto** pisa a
 * otro **sin truncar**: el archivo queda como `{…válido…}{…restos…}` y
 * `JSON.parse` revienta con `Unexpected non-whitespace character after JSON at
 * position N`. Medido: 796 bytes válidos + 163 de restos de una versión
 * anterior.
 *
 * Lo que hace que esto merezca una guarda es que el daño es **permanente para
 * esa instancia del servidor**: cada request posterior responde 500 y el
 * manifest **no se regenera ni borrándolo** (comprobado). Sin la guarda, el
 * run entero produce cientos de errores JSON y todos los tests caen por
 * timeout, reportando el servidor de desarrollo como si fuera el producto.
 * Con ella, el run muere en un segundo y dice qué hacer.
 *
 * Se comprueba dos veces —antes y después del calentamiento— porque el
 * calentamiento es justo la fase de compilación intensiva en la que se ha
 * observado la corrupción.
 *
 * En modo "prod" del `webServer` (ver `playwright.config.ts`) esta guarda no
 * tiene nada que vigilar y se convierte en un no-op: el manifest de `dev/` no
 * existe, porque lo escribe `next dev` y un build de producción sirve el de la
 * raíz del distDir, escrito una sola vez por `next build` y sin escritores
 * concurrentes. El `readFile` falla y se sale por el `return` de abajo, que es
 * exactamente el comportamiento correcto.
 */
async function assertManifestSano(config: FullConfig): Promise<void> {
  const webServer = config.webServer
  const env = webServer && typeof webServer === "object" ? webServer.env : undefined
  const distDir = env?.NEXT_DIST_DIR ?? process.env.NEXT_DIST_DIR ?? ".next"
  const manifestPath = join(distDir, "dev", "prerender-manifest.json")

  let raw: string
  try {
    raw = await readFile(manifestPath, "utf8")
  } catch {
    // Sin manifest todavía: es el estado normal antes de la primera compilación.
    return
  }

  try {
    JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `[e2e] ${manifestPath} está corrupto: ${String(error)}. ` +
        "Es un defecto conocido de `next dev` (escritura no atómica del manifest de prerenderizado) " +
        "y deja el servidor inutilizable de forma permanente: todos los tests responderían 500 y " +
        "fallarían por timeout, no por su causa real. Borrar el archivo NO lo recupera. " +
        "Parar cualquier `next dev` sobre ese distDir, borrar el distDir y repetir."
    )
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use.baseURL ?? `http://localhost:${process.env.E2E_PORT ?? "3000"}`

  await assertManifestSano(config)

  const started = Date.now()
  const deadline = started + WARM_BUDGET_MS
  const elapsed = () => Math.round((Date.now() - started) / 1000)

  const failures: string[] = []
  const pending: string[] = []
  let done = 0
  let nextReport = PROGRESS_EVERY

  // Un lote por vez: `CONCURRENCY` es 1 a propósito (ver su docstring — más de
  // una ruta en vuelo corrompe el manifest). El lote sigue existiendo porque es
  // el punto donde se consulta el deadline y se acumula lo que quedó pendiente.
  for (let index = 0; index < ALL_ROUTES.length; index += CONCURRENCY) {
    if (Date.now() >= deadline) {
      pending.push(...ALL_ROUTES.slice(index))
      break
    }

    const batch = ALL_ROUTES.slice(index, index + CONCURRENCY)
    const results = await Promise.all(batch.map((route) => warm(baseURL, route, deadline)))
    batch.forEach((route, offset) => {
      if (results[offset] !== true) failures.push(route)
    })

    done += batch.length
    if (done >= nextReport) {
      // Sin esta línea el paso de CI muere en silencio: el reporter `github`
      // no sube el buffer cuando el job se cancela, así que el único rastro
      // que queda es lo que se imprima *mientras* se calienta.
      console.log(`[e2e] calentando ${done}/${ALL_ROUTES.length} (${elapsed()}s)`)
      nextReport += PROGRESS_EVERY
    }
  }

  const seconds = elapsed()

  if (pending.length > 0) {
    // Degrada, no aborta: los tests corren igual, pagando en frío lo que no se
    // alcanzó a calentar. Se nombran las rutas para que el fallo siguiente
    // tenga un culpable en vez de un timeout anónimo.
    console.warn(
      `[e2e] Presupuesto de ${WARM_BUDGET_MS / 1000}s agotado: ${pending.length} rutas sin calentar — ${pending.join(", ")}`
    )
  }

  if (failures.length > 0) {
    console.warn(
      `[e2e] Calentamiento incompleto en ${seconds}s — sin respuesta: ${failures.join(", ")}`
    )
  }

  // Segunda pasada: los *client chunks*, que un `fetch` no toca. Arranca con su
  // propio deadline para que una primera pasada lenta no la deje sin aire.
  const clientStarted = Date.now()
  const clientFailures = await warmClient(
    baseURL,
    BROWSER_ROUTES,
    clientStarted + BROWSER_WARM_BUDGET_MS
  )
  const clientSeconds = Math.round((Date.now() - clientStarted) / 1000)

  if (clientFailures.length > 0) {
    console.warn(
      `[e2e] Bundles de cliente sin calentar en ${clientSeconds}s: ${clientFailures.join(", ")}`
    )
  }

  if (pending.length === 0 && failures.length === 0 && clientFailures.length === 0) {
    console.log(
      `[e2e] Calentamiento de ${ALL_ROUTES.length} rutas (servidor) y ${BROWSER_ROUTES.length} bundles de cliente en ${seconds + clientSeconds}s`
    )
  }

  // El calentamiento es la fase de compilación intensiva: es donde se ha visto
  // corromperse el manifest. Volver a comprobarlo aquí evita que la suite
  // arranque sobre un servidor ya muerto.
  await assertManifestSano(config)
}
