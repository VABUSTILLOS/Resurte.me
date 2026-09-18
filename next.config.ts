import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // El servidor de Playwright usa su propio `distDir` (`NEXT_DIST_DIR`) para no
  // chocar con un `next dev` que el desarrollador ya tenga abierto: el lock del
  // servidor vive en `<distDir>/dev/lock`, así que compartir `.next` hacía
  // fallar el arranque del webServer y dejaba la única salida en reutilizar el
  // servidor ajeno (con su caché y sus credenciales, que pueden estar obsoletas).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  allowedDevOrigins: [
    "3000-07e71408-162f-4d55-afcf-13420ba7fef0.softgen.dev",
    "3000-07e71408-162f-4d55-afcf-13420ba7fef0.proxy.daytona.work",
    "*.softgen.dev",
    "*.proxy.daytona.work",
    "resurte.me",
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "resurte.me",
      },
      {
        protocol: "https",
        hostname: "isogthougrpctnfzcdes.supabase.co",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "abpollo.com",
      },
      {
        protocol: "https",
        hostname: "upload.wikimedia.org",
      },
      {
        protocol: "https",
        hostname: "images.openfoodfacts.org",
      },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Rutas del panel de admin consolidadas: se mantienen como redirects
  // permanentes para no romper enlaces guardados ni marcadores.
  redirects: async () => [
    { source: "/admin/visibilidad", destination: "/admin/productos", permanent: true },
    { source: "/admin/disponibilidad", destination: "/admin/productos", permanent: true },
    { source: "/admin/workflows", destination: "/admin/whatsapp/automations", permanent: true },
    { source: "/admin/auditoria", destination: "/admin/bitacoras?tab=auditoria", permanent: true },
    { source: "/admin/errores", destination: "/admin/bitacoras?tab=errores", permanent: true },
    { source: "/admin/emails", destination: "/admin/bitacoras?tab=emails", permanent: true },
    { source: "/admin/facturas", destination: "/admin/recompensas?tab=facturas", permanent: true },
  ],
  headers: async () => {
    if (process.env.NODE_ENV !== "production") return []
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), interest-cohort=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
      {
        source: "/images/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*.(webp|avif|png|jpg|jpeg|svg|ico)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ]
  },
}

export default nextConfig