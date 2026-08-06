/**
 * Utilidades para detectar si Supabase está configurado en el entorno.
 *
 * El repo puede ejecutarse sin secrets reales (dev local, preview) — valores
 * saneados o faltantes hacen que createClient lance un error críptico
 * ("Invalid supabaseUrl"). Estas funciones permiten degradar con gracia.
 */

const PLACEHOLDERS = new Set([
  "[SENSITIVE]",
  "your-project-url",
  "your-supabase-url",
  "your-anon-key",
  "dummy-anon-key",
])

function isUsable(value: string | undefined): value is string {
  const v = value?.trim() ?? ""
  return v.length > 0 && !PLACEHOLDERS.has(v)
}

export function supabaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!isUsable(raw)) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return raw
  } catch {
    return null
  }
}

export function supabaseAnonKey(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  return isUsable(raw) ? raw : null
}

export function isSupabaseConfigured(): boolean {
  return supabaseUrl() !== null && supabaseAnonKey() !== null
}

export function supabaseConfigError(): string {
  return [
    "Supabase no está configurado en este entorno.",
    "Define NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "(por ejemplo con `vercel env pull` o en tu .env.local) y reinicia el servidor.",
  ].join(" ")
}
