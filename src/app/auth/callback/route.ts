import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { safeNextPath } from "@/lib/safe-next"
import { clearNextCookie, readNextPath } from "@/lib/auth-next"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  // OAuth y el enlace mágico vuelven sin `next` en la query (Supabase solo
  // respeta la `redirectTo` registrada), así que el destino viaja en cookie.
  const fromQuery = searchParams.get("next")
  const next = safeNextPath(
    fromQuery && fromQuery.length > 0
      ? fromQuery
      : readNextPath(request.headers.get("cookie"))
  )

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      // Log técnico para debugging interno; el usuario solo ve un mensaje amigable.
      logger.error("Auth callback error:", error.message)
      const friendlyMessage = mapAuthError(error)
      const failure = NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(friendlyMessage)}`)
      failure.headers.append("Set-Cookie", clearNextCookie())
      return failure
    }
    // Successful sign-in — redirect to intended destination
    const forwardedHost = request.headers.get("x-forwarded-host")
    const targetOrigin = forwardedHost ? `https://${forwardedHost}` : origin
    const response = NextResponse.redirect(`${targetOrigin}${next}`)
    response.headers.append("Set-Cookie", clearNextCookie())
    return response
  }

  // No code — redirect to login
  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_error`)
}

function mapAuthError(error: { message: string; status?: number }): string {
  const message = error.message.toLowerCase()
  if (message.includes("expired") || message.includes("token")) {
    return "El enlace de acceso expiró. Intenta iniciar sesión de nuevo."
  }
  if (message.includes("invalid") || message.includes("code")) {
    return "El enlace de acceso no es válido. Solicita uno nuevo."
  }
  if (message.includes("email") && message.includes("not confirmed")) {
    return "Aún no confirmas tu correo. Revisa tu bandeja de entrada."
  }
  return "No pudimos completar el acceso. Intenta de nuevo."
}
