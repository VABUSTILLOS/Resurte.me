import { test, expect } from "@playwright/test"

/**
 * E2E de autenticación: formulario de registro/login y guards de /admin.
 *
 * Estas pruebas NO crean cuentas reales ni necesitan credenciales: verifican
 * la UI y los guards (lo que sí puede probarse sin backend de correo). El
 * flujo completo de registro con confirmación se cubre con
 * scripts/verify-auth-setup.mjs contra el proyecto de Supabase.
 *
 * ⚠️ Hueco cerrado (antes backlog P0): la recuperación de contraseña YA es
 * alcanzable desde el login. El disparador "¿Olvidaste tu contraseña?" llama a
 * `resetPasswordForEmail` y el enlace vuelve por /auth/callback con
 * `next=/auth/reset`, donde el usuario elige la contraseña nueva.
 *
 * El envío real no se prueba aquí (necesitaría backend de correo): lo que se
 * prueba es el disparador y el aviso de correo vacío, que es determinista y no
 * toca la red. Antes había tests que asertaban esos botones y se eliminaron
 * por asertar una UI inexistente; este test cubre la UI que sí existe.
 */
test.describe("autenticación", { tag: "@ci" }, () => {
  test("la página de registro muestra el formulario completo", async ({ page }) => {
    await page.goto("/auth/register")

    await expect(page.getByRole("heading", { name: /crear cuenta/i })).toBeVisible()
    await expect(page.getByLabel(/nombre completo/i)).toBeVisible()
    await expect(page.getByLabel(/correo electrónico/i)).toBeVisible()
    // exact: el toggle de visibilidad usa aria-label "Mostrar contraseña" y
    // también matchearía /contraseña/i (strict mode violation).
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: /crear cuenta/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /continuar con google/i })).toBeVisible()
  })

  test("el login ofrece las vías de acceso reales", async ({ page }) => {
    await page.goto("/auth/login")

    await expect(page.getByRole("heading", { name: /iniciar sesión/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /iniciar sesión/i })).toBeVisible()
    await expect(page.getByRole("button", { name: /continuar con google/i })).toBeVisible()
    await expect(page.getByLabel("Contraseña", { exact: true })).toBeVisible()

    // El toggle de visibilidad anuncia su estado (a11y) en vez de ser solo un icono.
    const toggle = page.getByRole("button", { name: "Mostrar contraseña" })
    await expect(toggle).toHaveAttribute("aria-pressed", "false")
    await toggle.click()
    await expect(page.getByRole("button", { name: "Ocultar contraseña" })).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  test("el login ofrece la recuperación de contraseña y avisa si falta el correo", async ({
    page,
  }) => {
    await page.goto("/auth/login")

    const trigger = page.getByRole("button", { name: /olvidaste tu contraseña/i })
    await expect(trigger).toBeVisible()

    // Sin correo no se pide nada: el aviso lo dice en vez de mandar una
    // petición que Supabase aceptaría sin producir un efecto visible.
    await trigger.click()
    // `filter` es necesario: Next inyecta `__next-route-announcer__` con
    // role="alert" y el locator por rol a secas resuelve a 2 elementos.
    await expect(
      page.getByRole("alert").filter({ hasText: /escribe tu correo/i })
    ).toBeVisible()

    // El disparador es type="button": no envía el formulario de login.
    await expect(page).toHaveURL(/\/auth\/login/)

    // En registro no aplica: ahí no hay contraseña que recuperar.
    await page.goto("/auth/register")
    await expect(
      page.getByRole("button", { name: /olvidaste tu contraseña/i })
    ).toHaveCount(0)
  })

  test("/auth/reset sin sesión muestra aviso en lugar del formulario", async ({ page }) => {
    await page.goto("/auth/reset")
    // Con Supabase configurado: "enlace no válido o expirado".
    // Sin secrets (dev local y CI): "autenticación no disponible".
    await expect(
      page.getByText(/enlace no válido o expirado|autenticación no disponible/i)
    ).toBeVisible()
    await expect(page.getByRole("button", { name: /guardar contraseña/i })).not.toBeVisible()
  })

  test("/admin sin sesión redirige al login con next=/admin", async ({ page }) => {
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/auth\/login\?next=/)
  })

  test("/admin/usuarios sin sesión también queda tras el guard", async ({ page }) => {
    await page.goto("/admin/usuarios")
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
