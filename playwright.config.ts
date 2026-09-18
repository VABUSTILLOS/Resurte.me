import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"

import { defineConfig, devices } from "@playwright/test"

// TMPDIR propio del e2e, purgado en cada arranque. Esto se hace ANTES de
// cualquier otra cosa porque Chromium lo lee al crear su perfil, y los
// navegadores se lanzan en los workers (que heredan `process.env` al bifurcarse
// desde el runner, después de cargar esta config).
//
// Causa raíz medida: con ~169 directorios `playwright_chromiumdev_profile-*`
// acumulados en el TMPDIR del sistema (uno por cada navegador que no cierra
// limpio: un `process.exit` en una sonda, un run interrumpido, un timeout),
// el renderizador de Chromium **se cuelga al crear cualquier documento**.
// No es un fallo del producto ni de `next`: se reproduce igual con
// `page.setContent("<h1>hola</h1>")` —sin red, sin JS— y con
// `https://example.com`, y NO con `about:blank`. La firma es inconfundible:
// `domcontentloaded` dispara en ~42 ms, `Runtime.evaluate` responde una vez y
// a los ~200-1500 ms se queda esperando para siempre, con el CPU de todos los
// procesos `chromium` a 0.0 % (no es un bucle: el hilo espera). Los tests
// mueren con `Test timeout of 30000ms exceeded` en la primera lectura del DOM.
//
// Borrar los perfiles zombis con el TMPDIR del sistema lo arregla al instante
// (`setContent`, `example.com` y la home del sitio vuelven a responder), pero
// es una limpieza que hay que recordar hacer a mano. Dando al e2e su propio
// TMPDIR, purgado en cada arranque, el run deja de depender del estado del
// sistema y la clase de fallo no puede volver. Ver la Ronda 23 en
// docs/PLAN-MEJORAS.md.
const NOMBRE_TMPDIR_E2E = "resurte-e2e"
const TMPDIR_RAIZ =
  basename(tmpdir()) === NOMBRE_TMPDIR_E2E ? dirname(tmpdir()) : tmpdir()
const TMPDIR_E2E = join(TMPDIR_RAIZ, NOMBRE_TMPDIR_E2E)
rmSync(TMPDIR_E2E, { recursive: true, force: true })
mkdirSync(TMPDIR_E2E, { recursive: true })
process.env.TMPDIR = TMPDIR_E2E

// Puerto propio del e2e, deliberadamente NO el 3000. Con `reuseExistingServer:
// false` y una caché propia, el objetivo es que el e2e conviva con el `next dev`
// del desarrollador; si comparten puerto el run muere antes del primer test
// aunque tengan `distDir` distinto, que es justo lo que se quería evitar.
// `E2E_PORT` lo ajusta.
const PORT = process.env.E2E_PORT ?? "3210"
const BASE_URL = `http://localhost:${PORT}`

// El cuello de botella del run no es la CPU sino el único `next dev` que sirve
// todo, compilando rutas bajo demanda. Medido en local con la caché en frío y
// sobre `first-visit.spec.ts` (8 tests, el spec más sensible a la hidratación):
// 1 worker → verde en 1.0 min; 2 workers → verde en 1.8 min; 4 workers → rojo.
// Los tres tardan lo mismo: la compilación serializa las peticiones, así que
// subir workers no compra velocidad y sí compra cola. El default de Playwright
// (`cpus / 2`, ~5 aquí) es el peor caso: 19/22 y 26/27 rojos, y el rojo no era
// lógica sino espera. CI no lo sufre porque corre en `ubuntu-latest` (2 vCPU →
// 1 worker), así que este tope solo alinea local con CI; `E2E_WORKERS` lo ajusta.
//
// El rojo restante tampoco era el producto. La firma que lo delataba: el mismo
// test, con el mismo código, pasaba o fallaba según la carga, y cuando fallaba lo
// hacía en el `page.goto` de una ruta ya calentada — nunca en la aserción. Se
// arregló la señal de espera (ver `openPanel` en first-visit.spec.ts y
// `warmClient` en global-setup.ts) y quedó: `a11y.spec.ts` sola 20/20,
// `a11y.spec.ts + mobile.spec.ts` juntas 89/0 en frío con 2 workers.
const WORKERS = Number(process.env.E2E_WORKERS ?? 2)

