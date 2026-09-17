import { test, expect } from "@playwright/test"

/**
 * E2E de autenticación: formulario de registro/login y guards de /admin.
 *
 * Estas pruebas NO crean cuentas reales ni necesitan credenciales: verifican
 * la UI y los guards (lo que sí puede probarse sin backend de correo). El
 * flujo completo de registro con confirmación se cubre con
 * scripts/verify-auth-setup.mjs contra el proyecto de Supabase.
 *
 * ⚠️ Hueco de producto conocido (backlog P0): la recuperación de contraseña
 * NO es alcanzable desde la UI. `resetPasswordForEmail` no se invoca en ningún
 * componente — solo se menciona en un comentario de /auth/reset/page.tsx — y
 * tampoco existe "enlace mágico" (`signInWithOtp`). La página /auth/reset
 * existe y funciona, pero nada enlaza a ella. Los tests que asertaban esos
 * botones se eliminaron: asertaban una UI inexistente y por eso nunca corrían
 * (0 etiquetas @ci). Cuando se implemente el flujo, añadir aquí el test del
 * disparador.
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
