import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "https://resurte-msn0welrc-victor-bustillos-projects.vercel.app",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
})
