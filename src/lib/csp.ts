/**
 * Content Security Policy — nonce-based.
 *
 * El proxy genera un nonce por request y lo inyecta aquí junto con el header
 * CSP (ver `src/proxy.ts`). Next.js extrae el nonce de `x-nonce` y lo aplica
 * automáticamente a sus scripts, estilos y componentes `<Script>`.
 *
 * Directivas clave:
 * - `script-src 'strict-dynamic'`: los scripts con nonce pueden cargar más
 *   scripts dinámicamente (GA4/Meta Pixel); se ignoran los hosts permitidos
 *   en navegadores modernos pero se mantienen como fallback CSP2.
 * - `style-src-attr 'unsafe-inline'`: permite atributos `style` inline de React
 *   sin abrir `<style>`/CSS externo (que requieren nonce/'self').
 * - `frame-ancestors 'none'` + `object-src 'none'`: anti-clickjacking y sin
 *   plugins; el proyecto ya envía `X-Frame-Options: DENY`.
 *
 * Modo endurecido (único desde F22): `script-src` solo permite `'self'` +
 * nonce + `'strict-dynamic'` + Stripe. En navegadores modernos `strict-dynamic`
 * ya permite los scripts cargados dinámicamente por un script con nonce
 * (GA4/Meta Pixel), así que la política endurecida no cambia el comportamiento
 * real; los hosts de terceros solo serían un fallback para navegadores sin
 * soporte. El proxy envía esta política como `Content-Security-Policy` y, en
 * modo observación, también una copia como `Content-Security-Policy-Report-Only`
 * (ver `src/proxy.ts`).
 */

const SUPABASE_HOST = "isogthougrpctnfzcdes.supabase.co"

type CspOptions = {
  /** DEPRECADO (F22): la policy endurecida es ahora la única. Se mantiene la
   *  opción como no-op de compatibilidad; GA4/Meta cargan vía strict-dynamic. */
  hardened?: boolean
  /** Policy report-only: omite upgrade-insecure-requests (el navegador lo ignora
   *  en report-only y emite un aviso benigno en consola). */
  reportOnly?: boolean
}

export function buildCspHeader(nonce: string, options: CspOptions = {}): string {
  const isDev = process.env.NODE_ENV === "development"
  // Desde F22 la policy endurecida es la única: con strict-dynamic, GA4/Meta
  // Pixel cargan vía scripts con nonce en navegadores modernos, así que los
  // hosts de terceros en script-src son un fallback CSP2 innecesario. Se
  // mantiene Stripe (dependencia funcional del checkout embebido).
  const thirdPartyScripts = " https://js.stripe.com"
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}${thirdPartyScripts};
    style-src 'self' 'nonce-${nonce}';
    style-src-attr 'unsafe-inline';
    img-src 'self' blob: data: https://${SUPABASE_HOST} https://storage.googleapis.com https://www.facebook.com https://js.stripe.com https://q.stripe.com;
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
