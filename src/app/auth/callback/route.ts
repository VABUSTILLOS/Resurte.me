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
      console.error("Auth callback error:", error.message)
      return NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(error.message)}`)
    }
    // Successful sign-in — redirect to intended destination
    const forwardedHost = request.headers.get("x-forwarded-host")
    const targetOrigin = forwardedHost ? `https://${forwardedHost}` : origin
    return NextResponse.redirect(`${targetOrigin}${next}`)
  }

  // No code — redirect to login
  return NextResponse.redirect(`${origin}/auth/login?error=auth_callback_error`)
}
