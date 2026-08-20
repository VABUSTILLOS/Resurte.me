/**
 * Content Security Policy — estática (sin nonce por request).
 *
 * Hasta F22 el proxy generaba un nonce por request (ver historial de
 * `src/proxy.ts`). Eso obligaba a TODAS las páginas públicas a leer
 * `headers()` → SSR por request → consumo crítico de Fluid Active CPU en
 * Vercel (208% del límite del plan). La política ahora es estática: el
 * proxy la fija una vez por respuesta y las páginas de catálogo vuelven a
 * ser ISR/estáticas servidas por el CDN.
 *
 * Trade-off de seguridad documentado: `script-src` vuelve al modelo CSP2
 * clásico (`'self'` + `'unsafe-inline'` + allowlist de hosts de terceros)
 * en lugar de `strict-dynamic` + nonce. Sigue bloqueando la inyección de
 * scripts desde orígenes desconocidos (vector principal de XSS) y se
 * mantienen `object-src 'none'`, `frame-ancestors 'none'` y la allowlist
 * estricta de `connect-src`. Los reportes siguen llegando a
 * `/api/csp-report` para monitoreo.
 *
 * Directivas clave:
 * - `style-src 'unsafe-inline'`: Next.js y los estilos inline de React lo
 *   requieren sin nonce.
 * - `frame-ancestors 'none'` + `object-src 'none'`: anti-clickjacking y sin
 *   plugins; el proyecto ya envía `X-Frame-Options: DENY`.
 */

const SUPABASE_HOST = "isogthougrpctnfzcdes.supabase.co"

type StaticCspOptions = {
  /** Policy report-only: omite upgrade-insecure-requests (el navegador lo
   *  ignora en report-only y emite un aviso benigno en consola). */
  reportOnly?: boolean
}

export function buildStaticCspHeader(options: StaticCspOptions = {}): string {
  const isDev = process.env.NODE_ENV === "development"
  return `
    default-src 'self';
    script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://js.stripe.com;
    style-src 'self' 'unsafe-inline';
    style-src-attr 'unsafe-inline';
    img-src 'self' blob: data: https://${SUPABASE_HOST} https://storage.googleapis.com https://www.facebook.com https://www.google-analytics.com https://www.googletagmanager.com https://js.stripe.com https://q.stripe.com;
    font-src 'self' data:;
    connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://www.google-analytics.com https://www.googletagmanager.com https://www.facebook.com https://graph.facebook.com https://connect.facebook.net https://api.stripe.com https://m.stripe.network https://js.stripe.com;
    frame-src https://js.stripe.com https://m.stripe.network https://hooks.stripe.com https://checkout.stripe.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';${!isDev && !options.reportOnly ? "\n    upgrade-insecure-requests;" : ""}
    report-uri /api/csp-report;
  `
    .replace(/\s{2,}/g, " ")
    .trim()
}