// Estrategia del servidor de pruebas. `next dev` es la causa del agotamiento de
// memoria que hacía inmirable el e2e en local: medido en esta máquina (16 GB con
// el swap al 84 %), el `next-server` del e2e crecía ~7 MB/s de forma monotónica
// hasta 6.6 GB, y macOS no puede matarlo por memoria — los procesos `node` no son
// jetsam-managed —, así que la máquina se ahogaba en swap y los tests expiraban
// en el `page.goto` con `Test timeout of 30000ms exceeded`. `next build` sobre el
// mismo árbol: 50.2 s y 216 MB de pico, 30× menos, y sirviendo desde `next start`
// no queda compilación bajo demanda que retenga módulos.
//
// El modo "prod" también deja de poder corromper el `prerender-manifest.json`:
// ese archivo lo escribe `next dev` y no existe en un build de producción, así
// que desaparece de raíz la clase de fallo que obligó a `CONCURRENCY = 1` en el
// calentamiento.
//
// CI se queda en "dev" a propósito: el job solo define dos variables de Supabase
// dummy y no tiene `.env.local`, de modo que un `next build` tendría que
// prerenderizar 678 páginas sin credenciales reales. Ahí el cambio no hace falta
// — 2 vCPU implican 1 worker y la memoria sobra. `E2E_SERVER` fuerza el modo.
type ServerMode = "dev" | "prod"
const SERVER_MODE: ServerMode =
  (process.env.E2E_SERVER as ServerMode | undefined) ?? (process.env.CI ? "dev" : "prod")
const ES_PROD = SERVER_MODE === "prod"

// Caché propia del servidor de e2e: sin esto, cualquier `next dev` abierto en el
// repo bloquea el arranque del webServer (el lock vive en `<distDir>/dev/lock`)
// y el run entero muere antes del primer test.
// Ojo al borrarla a mano: hacerlo con un servidor todavía vivo deja el caché a
// medias y el siguiente arranque falla con un JSON truncado que parece un bug
// del producto. Se borra solo entre runs, nunca durante uno.
//
// Riesgo conocido (causa raíz medida): `next dev` reescribe
// `<distDir>/dev/prerender-manifest.json` varias veces durante su vida y **no
// trunca**. Si una escritura es más corta que la anterior, el final del
// contenido viejo sobrevive pegado al nuevo y el archivo queda como
// `{…válido…}{…restos…}`. Medido dos veces:
//   - 796 bytes válidos + 163 de restos;
//   - 1445 válidos + 23 de restos, y esos 23 (`7bb4538d…`) son la **cola del
//     propio valor** `previewModeEncryptionKey` de la escritura anterior — o sea,
//     restos de una generación previa del archivo, no de otro proceso.
// Los tamaños legítimos varían (354 al arrancar, 796 tras compilar `/cdmx`), que
// es justo lo que hace posible que una escritura quede más corta que la previa.
// Eso reinterpreta las "dos claves distintas" que se vieron una vez: no eran dos
// escritores vivos, eran restos de la generación anterior del servidor.
// El síntoma en el log es inconfundible:
//   SyntaxError: Unexpected non-whitespace character after JSON at position N
// Lo que lo hace grave es que el daño es PERMANENTE para esa instancia: cada
// request posterior responde 500 y el manifest **no se regenera ni borrándolo**
// (comprobado: corrupto → 500; borrado → sigue 500 y el archivo no vuelve). Sin
// guarda, el run entero produce cientos de errores JSON y todos los tests caen
// por timeout, reportando el servidor de desarrollo como si fuera el producto:
// el run que motivó esta nota acabó con 472 errores JSON y un "calentamiento" de
// 26 s (contra 45–103 s normales), porque todo respondía 500 rápido.
// Por eso `e2e/global-setup.ts` valida el manifest antes y después del
// calentamiento. Las dos comprobaciones cubren casos distintos y ambas están
// verificadas: la de después del calentamiento aborta un run en el que el
// manifest nació sano y se corrompió durante la compilación.
// Remedio manual: parar todo `next dev` sobre ese distDir, `rm -rf .next-e2e` y
// repetir.
//
// Hipótesis DESCARTADAS sobre la corrupción, todas medidas:
// - "Dos `next dev` comparten `distDir`": imposible. Next 16 tiene candado de
//   instancia única en `<distDir>/dev/lock`; el segundo servidor se niega a
//   arrancar (`Another next dev server is already running`).
// - "Borrar el distDir durante una escritura": plausible pero no reproducido.
//
// CAUSA RAÍZ, medida y reproducida: la provoca el propio calentamiento. `warm()`
// pedía las rutas de 4 en 4 (`CONCURRENCY = 4` + `Promise.all`), y cuatro
// descubrimientos que terminan en la misma ventana escriben el manifest a la vez.
// `warmClient()` sí era secuencial; `warm()` no. Reproducido sobre `distDir`
// fresco y servidor recién arrancado, solo con `fetch` y sin navegador: con 4 en
// vuelo el manifest queda corrupto en la ruta 8 de 64 (`pos=1468 len=1631`); con
// 1 en vuelo sobrevive sano a las 68 rutas (`OK 14712`), en dos corridas. El
// `CONCURRENCY = 4` era preexistente (`git show HEAD:e2e/global-setup.ts`), así
// que el defecto es del repo y no del andamio de calentamiento. Arreglado
// bajándolo a 1: ver el docstring de `CONCURRENCY` en `e2e/global-setup.ts`.
// Ojo con el candado: `rm -rf .next-e2e` con un servidor VIVO borra el lock pero
// no mata al servidor, que sigue respondiendo 500 y recrea el lock; el siguiente
// arranque vuelve a ser rechazado. Nunca borrar el distDir con un servidor vivo.
//
// Hipótesis DESCARTADA (costó una sesión entera): "el `next dev` del e2e muere a
// mitad de corrida y `ERR_CONNECTION_REFUSED` es el servidor caído". Se midió con
// un poller externo (`curl /cdmx` cada segundo durante `a11y.spec.ts` +
// `mobile.spec.ts`, 205 muestras): 201 OK, 3 REFUSED y 1 respuesta vacía. Los 3
// REFUSED caen en los primeros 3 s, que es la ventana en que el `webServer`
// todavía no escucha; el resto del run el servidor responde siempre. Resultado de
// esa corrida: 89 passed / 0 failed / exit 0.
// La confusión vino de dos cosas: muestrear el PID con
// `lsof -ti tcp:<puerto> | head -1` (varios procesos comparten el socket, así que
// `head -1` alterna entre ellos) y que `next dev` **supervisa** a `next-server`
// y lo **resucita** si muere (matar el hijo lo devuelve con otro PID y el mismo
// padre). Para parar el servidor hay que matar el padre (`node …/.bin/next dev`),
// no el hijo.
// Conclusión: un `ERR_CONNECTION_REFUSED` o un `ERR_ABORTED` a mitad de run NO
// se persigue como defecto de producto hasta descartar antes la contención.
const DIST_DIR = ES_PROD ? ".next-e2e-build" : ".next-e2e"

