import { test, expect } from "@playwright/test"

/**
 * E2E de autenticación: formulario de registro/login y área /admin.
 *
 * Estas pruebas NO crean cuentas reales ni necesitan credenciales: verifican
 * la UI y los guards (lo que sí puede probarse sin backend de correo). El
 * flujo completo de registro con confirmación se cubre con
 * scripts/verify-auth-setup.mjs contra el proyecto de Supabase.
 */

test.describe("autenticación", () => {
  test("la página de registro muestra el formulario completo", async ({
    page,
  }) => {
    await page.goto("/auth/register")

    await expect(
      page.getByRole("heading", { name: /crear cuenta/i })
    ).toBeVisible()
    await expect(page.getByLabel(/nombre completo/i)).toBeVisible()
    await expect(page.getByLabel(/correo electrónico/i)).toBeVisible()
    await expect(page.getByLabel(/contraseña/i)).toBeVisible()
    await expect(
      page.getByRole("button", { name: /crear cuenta/i })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /continuar con google/i })
    ).toBeVisible()
  })

  test("el login ofrece enlace mágico y recuperación de contraseña", async ({
    page,
  }) => {
    await page.goto("/auth/login")

    await expect(
      page.getByRole("heading", { name: /iniciar sesión/i })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /¿olvidaste tu contraseña\?/i })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /enlace mágico/i })
    ).toBeVisible()
  })

  test("recuperación de contraseña pide el correo si está vacío", async ({
    page,
  }) => {
    await page.goto("/auth/login")
    await page
      .getByRole("button", { name: /¿olvidaste tu contraseña\?/i })
      .click()

    await expect(page.getByText(/escribe tu correo/i)).toBeVisible()
  })

  test("/auth/reset sin sesión muestra aviso en lugar del formulario", async ({
    page,
  }) => {
    await page.goto("/auth/reset")
    // Con Supabase configurado: "enlace no válido o expirado".
    // Sin secrets (dev local): "autenticación no disponible".
    await expect(
      page.getByText(/enlace no válido o expirado|autenticación no disponible/i)
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: /guardar contraseña/i })
    ).not.toBeVisible()
  })

  test("/admin sin sesión redirige al login con next=/admin", async ({
    page,
  }) => {
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/auth\/login\?next=/)
  })

  test("/admin/usuarios sin sesión también queda tras el guard", async ({
    page,
  }) => {
    await page.goto("/admin/usuarios")
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
