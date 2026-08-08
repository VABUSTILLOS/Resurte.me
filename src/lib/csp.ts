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
 */

const SUPABASE_HOST = "isogthougrpctnfzcdes.supabase.co"

export function buildCspHeader(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development"
  return `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://connect.facebook.net;
    style-src 'self' 'nonce-${nonce}';
    style-src-attr 'unsafe-inline';
    img-src 'self' blob: data: https://${SUPABASE_HOST} https://storage.googleapis.com https://www.facebook.com;
    font-src 'self' data:;
    connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://www.google-analytics.com https://www.googletagmanager.com https://www.facebook.com https://graph.facebook.com https://connect.facebook.net;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';${isDev ? "" : "\n    upgrade-insecure-requests;"}
  `
    .replace(/\s{2,}/g, " ")
    .trim()
}
