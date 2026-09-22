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

/**
 * Clave de servicio (`service_role`). Bypassa RLS: **solo servidor**.
 *
 * Pasa por el mismo filtro de placeholders que la URL y la anon key a
 * propósito. `[SENSITIVE]` es lo que escribe `vercel env pull` en lugar del
 * valor real, y como es una cadena con contenido, un guarda de "¿existe?" la da
 * por buena: el cliente se construye con una llave falsa y la falla aparece
 * después como un 401 opaco —o como un problema de RLS— en vez de como "falta
 * configurar el entorno".
 */
export function supabaseServiceKey(): string | null {
  const raw = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
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
