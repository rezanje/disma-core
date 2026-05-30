-- Migration to add extra fields to the leads table
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS channel text,
ADD COLUMN IF NOT EXISTS jabatan text,
ADD COLUMN IF NOT EXISTS no_hp text,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS pic_disma text,
ADD COLUMN IF NOT EXISTS priority text,
ADD COLUMN IF NOT EXISTS last_contact text,
ADD COLUMN IF NOT EXISTS next_step_contact text;
