"use client"

import { useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { claimGuestAddresses, getGuestToken } from "@/lib/guest-address"

/**
 * Reclama los datos anónimos del navegador —direcciones, pedidos, platillos del
 * panel y datos de las herramientas— en cuanto hay sesión.
 *
 * **Por qué existe.** `claimGuestAddresses()` solo se invocaba desde tres puntos
 * de `auth-form.tsx`: contraseña, alta con sesión inmediata y passkey. Las dos
 * vías que vuelven por `/auth/callback` —Google y el enlace de confirmación por
 * correo— aterrizaban con sesión pero sin reclamar nada: `/auth/callback` es una
 * ruta de servidor y el `guest_token` vive en `localStorage`, que el servidor no
 * puede leer. Quien se registraba con Google, o quien confirmaba su correo,
 * perdía en silencio su trabajo anónimo: sus platillos, sus filas de panel, sus
 * pedidos y sus direcciones se quedaban con `user_id NULL` para siempre.
 *
 * **Por qué en el layout raíz.** Para que cubra cualquier vía presente o futura
 * sin tener que acordarse de llamarlo en cada flujo nuevo. Las llamadas
 * explícitas de `auth-form.tsx` se quedan: dan el reclamo antes de navegar, así
 * que el destino pinta datos correctos en el primer render. En esos caminos el
 * token ya se limpió y este componente sale sin tocar la red.
 *
 * Best-effort, como el resto del reclamo: si falla, el token sigue en el
 * navegador y se reintenta en la siguiente carga.
 */
export function GuestClaim() {
  useEffect(() => {
    // Sin token no hay nada que reclamar. La mayoría de las visitas anónimas
    // —y todas las de un usuario ya reclamado— salen aquí sin crear cliente.
    if (!getGuestToken()) return

    const supabase = createClient()
    if (!supabase) return

    let cancelled = false
    let claimed = false

    /** Un solo reclamo por carga; el guard se pone antes del `await`. */
    async function claimOnce(): Promise<void> {
      if (cancelled || claimed) return
      claimed = true
      await claimGuestAddresses()
    }

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session) await claimOnce()
    })()

    // El retorno de OAuth y el enlace de confirmación son cargas de página
    // completas, así que la sesión ya está al montar y el `getSession()` de
    // arriba la encuentra. Esta suscripción cubre que la sesión aparezca
    // después del montaje (otra pestaña, o un login sin recarga).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void claimOnce()
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return null
}
