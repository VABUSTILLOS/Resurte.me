import type { FullConfig } from "@playwright/test"

/**
 * Calentamiento de rutas.
 *
 * En dev, Next compila cada ruta la primera vez que se pide. El primer spec
 * que toca una ruta paga esa compilación en frío y a veces agota el timeout
 * de 30 s: es la causa número uno de flakes de e2e en este repo. Este setup
 * compila las rutas antes de que arranque el primer test.
 *
 * Es un calentamiento, **no una aserción**: si una ruta no responde se
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
 * 120 s es una fracción declarada del presupuesto del job (`timeout-minutes:
 * 25` = 1500 s), no un ajuste a ninguna medición de corte: se midió que en
 * frío las 64 rutas tardan del orden de 50 s (17 s con 21 rutas, escalado), así
 * que un presupuesto menor cortaría el calentamiento en cada corrida. Con esta
 * cota el peor caso baja de 3,2 h a 2 min, y los tests conservan ~23 min.
 */
const WARM_BUDGET_MS = 120_000

/**
 * Rutas calentadas en paralelo por lote.
 *
 * El bucle era estrictamente secuencial "porque en paralelo varias
 * compilaciones simultáneas de Next en dev se pelean por la CPU". Eso es
 * cierto **sin cota**. Medido en caliente sobre 66 rutas: 1 → 2,9 s, 2 → 2,6 s,
 * 4 → 2,45 s, 8 → 2,3 s, 16 → 2,6 s. Es decir, la ganancia es pequeña y se
 * agota en 4; a partir de ahí solo crece la contención de CPU, que es lo que el
 * comentario original temía. Cuatro es el punto donde la curva se aplana.
 *
 * La cura del calentamiento no es esta constante, es el deadline: esto solo
 * evita que el caso frío desaproveche los huecos de espera.
 */
const CONCURRENCY = 4

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
  // Carrito y cupón: los llama la UI del carrito al montar. `/api/cart/bumps`
  // se midió compilando en frío dentro de un test (money-flows, cupón válido).
  "/api/cart",
  "/api/cart/bumps",
  "/api/coupons/validate",
  "/manifest.json",
]

const ALL_ROUTES = [...ROUTES, ...API_ROUTES]

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

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use.baseURL ?? `http://localhost:${process.env.E2E_PORT ?? "3000"}`

  const started = Date.now()
  const deadline = started + WARM_BUDGET_MS
  const elapsed = () => Math.round((Date.now() - started) / 1000)

  const failures: string[] = []
  const pending: string[] = []
  let done = 0
  let nextReport = PROGRESS_EVERY

  // Por lotes acotados: en frío cada ruta espera E/S y compilación, así que
  // unas pocas en vuelo solapan esas esperas sin pelearse por la CPU.
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

  if (pending.length === 0 && failures.length === 0) {
    console.log(`[e2e] Calentamiento de ${ALL_ROUTES.length} rutas en ${seconds}s`)
  }
}
