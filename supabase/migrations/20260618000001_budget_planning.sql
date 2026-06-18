-- supabase/migrations/20260618000001_budget_planning.sql
-- Migration for Budget Planning Feature

-- Create budget_plans table
CREATE TABLE IF NOT EXISTS public.budget_plans (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Draft', 'Active', 'Closed')),
    total_planned NUMERIC DEFAULT 0,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create budget_categories table (Pos Utama)
CREATE TABLE IF NOT EXISTS public.budget_categories (
    id TEXT PRIMARY KEY,
    plan_id TEXT REFERENCES public.budget_plans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT,
    planned_amount NUMERIC DEFAULT 0,
    order_index INTEGER DEFAULT 0,
    color TEXT
);

-- Create budget_sub_categories table (Sub-pos)
CREATE TABLE IF NOT EXISTS public.budget_sub_categories (
    id TEXT PRIMARY KEY,
    category_id TEXT REFERENCES public.budget_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    planned_amount NUMERIC DEFAULT 0,
    mapped_tx_categories TEXT[],
    order_index INTEGER DEFAULT 0
);

-- Create budget_adjustments table (Log)
CREATE TABLE IF NOT EXISTS public.budget_adjustments (
    id TEXT PRIMARY KEY,
    plan_id TEXT REFERENCES public.budget_plans(id) ON DELETE CASCADE,
    date TIMESTAMPTZ DEFAULT NOW(),
    type TEXT NOT NULL CHECK (type IN ('Reallocation', 'Adjustment')),
    from_category_id TEXT REFERENCES public.budget_categories(id) ON DELETE SET NULL,
    to_category_id TEXT REFERENCES public.budget_categories(id) ON DELETE SET NULL,
    sub_category_id TEXT REFERENCES public.budget_sub_categories(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL,
    reason TEXT NOT NULL,
    created_by TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS budget_plans_month_idx ON public.budget_plans(month);
CREATE INDEX IF NOT EXISTS budget_categories_plan_id_idx ON public.budget_categories(plan_id);
CREATE INDEX IF NOT EXISTS budget_sub_categories_category_id_idx ON public.budget_sub_categories(category_id);
CREATE INDEX IF NOT EXISTS budget_adjustments_plan_id_idx ON public.budget_adjustments(plan_id);

-- Enable RLS on all 4 tables
ALTER TABLE public.budget_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_sub_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_adjustments ENABLE ROW LEVEL SECURITY;
