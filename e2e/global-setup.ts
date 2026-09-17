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
  // Marketplace: el 404 real de una ficha inexistente (ver foodos-pos.spec.ts).
  "/comer/no-existe-este-restaurante",
  // Micrositio de restaurante: el 404 real y su carta. Estas rutas devuelven
  // 404 a propósito (guard del layout); el calentamiento es de compilación, no
  // de datos, así que el status es indiferente.
  "/r/no-existe",
  "/r/no-existe/carta",
  // 404 raíz
  "/ruta-inexistente-xyz",
]

const ATTEMPTS = 3
const TIMEOUT_MS = 60_000

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
  for (const route of ROUTES) {
    const ok = await warm(baseURL, route)
    if (!ok) failures.push(route)
  }

  const seconds = Math.round((Date.now() - started) / 1000)
  if (failures.length > 0) {
    console.warn(
      `[e2e] Calentamiento incompleto en ${seconds}s — sin respuesta: ${failures.join(", ")}`
    )
  } else {
    console.log(`[e2e] Calentamiento de ${ROUTES.length} rutas en ${seconds}s`)
  }
}
