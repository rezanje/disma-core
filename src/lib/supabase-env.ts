export type SupabaseProfile = "local" | "production"

export type SupabaseEnvConfig = {
  profile: SupabaseProfile
  url: string
  anonKey: string
  serviceRoleKey: string
}

function normalizeProfile(value?: string): SupabaseProfile {
  if (value?.toLowerCase() === "production") return "production"
  return "local"
}

export function resolveSupabaseEnv(): SupabaseEnvConfig {
  const profile = normalizeProfile(
    process.env.NEXT_PUBLIC_SUPABASE_PROFILE || process.env.NODE_ENV
  )

  const isLocal = profile === "local"

  // Statically check env variables so the Next.js compiler/Turbopack 
  // can inline them correctly for client-side execution.
  const url = isLocal
    ? (process.env.NEXT_PUBLIC_SUPABASE_URL_LOCAL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    : (process.env.NEXT_PUBLIC_SUPABASE_URL_PRODUCTION || process.env.NEXT_PUBLIC_SUPABASE_URL || "")

  const anonKey = isLocal
    ? (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "")
    : (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_PRODUCTION || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "")

  const serviceRoleKey = isLocal
    ? (process.env.SUPABASE_SERVICE_ROLE_KEY_LOCAL || process.env.SUPABASE_SERVICE_ROLE_KEY || "")
    : (process.env.SUPABASE_SERVICE_ROLE_KEY_PRODUCTION || process.env.SUPABASE_SERVICE_ROLE_KEY || "")

  return { profile, url, anonKey, serviceRoleKey }
}
