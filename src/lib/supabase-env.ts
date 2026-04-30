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

function pickEnvValue(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]
    if (value) return value
  }
  return ""
}

export function resolveSupabaseEnv(): SupabaseEnvConfig {
  const profile = normalizeProfile(
    process.env.NEXT_PUBLIC_SUPABASE_PROFILE || process.env.NODE_ENV
  )

  const suffix = profile === "local" ? "_LOCAL" : "_PRODUCTION"

  const url = pickEnvValue([
    `NEXT_PUBLIC_SUPABASE_URL${suffix}`,
    "NEXT_PUBLIC_SUPABASE_URL",
  ])

  const anonKey = pickEnvValue([
    `NEXT_PUBLIC_SUPABASE_ANON_KEY${suffix}`,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ])

  const serviceRoleKey = pickEnvValue([
    `SUPABASE_SERVICE_ROLE_KEY${suffix}`,
    "SUPABASE_SERVICE_ROLE_KEY",
  ])

  return { profile, url, anonKey, serviceRoleKey }
}
