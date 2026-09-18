import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Contrato del reclamo de datos anónimos: **toda vía de entrada a una cuenta
 * tiene que reclamar el trabajo hecho sin cuenta.**
 *
 * Contexto: `POST /api/addresses/claim` siempre estuvo completo —vincula
 * direcciones, pedidos, platillos y datos de las herramientas por `guest_token`—
 * y `claimGuestAddresses()` siempre lo llamó bien. El fallo no estaba en el
 * endpoint: estaba en que **nadie lo invocaba en dos de las cinco vías de
 * entrada**. Solo se llamaba desde `auth-form.tsx` (contraseña, alta con sesión
 * inmediata, passkey) y desde el checkout. Google y el enlace de confirmación
 * por correo vuelven por `/auth/callback`, que es una ruta de servidor: no puede
 * leer `localStorage`, donde vive el `guest_token`. Quien se registraba con
 * Google aterrizaba con sesión y con sus platillos, sus filas de panel, sus
 * pedidos y sus direcciones todavía en `user_id NULL` — invisibles en
 * "Mis pedidos", sin cashback, sin "Repetir", sin recordatorios. Un fallo
 * silencioso: el usuario no ve un error, ve una cuenta vacía.
 *
 * Este contrato cierra las cuatro formas de reintroducirlo:
 *
 *  1. **El endpoint deja de cubrir las cinco tablas.** Media reclamación es
 *     indistinguible de ninguna para el usuario que perdió sus platillos.
 *  2. **El endpoint deja de exigir sesión.** Ahora que la red global lo invoca
 *     desde páginas públicas, un claim sin sesión sería un robo de datos: con
 *     el `guest_token` de otro visitante te quedarías con su trabajo.
 *  3. **El endpoint deja de filtrar por `guest_token`/`user_id NULL`.** El
 *     `UPDATE` corre con `service_role`, así que un filtro de menos toca filas
 *     ajenas sin que RLS lo pare.
 *  4. **La red global se desmonta del layout.** Sin ella vuelven a caer Google
 *     y la confirmación por correo, y como el endpoint sigue funcionando nadie
 *     lo nota.
 *
 * Límite conocido y aceptado: esto vigila la **forma** de los tres archivos, no
 * que el reclamo funcione contra una base real. Eso lo cubren los tests de ruta
 * y la verificación en producción.
 */

const REPO = process.cwd()

function read(relativePath: string): string {
  return readFileSync(join(REPO, relativePath), "utf8")
}

const ROUTE_PATH = "src/app/api/addresses/claim/route.ts"
const LAYOUT_PATH = "src/app/layout.tsx"
const CLAIMER_PATH = "src/components/auth/guest-claim.tsx"
const AUTH_FORM_PATH = "src/components/auth/auth-form.tsx"
const LIB_PATH = "src/lib/guest-address.ts"

const ROUTE = read(ROUTE_PATH)
const LAYOUT = read(LAYOUT_PATH)
const CLAIMER = read(CLAIMER_PATH)
const AUTH_FORM = read(AUTH_FORM_PATH)
const LIB = read(LIB_PATH)

/** Tablas que el reclamo tiene que cubrir, en el orden en que las toca. */
const REQUIRED_TABLES = [
  "addresses",
  "orders",
  "panel_dishes",
  "panel_entries",
  "panel_rows",
] as const

/** Contadores que la respuesta promete. */
const REQUIRED_COUNTERS = [
  "claimed",
  "ordersClaimed",
  "dishesClaimed",
  "entriesClaimed",
  "rowsClaimed",
] as const

/** Tablas reclamadas por `guest_token` directo (todas menos `orders`). */
const TOKEN_SCOPED_TABLES = ["addresses", "panel_dishes", "panel_entries", "panel_rows"] as const

function claimedTables(source: string): string[] {
  return [...source.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1] ?? "")
}

/** El bloque de código que sigue a `.from("<table>")`, para leer sus filtros. */
function blockFor(source: string, table: string): string {
  const at = source.indexOf(`.from("${table}")`)
  return at < 0 ? "" : source.slice(at, at + 500)
}

/** Líneas de código, sin comentarios de línea. */
function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n")
}

