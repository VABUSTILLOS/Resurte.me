import { defineConfig, devices } from "@playwright/test"

// Puerto configurable para no chocar con otros dev servers locales
// (p.ej. cuando el 3000 ya está ocupado por otro proyecto).
const PORT = process.env.E2E_PORT ?? "3000"
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: "./e2e",
  // Compila las rutas antes del primer test: la compilación en frío de Next en
  // dev es la causa número uno de flakes (ver e2e/global-setup.ts).
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
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
    command: `npx next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
