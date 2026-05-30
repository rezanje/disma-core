-- Add assigned_to_ids column if it does not exist
ALTER TABLE "public"."disma_tasks" ADD COLUMN IF NOT EXISTS "assigned_to_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;

-- Populate assigned_to_ids with the single assignee as a jsonb array for existing records
UPDATE "public"."disma_tasks"
SET "assigned_to_ids" = jsonb_build_array("assigned_to_id")
WHERE ("assigned_to_ids" IS NULL OR "assigned_to_ids" = '[]'::jsonb) 
  AND "assigned_to_id" IS NOT NULL 
  AND "assigned_to_id" <> '';
