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
]

const ATTEMPTS = 3
const TIMEOUT_MS = 60_000

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

async function warm(baseURL: string, route: string): Promise<boolean> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
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
  const failures: string[] = []

  // Secuencial a propósito: en paralelo, varias compilaciones simultáneas de
  // Next en dev se pelean por la CPU y tardan más que una tras otra.
  for (const route of ALL_ROUTES) {
    const ok = await warm(baseURL, route)
    if (!ok) failures.push(route)
  }

  const seconds = Math.round((Date.now() - started) / 1000)
  if (failures.length > 0) {
    console.warn(
      `[e2e] Calentamiento incompleto en ${seconds}s — sin respuesta: ${failures.join(", ")}`
    )
  } else {
    console.log(`[e2e] Calentamiento de ${ALL_ROUTES.length} rutas en ${seconds}s`)
  }
}
