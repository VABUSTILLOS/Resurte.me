import { describe, expect, it } from "vitest"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, relative, sep } from "node:path"
import {
  ADMIN_PERMISSIONS,
  ADMIN_SECTIONS,
  adminSectionForPath,
  type AdminPermission,
} from "@/lib/admin-permissions"

/**
 * Contrato de los permisos granulares de /admin.
 *
 * Contexto: `ADMIN_SECTIONS` (`admin-permissions.ts`) es la única fuente de
 * verdad de *qué dominio* gobierna cada ruta de /admin, pero **no se aplica
 * sola**. El mapa vive en un módulo puro; la aplicación ocurre en tres sitios
 * distintos y cada uno puede desincronizarse por su cuenta:
 *
 *   1. `src/app/admin/<sección>/layout.tsx` — el guard que **abre** la sección.
 *   2. `src/app/api/admin/**\/route.ts`     — el guard que **sirve los datos**.
 *   3. `src/app/admin/sub-nav.tsx`          — lo que **se ve** en el menú.
 *
 * Los tres fallos posibles son silenciosos y opuestos:
 *
 *   - Una página **sin** layout de sección → la sección queda abierta a
 *     cualquier admin, aunque el menú la oculte. Fail-open.
 *   - Una página declarada en el mapa **pero sin** `page.tsx` → el mapa miente.
 *   - Una ruta de API que sirve datos de un dominio **sin declararlo** → un
 *     admin restringido ve la página y la página se queda en blanco. El peor
 *     de los tres: no hay error, solo datos que no cargan.
 *
 * Este contrato recorre el árbol real y exige que los tres coincidan. La lista
 * `DASHBOARD_ROUTES` no es una excepción cómoda: es la decisión explícita de
 * que `/admin` (el panel de inicio) es la superficie de **todos** los admins,
 * y por eso sus endpoints no llevan dominio. La prueba falla si esa lista
 * cambia sin que cambie el código — así, agregar una ruta obliga a decidir.
 */

const ADMIN_APP_DIR = join(process.cwd(), "src", "app", "admin")
const ADMIN_API_DIR = join(process.cwd(), "src", "app", "api", "admin")

/**
 * Endpoints que **deliberadamente** no tienen dominio porque los consume el
 * panel de inicio (`/admin/page.tsx`) o el sub-nav. Restringirlos dejaría el
 * panel de inicio roto para un admin de un solo dominio, que es la primera
 * pantalla que ve al entrar.
 */
const DASHBOARD_ROUTES = [
  "audit-log",
  "city-performance",
  "city-performance/tip",
  "drivers",
  "metrics",
  "pending-count",
] as const

/** Guard de página con dominio. */
const PAGE_GUARD_RE = /requireAdminPage\(\{\s*permission:\s*"([a-z]+)"\s*\}\)/
/** Guard de API con dominio. */
const API_GUARD_RE = /requireAdmin\(\{\s*permission:\s*"([a-z]+)"\s*\}\)/
/** Llamada sin argumentos (sin restringir). */
const BARE_GUARD_RE = /requireAdmin\(\)/

function walk(dir: string, fileName: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full, fileName))
    else if (entry.name === fileName) out.push(full)
  }
  return out
}

/** `/admin/productos` a partir de `.../src/app/admin/productos/page.tsx`. */
function toRoutePath(file: string, base: string): string {
  const rel = relative(base, file).split(sep).join("/").replace(/\/?page\.tsx$/, "")
  return rel ? `/admin/${rel}` : "/admin"
}

/** El layout más cercano subiendo desde el directorio de la página. */
function nearestLayout(pageFile: string): string | null {
  let dir = join(pageFile, "..")
  const adminRoot = join(process.cwd(), "src", "app")
  while (dir.startsWith(adminRoot)) {
    const candidate = join(dir, "layout.tsx")
    if (existsSync(candidate)) return candidate
    if (dir === adminRoot) break
    dir = join(dir, "..")
  }
  return null
}

const PAGE_FILES = walk(ADMIN_APP_DIR, "page.tsx")
const API_FILES = walk(ADMIN_API_DIR, "route.ts")
/** El shell de /admin: el guard que corta a los visitantes anónimos. */
const ADMIN_ROOT_LAYOUT = join(ADMIN_APP_DIR, "layout.tsx")

