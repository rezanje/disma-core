# Local vs Production Supabase

This app now supports separate Supabase profiles so local development can use a different database from production.

## Profiles

- `local`: used by default when running `npm run dev`
- `production`: used when `NODE_ENV=production` or when `NEXT_PUBLIC_SUPABASE_PROFILE=production`

## Env variables

For local development, set these in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_PROFILE=local`
- `NEXT_PUBLIC_SUPABASE_URL_LOCAL=...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY_LOCAL=...`
- `SUPABASE_SERVICE_ROLE_KEY_LOCAL=...`

For production, set these in Vercel env vars:

- `NEXT_PUBLIC_SUPABASE_PROFILE=production`
- `NEXT_PUBLIC_SUPABASE_URL_PRODUCTION=...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY_PRODUCTION=...`
- `SUPABASE_SERVICE_ROLE_KEY_PRODUCTION=...`

## Fallback behavior

If the profile-specific variables are not present, the app still falls back to the legacy single-set variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Safe migration path

1. Create a new Supabase project for local development.
2. Put the new project credentials into `.env.local`.
3. Leave Vercel production env vars pointing to the live Supabase project.
4. Develop locally without affecting production data.