export default defineConfig({
  testDir: "./e2e",
  // Compila las rutas antes del primer test: la compilación en frío de Next en
  // dev es la causa número uno de flakes (ver e2e/global-setup.ts).
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  workers: WORKERS,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    // En modo "prod" el build va dentro del comando del servidor, no en un paso
    // aparte: así la caché y el `next start` que la sirve no pueden
    // desincronizarse. Construir en otro paso permitiría servir un build viejo
    // tras un cambio de código sin que nada lo delatara.
    command: ES_PROD
      ? `npm run build:e2e && npx next start -p ${PORT}`
      : `npx next dev -p ${PORT}`,
    url: BASE_URL,
    // En false a propósito: con una caché propia, un servidor que ya estuviera
    // escuchando NO es el nuestro — otro `distDir`, otro entorno, otras
    // credenciales — así que reutilizarlo es medir el build de otro. Por ahí se
    // coló una vez un servidor ajeno con credenciales caducadas que devolvía 500
    // en las rutas del panel. Si el puerto está ocupado el run falla en claro
    // antes del primer test; se resuelve con `E2E_PORT=<puerto libre>`.
    reuseExistingServer: false,
    // El build tarda ~50 s en esta máquina y el arranque de `next start` es
    // inmediato; el margen cubre máquinas más lentas y una instalación de
    // dependencias que falte. En "dev" el arranque es rápido, pero la primera
    // compilación de una ruta bajo demanda puede tardar, de ahí los 120 s.
    timeout: ES_PROD ? 300_000 : 120_000,
    env: { NEXT_DIST_DIR: DIST_DIR },
  },
})