describe("contrato de secciones de /admin", () => {
  it("encuentra páginas y rutas que revisar", () => {
    // Si esto falla, el resto del archivo pasaría sin revisar nada.
    expect(PAGE_FILES.length).toBeGreaterThanOrEqual(20)
    expect(API_FILES.length).toBeGreaterThanOrEqual(55)
  })

  it("cada página de /admin tiene un guard que la abre", () => {
    const sinGuard: string[] = []

    for (const pageFile of PAGE_FILES) {
      const layout = nearestLayout(pageFile)
      if (!layout) {
        sinGuard.push(`${toRoutePath(pageFile, ADMIN_APP_DIR)} (sin layout.tsx)`)
        continue
      }
      const src = readFileSync(layout, "utf8")
      // El layout raíz usa `resolveAdminAccess` (decide qué se ve); los de
      // sección usan `requireAdminPage` (deciden qué se puede abrir).
      if (!src.includes("requireAdminPage") && !src.includes("resolveAdminAccess")) {
        sinGuard.push(toRoutePath(pageFile, ADMIN_APP_DIR))
      }
    }

    expect(sinGuard).toEqual([])
  })

  it("el permiso del layout coincide con el del mapa", () => {
    const desalineados: string[] = []

    for (const pageFile of PAGE_FILES) {
      const route = toRoutePath(pageFile, ADMIN_APP_DIR)
      const esperado = adminSectionForPath(route)
      if (esperado === undefined) {
        desalineados.push(`${route}: no está declarada en ADMIN_SECTIONS`)
        continue
      }
      if (esperado === null) continue // dashboard: sin dominio, a propósito

      const layout = nearestLayout(pageFile)
      if (!layout) {
        desalineados.push(`${route}: sin layout`)
        continue
      }
      const found = PAGE_GUARD_RE.exec(readFileSync(layout, "utf8"))
      if (!found) {
        desalineados.push(`${route}: el layout no declara permiso`)
      } else if (found[1] !== esperado) {
        desalineados.push(`${route}: layout="${found[1]}" mapa="${esperado}"`)
      }
    }

    expect(desalineados).toEqual([])
  })

  it("toda sección declarada existe como página", () => {
    const declaradas = ADMIN_SECTIONS.filter((s) => s.path !== "/admin").map((s) => s.path)
    const faltantes = declaradas.filter(
      (p) => !existsSync(join(process.cwd(), "src", "app", p, "page.tsx"))
    )
    expect(faltantes).toEqual([])
  })

  it("solo los endpoints del panel de inicio van sin dominio", () => {
    const sinDominio: string[] = []

    for (const apiFile of API_FILES) {
      const src = readFileSync(apiFile, "utf8")
      if (!src.includes("requireAdmin")) continue
      const rel = relative(ADMIN_API_DIR, apiFile).split(sep).join("/").replace(/\/route\.ts$/, "")
      const esDashboard = (DASHBOARD_ROUTES as readonly string[]).includes(rel)
      const conDominio = API_GUARD_RE.test(src)
      const sinArgumentos = BARE_GUARD_RE.test(src)

      if (esDashboard && conDominio) {
        sinDominio.push(`${rel}: es del panel de inicio pero declara dominio`)
      } else if (!esDashboard && !conDominio) {
        sinDominio.push(`${rel}: sirve datos de un dominio y no lo declara`)
      } else if (sinArgumentos && !esDashboard) {
        sinDominio.push(`${rel}: conserva una llamada sin argumentos`)
      }
    }

    expect(sinDominio).toEqual([])
  })

  it("todo dominio declarado en el código es un dominio conocido", () => {
    const desconocidos = new Set<string>()
    const conocidos = new Set<string>(ADMIN_PERMISSIONS)

    for (const file of [...PAGE_FILES.map(nearestLayout), ...API_FILES]) {
      if (!file) continue
      const src = readFileSync(file, "utf8")
      for (const re of [PAGE_GUARD_RE, API_GUARD_RE]) {
        // Un archivo puede tener varios handlers; se revisan todas las llamadas.
        for (const match of src.matchAll(new RegExp(re, "g"))) {
          const permiso = match[1] as AdminPermission
          if (!conocidos.has(permiso)) desconocidos.add(permiso)
        }
      }
    }

    expect([...desconocidos]).toEqual([])
  })

  it("el login de un anónimo recuerda la sección que pidió", () => {
    // El fallo que esto vigila: un `next=/admin` **literal** en el guard manda
    // a todo el mundo al mismo destino, así que quien abre un enlace profundo
    // inicia sesión y aterriza en el panel de inicio con su sección perdida.
    // Se veía bien en las pruebas porque solo se exigía "acaba en /auth/login".
    // El destino correcto solo lo conoce el proxy (`x-pathname`), y llega por
    // `adminLoginPath()`. Cualquier guard nuevo debe usarla, no un literal.
    const desviados: string[] = []

    for (const file of new Set([ADMIN_ROOT_LAYOUT, ...PAGE_FILES.map(nearestLayout)])) {
      if (!file || !existsSync(file)) continue
      const src = readFileSync(file, "utf8")
      if (/"\/auth\/login\?next=[^"]*"/.test(src) || /next=\/admin(?![a-z-])/.test(src)) {
        desviados.push(relative(process.cwd(), file).split(sep).join("/"))
      }
    }

    expect(desviados).toEqual([])

    // Y el shell lo hace de verdad, no por omisión: sin `adminLoginPath` no
    // hay destino que recordar.
    const shell = readFileSync(ADMIN_ROOT_LAYOUT, "utf8")
    expect(shell).toContain("adminLoginPath")
    expect(shell).toContain("ADMIN_PATH_HEADER")
  })
})
