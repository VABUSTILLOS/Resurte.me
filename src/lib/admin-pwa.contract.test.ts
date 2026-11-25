import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Contrato de la PWA del panel (Ola 7).
 *
 * El panel es una app instalable SEPARADA de la tienda: su
 * propio manifest con alcance /admin, su propio service worker
 * servido desde /admin/sw.js (alcance máximo /admin) y sus
 * propios iconos. Lo que este contrato congela:
 *
 * - El manifest del panel abre en /admin y su alcance es /admin
 *   (instalarlo no puede crear «la app de la tienda»).
 * - El SW del panel es network-first para navegar, jamás
 *   cachea /api y su caché es solo de estáticos con el prefijo
 *   propio `resurte-admin-` (no toca las cachés del SW público).
 * - La tienda pública queda intacta: su manifest sigue con
 *   alcance / y su SW sigue sin cachear /admin.
 * - El layout del panel monta el registrador y declara el
 *   appleWebApp de iOS.
 */

const REPO = process.cwd()
const read = (path: string) => readFileSync(join(REPO, path), "utf8")

describe("PWA del panel — manifest", () => {
  const source = read("src/app/admin/manifest.webmanifest/route.ts")

  it("abre en /admin y su alcance es /admin", () => {
    expect(source).toContain('start_url: "/admin"')
    expect(source).toContain('scope: "/admin"')
    expect(source).toContain('display: "standalone"')
  })

  it("declara los iconos estándar del panel", () => {
    expect(source).toContain("/admin-icon-192.png")
    expect(source).toContain("/admin-icon-512.png")
    expect(source).toContain("/admin-icon-maskable-512.png")
    expect(source).toContain('purpose: "maskable"')
  })

  it("los iconos existen en public/", () => {
    for (const file of [
      "public/admin-icon-192.png",
      "public/admin-icon-512.png",
      "public/admin-icon-maskable-512.png",
      "public/admin-apple-touch-icon.png",
    ]) {
      expect(existsSync(join(REPO, file)), file).toBe(true)
    }
  })
})

describe("PWA del panel — service worker", () => {
  const source = read("src/app/admin/sw.js/route.ts")

  it("es network-first para las navegaciones y nunca sirve el panel desde caché", () => {
    expect(source).toContain('request.mode === "navigate"')
    expect(source).toContain("OFFLINE_HTML")
    expect(source).toContain("resurte-admin-")
  })

  it("jamás intercepta /api", () => {
    expect(source).toContain('url.pathname.startsWith("/api/")')
  })

  it("no toca las cachés del SW público", () => {
    expect(source).not.toContain("resurte-pages")
    expect(source).not.toContain("resurte-static")
  })
})

describe("PWA del panel — cableado y tienda intacta", () => {
  it("el layout del panel monta el registrador y declara appleWebApp", () => {
    const layout = read("src/app/admin/layout.tsx")
    expect(layout).toContain("AdminPwa")
    expect(layout).toContain("appleWebApp")
    const pwa = read("src/app/admin/admin-pwa.tsx")
    expect(pwa).toContain('"/admin/sw.js"')
    expect(pwa).toContain('scope: "/admin"')
    expect(pwa).toContain("/admin/manifest.webmanifest")
    expect(pwa).toContain("/admin-apple-touch-icon.png")
  })

  it("el manifest público de la tienda sigue con alcance /", () => {
    const manifest = JSON.parse(read("public/manifest.json")) as {
      scope: string
      start_url: string
    }
    expect(manifest.scope).toBe("/")
    expect(manifest.start_url).toBe("/")
  })

  it("el SW público sigue excluyendo /admin de su caché", () => {
    const sw = read("public/sw.js")
    expect(sw).toContain('"/admin/"')
  })
})
