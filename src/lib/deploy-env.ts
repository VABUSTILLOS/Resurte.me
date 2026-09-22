/**
 * ¿Este proceso es el despliegue de producción?
 *
 * Fuente única: `VERCEL_ENV`, que Vercel inyecta por sí solo en cada entorno
 * (`production`, `preview`, `development`). Cualquier otro contexto —tu máquina,
 * un preview, el sandbox de staging— **no la tiene**, y por eso el valor por
 * defecto es `false`: quien consuma esto falla hacia el lado seguro (no indexar,
 * no aceptar llaves de dinero real).
 *
 * Solo producción se identifica **positivamente**. La alternativa —asumir
 * producción y marcar el resto— invertiría el riesgo: un entorno al que se le
 * olvide la marca quedaría indexable y cobrando de verdad.
 *
 * ⚠️ Nunca dejes `VERCEL_ENV` en tu `.env.local`: un `vercel env pull` lo
 * escribe, y desde entonces tu entorno local se cree producción.
 */
export function isProductionDeploy(): boolean {
  return process.env.VERCEL_ENV === "production"
}

/**
 * ¿Se permite una llave de Stripe en modo live aquí?
 *
 * `ALLOW_LIVE_STRIPE=1` es la válvula explícita para probar contra la cuenta
 * real **desde tu máquina**. No se pone en Vercel ni en un sandbox: su razón de
 * ser es distinguir "el desarrollador lo pidió a propósito" de "el preview de
 * staging heredó una llave live y va a cobrarle a un cliente de prueba".
 */
export function allowsLiveStripeKey(): boolean {
  if (isProductionDeploy()) return true
  const optIn = (process.env.ALLOW_LIVE_STRIPE ?? "").trim().toLowerCase()
  return optIn === "1" || optIn === "true"
}
