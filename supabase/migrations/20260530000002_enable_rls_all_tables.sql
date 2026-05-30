-- Enable Row Level Security (RLS) on all remaining tables for production security.
-- Next.js API routes bypass RLS by using the service_role key, so this is fully safe.

ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."bank_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cash_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."client_prices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."coas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."disma_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."fixed_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."journal_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."journal_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."kpis" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."okr_key_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."okr_objectives" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pending_returns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."purchase_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reimbursements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sales_order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sales_orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tukar_faktur" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vendor_bills" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."vendors" ENABLE ROW LEVEL SECURITY;
