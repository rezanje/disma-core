import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseEnv } from './supabase-env';

const { profile, url: supabaseUrl, anonKey: supabaseAnonKey, serviceRoleKey: supabaseServiceKey } = resolveSupabaseEnv();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(`⚠️ Supabase credentials not found for ${profile} profile. Set the matching NEXT_PUBLIC_SUPABASE_URL* and NEXT_PUBLIC_SUPABASE_ANON_KEY* env vars.`);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Service role client — only use server-side (API routes), never in client components
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Storage bucket name for file uploads (nota, receipt, etc.)
export const UPLOAD_BUCKET = 'uploads';
