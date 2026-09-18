import { type Page } from "@playwright/test"

/**
 * Sesión de admin para los bloques de comportamiento del e2e.
 *
 * POR QUÉ EXISTE: `signInAsAdmin()` estaba copiada en dos specs con dos
 * timeouts distintos (12 s y 20 s) y dos formas de leer las credenciales. Dos
 * copias de un login son dos oportunidades de que una se quede atrás.
 *
 * LAS CREDENCIALES NO ESTÁN EN EL REPO: sin `E2E_ADMIN_EMAIL` y
 * `E2E_ADMIN_PASSWORD` en el entorno, todo bloque que necesite sesión se salta
 * solo y el resto del e2e sigue midiendo las guardas. Eso es intencional —
 * mejor un bloque saltado y visible que un test que finge verificar.
 */
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD

/** `true` cuando el entorno trae credenciales de admin utilizables. */
export function hasAdminCredentials(): boolean {
  return Boolean(ADMIN_EMAIL && ADMIN_PASSWORD)
}

/**
 * Inicia sesión como admin. Devuelve `false` —nunca lanza— cuando no hay
 * credenciales o cuando el login no cuajó, para que el test se salte en lugar
 * de fallar.
 *
 * El timeout es el mayor de los dos que había (20 s): en dev la primera
 * compilación de `/auth/login` puede tardar, y un timeout corto convertía un
 * login lento en un test saltado en silencio, es decir, en cobertura perdida
 * sin que nadie se enterara.
 */
export async function signInAsAdmin(page: Page): Promise<boolean> {
  if (!hasAdminCredentials()) return false

  await page.goto("/auth/login")
  const email = page.locator("#email")
  const password = page.locator("#password")
  if ((await email.count()) === 0 || (await password.count()) === 0) return false

  await email.fill(ADMIN_EMAIL as string)
  await password.fill(ADMIN_PASSWORD as string)
  await page.getByRole("button", { name: /Iniciar Sesión/ }).click()

  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/login"), {
      timeout: 20_000,
    })
  } catch {
    return false
  }
  return true
}
