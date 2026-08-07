import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      // Log técnico para debugging interno; el usuario solo ve un mensaje amigable.
      console.error("Auth callback error:", error.message)
      const friendlyMessage = mapAuthError(error)
      return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(friendlyMessage)}`)
    }
    // Successful sign-in — redirect to intended destination
    const forwardedHost = request.headers.get("x-forwarded-host")
    const targetOrigin = forwardedHost ? `https://${forwardedHost}` : origin
    return NextResponse.redirect(`${targetOrigin}${next}`)
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
