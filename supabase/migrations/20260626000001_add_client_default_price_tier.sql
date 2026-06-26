-- Migration: Add default_price_tier to clients table
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS default_price_tier text DEFAULT 'Standard'::text;
