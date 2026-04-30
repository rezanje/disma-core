import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseEnv } from './supabase-env';

const { profile, url: supabaseUrl, serviceRoleKey } = resolveSupabaseEnv();

if (!supabaseUrl || !serviceRoleKey) {
  console.warn(`⚠️ Supabase ADMIN credentials not found for ${profile} profile.`);
}

// THIS CLIENT BYPASSES RLS. ONLY USE IN API ROUTES!
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});