describe("contrato del reclamo de datos anónimos", () => {
  it("el endpoint reclama las cinco tablas del trabajo anónimo", () => {
    // Canario: si el endpoint se reescribe y deja de usar `.from(...)`, las
    // aserciones de abajo pasarían en vacío.
    const tables = claimedTables(ROUTE)
    expect(tables.length, "no se encontró ningún `.from(\"...\")` en el endpoint").toBeGreaterThanOrEqual(5)

    const missing = REQUIRED_TABLES.filter((t) => !tables.includes(t))

    expect(
      missing,
      `El reclamo dejó de cubrir estas tablas: ${missing.join(", ")}. El endpoint tiene que ` +
        `vincular TODO el trabajo hecho sin cuenta —direcciones, pedidos, platillos, entradas ` +
        `y filas del panel—. Media reclamación es indistinguible de ninguna para el usuario que ` +
        `abre "Mis pedidos" y no encuentra lo que hizo.`
    ).toEqual([])
  })

  it("la respuesta declara los cinco contadores", () => {
    const response = ROUTE.slice(ROUTE.indexOf("NextResponse.json({ claimed"))

    const missing = REQUIRED_COUNTERS.filter((c) => !response.includes(c))

    expect(
      missing,
      `La respuesta dejó de reportar: ${missing.join(", ")}. Los contadores son la única señal ` +
        `de que el reclamo hizo algo; sin ellos no se puede distinguir "no había nada" de ` +
        `"no se reclamó".`
    ).toEqual([])
  })

  it("el endpoint exige sesión antes de reclamar", () => {
    expect(ROUTE, "el endpoint dejó de leer el usuario de la sesión").toContain("auth.getUser()")
    expect(ROUTE, "el endpoint dejó de cortar sin sesión").toMatch(/status:\s*401/)
  })

  it("cada reclamo filtra por el token del navegador y por `user_id NULL`", () => {
    const unscoped = TOKEN_SCOPED_TABLES.filter((table) => {
      const block = blockFor(ROUTE, table)
      return !block.includes('.eq("guest_token", token)') || !block.includes('.is("user_id", null)')
    })

    expect(
      unscoped,
      `Estas tablas se reclaman sin acotar por \`guest_token\` + \`user_id IS NULL\`: ` +
        `${unscoped.join(", ")}. El UPDATE corre con \`service_role\`, así que RLS no lo ` +
        `detiene: un filtro de menos vincula filas de otro visitante a la cuenta que reclama.`
    ).toEqual([])
  })

  it("los pedidos se reclaman a través de las direcciones recién vinculadas", () => {
    const block = blockFor(ROUTE, "orders")

    // `orders` no tiene `guest_token`: se acota por las direcciones que el
    // propio claim acaba de vincular. Filtrar por token aquí no compilaría, y
    // soltar el filtro reclamaría pedidos de terceros.
    expect(block, "el reclamo de pedidos dejó de derivarse de las direcciones reclamadas").toContain(
      '.in("address_id", claimedAddressIds)'
    )
    expect(block, "el reclamo de pedidos dejó de exigir que estuvieran huérfanos").toContain(
      '.is("user_id", null)'
    )
  })

  it("la red global es un componente de cliente que reclama al haber sesión", () => {
    expect(CLAIMER, `${CLAIMER_PATH} dejó de ser un componente de cliente`).toMatch(
      /^["']use client["']/m
    )
    expect(CLAIMER, "la red global dejó de llamar a `claimGuestAddresses()`").toContain(
      "claimGuestAddresses()"
    )
    expect(CLAIMER, "la red global dejó de comprobar que haya algo que reclamar").toContain(
      "getGuestToken()"
    )
  })

  it("la red global está montada en el layout raíz", () => {
    expect(LAYOUT, "el layout dejó de importar la red global").toMatch(
      /import\s*\{\s*GuestClaim\s*\}\s*from\s*["']@\/components\/auth\/guest-claim["']/
    )
    expect(LAYOUT, "el layout dejó de renderizar `<GuestClaim />`").toMatch(/<GuestClaim\s*\/>/)
  })

  it("el layout sigue sin leer cookies ni headers", () => {
    const code = codeOnly(LAYOUT)

    expect(
      code,
      `El layout raíz empezó a leer \`cookies()\` o \`headers()\`. Eso convierte TODAS las rutas ` +
        `en SSR por request (208% del límite de Fluid CPU en Vercel, ver el comentario del ` +
        `propio archivo). El reclamo tiene que resolverse en el cliente, que es donde vive el ` +
        `\`guest_token\`.`
    ).not.toMatch(/\bcookies\(\)|\bheaders\(\)/)

    expect(code, "el layout raíz importó `next/headers`").not.toContain("next/headers")
  })

  it("las vías directas conservan su reclamo explícito", () => {
    const calls = [...AUTH_FORM.matchAll(/await claimGuestAddresses\(\)/g)].length

    // Contraseña, alta con sesión inmediata y passkey. Se quedan a propósito:
    // dan el reclamo antes de navegar, así que el destino pinta datos
    // correctos en el primer render en vez de esperar a que monte la red.
    expect(
      calls,
      `\`auth-form.tsx\` pasó de 3 reclamos explícitos a ${calls}. Las vías que no recargan la ` +
        `página —contraseña, alta con sesión inmediata, passkey— necesitan reclamar antes de ` +
        `navegar; la red global solo cubre las que vuelven por \`/auth/callback\`.`
    ).toBeGreaterThanOrEqual(3)
  })

  it("la librería sigue exponiendo el token y el reclamo", () => {
    expect(LIB, "`claimGuestAddresses` dejó de exportarse").toMatch(
      /export\s+async\s+function\s+claimGuestAddresses/
    )
    expect(LIB, "`getGuestToken` dejó de exportarse").toMatch(/export\s+function\s+getGuestToken/)
  })
})
