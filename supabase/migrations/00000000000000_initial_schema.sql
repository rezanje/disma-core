


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."delete_tukar_faktur"("p_tf_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_status text;
  v_client_id text;
  v_term_days int;
begin
  select status, client_id into v_status, v_client_id
    from public.tukar_faktur where id = p_tf_id for update;
  if v_status is null then
    raise exception 'tukar_faktur % not found', p_tf_id;
  end if;
  if v_status not in ('Draft', 'Issued') then
    raise exception 'TF status % tidak bisa dihapus (hanya Draft/Issued).', v_status;
  end if;

  select payment_term_days into v_term_days from public.clients where id = v_client_id;
  if v_term_days is null then v_term_days := 30; end if;

  update public.invoices
     set tukar_faktur_id = null,
         due_date = (issue_date::date + (v_term_days || ' days')::interval)::date::text
   where tukar_faktur_id = p_tf_id;

  delete from public.tukar_faktur where id = p_tf_id;
  return jsonb_build_object('ok', true);
end;
$$;


ALTER FUNCTION "public"."delete_tukar_faktur"("p_tf_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_vendor_bill_number"("p_vendor_id" "text", "p_bill_date" "date") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_year text;
  v_month text;
  v_vendor_code text;
  v_count int;
begin
  -- Format date parts
  v_year := to_char(p_bill_date, 'YYYY');
  v_month := to_char(p_bill_date, 'MM');
  
  -- Suffix/Shortcode vendor ID (slice first 6 chars, uppercase)
  v_vendor_code := upper(substring(p_vendor_id from 1 for 6));
  
  -- Acquire an atomic lock on the vendor row to prevent duplicate generation
  perform 1 from public.vendors where id = p_vendor_id for update;

  -- Count existing bills for this vendor in the same month using issue_date
  select count(*)
    into v_count
    from public.vendor_bills
   where vendor_id = p_vendor_id
     and substring(issue_date from 1 for 7) = v_year || '-' || v_month;

  return 'VB-' || v_year || '-' || v_month || '-' || v_vendor_code || '-' || lpad((v_count + 1)::text, 2, '0');
end;
$$;


ALTER FUNCTION "public"."generate_vendor_bill_number"("p_vendor_id" "text", "p_bill_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_tukar_faktur"("p_tf_id" "uuid", "p_invoice_ids" "text"[], "p_issue_date" "date", "p_user_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_client_id text;
  v_term_days int;
  v_total numeric := 0;
  v_inv record;
begin
  select client_id into v_client_id from public.tukar_faktur where id = p_tf_id for update;
  if v_client_id is null then
    raise exception 'tukar_faktur % not found', p_tf_id;
  end if;

  select payment_term_days into v_term_days from public.clients where id = v_client_id;
  if v_term_days is null then v_term_days := 30; end if;

  for v_inv in
    select id, total_amount, tukar_faktur_id, client_id
    from public.invoices
    where id = any(p_invoice_ids)
    for update
  loop
    if v_inv.tukar_faktur_id is not null and v_inv.tukar_faktur_id <> p_tf_id then
      raise exception 'Invoice % sudah di TF lain (%).', v_inv.id, v_inv.tukar_faktur_id;
    end if;
    if v_inv.client_id <> v_client_id then
      raise exception 'Invoice % bukan milik klien TF ini.', v_inv.id;
    end if;
    v_total := v_total + coalesce(v_inv.total_amount, 0);
  end loop;

  update public.invoices
     set tukar_faktur_id = p_tf_id,
         due_date = (p_issue_date + (v_term_days || ' days')::interval)::date::text
   where id = any(p_invoice_ids);

  update public.tukar_faktur
     set status = 'Issued',
         issue_date = p_issue_date,
         issued_by = p_user_id,
         total_amount = v_total
   where id = p_tf_id;

  return jsonb_build_object('ok', true, 'tf_id', p_tf_id, 'total', v_total, 'invoice_count', array_length(p_invoice_ids, 1));
end;
$$;


ALTER FUNCTION "public"."issue_tukar_faktur"("p_tf_id" "uuid", "p_invoice_ids" "text"[], "p_issue_date" "date", "p_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_invoices_to_tukar_faktur"("p_tf_id" "uuid", "p_invoice_ids" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_client_id text;
  v_status text;
  v_total numeric := 0;
  v_inv record;
begin
  select client_id, status into v_client_id, v_status
    from public.tukar_faktur where id = p_tf_id for update;
  if v_client_id is null then
    raise exception 'tukar_faktur % not found', p_tf_id;
  end if;
  if v_status <> 'Draft' then
    raise exception 'TF % bukan Draft (status=%). Pakai issue_tukar_faktur.', p_tf_id, v_status;
  end if;

  for v_inv in
    select id, total_amount, tukar_faktur_id, client_id
    from public.invoices
    where id = any(p_invoice_ids)
    for update
  loop
    if v_inv.tukar_faktur_id is not null and v_inv.tukar_faktur_id <> p_tf_id then
      raise exception 'Invoice % sudah di TF lain (%).', v_inv.id, v_inv.tukar_faktur_id;
    end if;
    if v_inv.client_id <> v_client_id then
      raise exception 'Invoice % bukan milik klien TF ini.', v_inv.id;
    end if;
    v_total := v_total + coalesce(v_inv.total_amount, 0);
  end loop;

  update public.invoices
     set tukar_faktur_id = p_tf_id
   where id = any(p_invoice_ids);

  update public.tukar_faktur
     set total_amount = v_total
   where id = p_tf_id;

  return jsonb_build_object('ok', true, 'tf_id', p_tf_id, 'total', v_total, 'invoice_count', array_length(p_invoice_ids, 1));
end;
$$;


ALTER FUNCTION "public"."link_invoices_to_tukar_faktur"("p_tf_id" "uuid", "p_invoice_ids" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_cash_transaction"("p_transaction" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_id text;
  v_date text;
  v_type text;
  v_amount numeric;
  v_bank_account_id text;
  v_category text;
  v_description text;
  v_reference_type text;
  v_reference_id text;
  v_counterpart_name text;
  v_receipt_url text;
  v_delta numeric;
  v_tx jsonb;
  v_bank jsonb;
  v_tx_row public.cash_transactions%rowtype;
  v_bank_row public.bank_accounts%rowtype;
begin
  if coalesce(jsonb_typeof(p_transaction), 'null') <> 'object' then
    raise exception 'cash transaction must be a JSON object';
  end if;

  v_id := nullif(trim(coalesce(p_transaction->>'id', '')), '');
  v_date := nullif(trim(coalesce(p_transaction->>'date', '')), '');
  v_type := nullif(trim(coalesce(p_transaction->>'type', '')), '');
  v_bank_account_id := nullif(trim(coalesce(p_transaction->>'bankAccountId', p_transaction->>'bank_account_id', '')), '');
  v_category := nullif(trim(coalesce(p_transaction->>'category', '')), '');
  v_description := nullif(trim(coalesce(p_transaction->>'description', '')), '');
  v_reference_type := nullif(trim(coalesce(p_transaction->>'referenceType', p_transaction->>'reference_type', '')), '');
  v_reference_id := nullif(trim(coalesce(p_transaction->>'referenceId', p_transaction->>'reference_id', '')), '');
  v_counterpart_name := nullif(trim(coalesce(p_transaction->>'counterpartName', p_transaction->>'counterpart_name', '')), '');
  v_receipt_url := nullif(trim(coalesce(p_transaction->>'receiptUrl', p_transaction->>'receipt_url', '')), '');
  v_amount := coalesce(nullif(p_transaction->>'amount', '')::numeric, 0);

  if v_id is null then raise exception 'cash transaction id is required'; end if;
  if v_date is null then raise exception 'cash transaction date is required'; end if;
  if v_type not in ('In', 'Out') then raise exception 'cash transaction type must be In or Out'; end if;
  if v_amount <= 0 then raise exception 'cash transaction amount must be positive'; end if;
  if v_bank_account_id is null then raise exception 'bank account id is required'; end if;
  if v_category is null then raise exception 'cash transaction category is required'; end if;
  if v_description is null then raise exception 'cash transaction description is required'; end if;

  select to_jsonb(ct) into v_tx
  from public.cash_transactions ct
  where ct.id = v_id;

  if v_tx is not null then
    select to_jsonb(ba) into v_bank
    from public.bank_accounts ba
    where ba.id = v_bank_account_id;

    return jsonb_build_object('transaction', v_tx, 'bank_account', v_bank, 'inserted', false);
  end if;

  select to_jsonb(ba) into v_bank
  from public.bank_accounts ba
  where ba.id = v_bank_account_id
  for update;

  if v_bank is null then
    raise exception 'bank account not found: %', v_bank_account_id;
  end if;

  v_delta := case when v_type = 'In' then v_amount else -v_amount end;

  insert into public.cash_transactions (
    id, date, type, amount, bank_account_id, category, description,
    reference_type, reference_id, counterpart_name, receipt_url
  ) values (
    v_id, v_date, v_type, v_amount, v_bank_account_id, v_category, v_description,
    v_reference_type, v_reference_id, v_counterpart_name, v_receipt_url
  )
  returning * into v_tx_row;

  v_tx := to_jsonb(v_tx_row);

  update public.bank_accounts
  set balance = balance + v_delta
  where id = v_bank_account_id
  returning * into v_bank_row;

  v_bank := to_jsonb(v_bank_row);

  return jsonb_build_object('transaction', v_tx, 'bank_account', v_bank, 'inserted', true);
end;
$$;


ALTER FUNCTION "public"."post_cash_transaction"("p_transaction" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_journal_entry"("p_entry_id" "text", "p_transaction_date" "text", "p_description" "text", "p_reference_type" "text", "p_reference_id" "text", "p_debits" "jsonb", "p_credits" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_debit_lines jsonb := '[]'::jsonb;
  v_credit_lines jsonb := '[]'::jsonb;
  v_all_lines jsonb := '[]'::jsonb;
  v_line jsonb;
  v_amount numeric;
  v_account_code text;
  v_account_id text;
  v_coa_count integer;
  v_idx integer := 0;
  v_existing_id text;
  v_existing_line_count integer;
  v_existing_entry jsonb;
  v_existing_lines jsonb;
begin
  if nullif(trim(coalesce(p_entry_id, '')), '') is null then
    raise exception 'journal entry id is required';
  end if;

  if nullif(trim(coalesce(p_transaction_date, '')), '') is null then
    raise exception 'transaction date is required';
  end if;

  if nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception 'description is required';
  end if;

  if coalesce(jsonb_typeof(p_debits), 'null') <> 'array' then
    raise exception 'debits must be a JSON array';
  end if;

  if coalesce(jsonb_typeof(p_credits), 'null') <> 'array' then
    raise exception 'credits must be a JSON array';
  end if;

  select id
    into v_existing_id
    from public.journal_entries
   where reference_type is not distinct from p_reference_type
     and reference_id is not distinct from p_reference_id
     and description = p_description
   limit 1;

  if v_existing_id is not null then
    select count(*)
      into v_existing_line_count
      from public.journal_lines
     where journal_entry_id = v_existing_id;

    if v_existing_line_count = 0 then
      raise exception 'existing journal entry % has no lines; repair required', v_existing_id;
    end if;

    select to_jsonb(je)
      into v_existing_entry
      from public.journal_entries je
     where je.id = v_existing_id;

    select coalesce(jsonb_agg(to_jsonb(jl) order by jl.id), '[]'::jsonb)
      into v_existing_lines
      from public.journal_lines jl
     where jl.journal_entry_id = v_existing_id;

    return jsonb_build_object(
      'entry', v_existing_entry,
      'lines', v_existing_lines,
      'inserted', false
    );
  end if;

  for v_line in select value from jsonb_array_elements(p_debits) loop
    v_idx := v_idx + 1;
    v_account_code := nullif(trim(coalesce(v_line->>'accountCode', v_line->>'account_code', '')), '');
    if v_account_code is null then
      raise exception 'debit account code is required';
    end if;

    v_amount := coalesce(nullif(v_line->>'amount', '')::numeric, 0);
    if v_amount < 0 then
      raise exception 'debit amount for account % cannot be negative', v_account_code;
    end if;
    if v_amount = 0 then
      continue;
    end if;

    select count(*), min(id)
      into v_coa_count, v_account_id
      from public.coas
     where account_code = v_account_code;

    if v_coa_count = 0 then
      raise exception 'COA not found for debit account code: %', v_account_code;
    end if;
    if v_coa_count > 1 then
      raise exception 'COA account code % is duplicated; repair required', v_account_code;
    end if;

    v_total_debit := v_total_debit + v_amount;
    v_debit_lines := v_debit_lines || jsonb_build_array(jsonb_build_object(
      'id', coalesce(nullif(v_line->>'id', ''), p_entry_id || '-d-' || v_idx::text),
      'journal_entry_id', p_entry_id,
      'account_id', v_account_id,
      'debit_amount', v_amount,
      'credit_amount', 0,
      'vendor_id', v_line->>'vendorId',
      'vendor_bill_id', v_line->>'vendorBillId'
    ));
  end loop;

  v_idx := 0;
  for v_line in select value from jsonb_array_elements(p_credits) loop
    v_idx := v_idx + 1;
    v_account_code := nullif(trim(coalesce(v_line->>'accountCode', v_line->>'account_code', '')), '');
    if v_account_code is null then
      raise exception 'credit account code is required';
    end if;

    v_amount := coalesce(nullif(v_line->>'amount', '')::numeric, 0);
    if v_amount < 0 then
      raise exception 'credit amount for account % cannot be negative', v_account_code;
    end if;
    if v_amount = 0 then
      continue;
    end if;

    select count(*), min(id)
      into v_coa_count, v_account_id
      from public.coas
     where account_code = v_account_code;

    if v_coa_count = 0 then
      raise exception 'COA not found for credit account code: %', v_account_code;
    end if;
    if v_coa_count > 1 then
      raise exception 'COA account code % is duplicated; repair required', v_account_code;
    end if;

    v_total_credit := v_total_credit + v_amount;
    v_credit_lines := v_credit_lines || jsonb_build_array(jsonb_build_object(
      'id', coalesce(nullif(v_line->>'id', ''), p_entry_id || '-c-' || v_idx::text),
      'journal_entry_id', p_entry_id,
      'account_id', v_account_id,
      'debit_amount', 0,
      'credit_amount', v_amount,
      'vendor_id', v_line->>'vendorId',
      'vendor_bill_id', v_line->>'vendorBillId'
    ));
  end loop;

  if v_total_debit <= 0 or v_total_credit <= 0 then
    raise exception 'journal must have positive debit and credit totals';
  end if;

  if abs(v_total_debit - v_total_credit) > 0.01 then
    raise exception 'journal is not balanced: debit %, credit %', v_total_debit, v_total_credit;
  end if;

  v_all_lines := v_debit_lines || v_credit_lines;

  insert into public.journal_entries (
    id,
    transaction_date,
    description,
    reference_type,
    reference_id
  ) values (
    p_entry_id,
    p_transaction_date,
    p_description,
    p_reference_type,
    p_reference_id
  );

  for v_line in select value from jsonb_array_elements(v_all_lines) loop
    insert into public.journal_lines (
      id,
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      vendor_id,
      vendor_bill_id
    ) values (
      v_line->>'id',
      v_line->>'journal_entry_id',
      v_line->>'account_id',
      (v_line->>'debit_amount')::numeric,
      (v_line->>'credit_amount')::numeric,
      v_line->>'vendor_id',
      v_line->>'vendor_bill_id'
    );
  end loop;

  return jsonb_build_object(
    'entry', jsonb_build_object(
      'id', p_entry_id,
      'transaction_date', p_transaction_date,
      'description', p_description,
      'reference_type', p_reference_type,
      'reference_id', p_reference_id
    ),
    'lines', (
      select coalesce(jsonb_agg(to_jsonb(jl) order by jl.id), '[]'::jsonb)
        from public.journal_lines jl
       where jl.journal_entry_id = p_entry_id
    ),
    'inserted', true
  );
end;
$$;


ALTER FUNCTION "public"."post_journal_entry"("p_entry_id" "text", "p_transaction_date" "text", "p_description" "text", "p_reference_type" "text", "p_reference_id" "text", "p_debits" "jsonb", "p_credits" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tf_check_auto_paid"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_unpaid_count int;
begin
  if NEW.tukar_faktur_id is null then return NEW; end if;
  if NEW.status <> 'Paid' then return NEW; end if;

  select count(*) into v_unpaid_count
    from public.invoices
   where tukar_faktur_id = NEW.tukar_faktur_id
     and status <> 'Paid';

  if v_unpaid_count = 0 then
    update public.tukar_faktur set status = 'Paid' where id = NEW.tukar_faktur_id and status <> 'Paid';
  end if;
  return NEW;
end;
$$;


ALTER FUNCTION "public"."tf_check_auto_paid"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" "text" NOT NULL,
    "nav_configs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "role_permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bank_accounts" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "account_number" "text",
    "account_code" "text",
    "balance" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."bank_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cash_transactions" (
    "id" "text" NOT NULL,
    "date" "text" NOT NULL,
    "type" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "bank_account_id" "text" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "reference_type" "text",
    "reference_id" "text",
    "counterpart_name" "text",
    "receipt_url" "text"
);


ALTER TABLE "public"."cash_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_prices" (
    "id" "text" NOT NULL,
    "client_id" "text" NOT NULL,
    "product_id" "text" NOT NULL,
    "agreed_price" numeric DEFAULT 0 NOT NULL,
    "tier" "text" NOT NULL,
    "last_updated" "text" NOT NULL,
    "updated_by_user_id" "text"
);


ALTER TABLE "public"."client_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "text" NOT NULL,
    "company_name" "text" NOT NULL,
    "pic_name" "text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "payment_term_days" integer DEFAULT 30 NOT NULL,
    "created_at" "text" NOT NULL,
    "total_order_jan_may" numeric DEFAULT 0 NOT NULL,
    "parent_id" "text",
    "is_brand" boolean DEFAULT false
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coas" (
    "id" "text" NOT NULL,
    "account_code" "text" NOT NULL,
    "account_name" "text" NOT NULL,
    "account_type" "text" NOT NULL
);


ALTER TABLE "public"."coas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deliveries" (
    "id" "text" NOT NULL,
    "sales_order_id" "text" NOT NULL,
    "courier_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "delivery_date" "text",
    "ba_url" "text",
    "invoice_id" "text",
    "notes" "text"
);


ALTER TABLE "public"."deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."disma_tasks" (
    "id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" NOT NULL,
    "priority" "text" NOT NULL,
    "assigned_to_id" "text" NOT NULL,
    "created_by_original_id" "text" NOT NULL,
    "due_date" "text" NOT NULL,
    "created_at" "text" NOT NULL,
    "progress" numeric,
    "comments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "attachments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "category" "text",
    "assigned_to_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


ALTER TABLE "public"."disma_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "text" NOT NULL,
    "user_id" "text",
    "full_name" "text" NOT NULL,
    "position" "text" NOT NULL,
    "department" "text" NOT NULL,
    "base_salary" numeric DEFAULT 0 NOT NULL,
    "kasbon" numeric DEFAULT 0 NOT NULL,
    "join_date" "text" NOT NULL,
    "status" "text" NOT NULL
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "text" NOT NULL,
    "date" "text" NOT NULL,
    "reporter_id" "text" NOT NULL,
    "category" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "admin_fee" numeric,
    "shipping_fee" numeric,
    "description" "text" NOT NULL,
    "receipt_url" "text",
    "status" "text" NOT NULL,
    "reference_id" "text",
    "is_journaled" boolean DEFAULT false NOT NULL,
    "notes" "text",
    "audit_date" "text",
    "audit_note" "text",
    "target_bank_account_id" "text",
    "purchase_id" "text"
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fixed_assets" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "purchase_date" "text" NOT NULL,
    "purchase_price" numeric DEFAULT 0 NOT NULL,
    "economic_life_months" integer DEFAULT 0 NOT NULL,
    "salvage_value" numeric DEFAULT 0 NOT NULL,
    "current_value" numeric DEFAULT 0 NOT NULL,
    "accumulated_depreciation" numeric DEFAULT 0 NOT NULL,
    "status" "text" NOT NULL
);


ALTER TABLE "public"."fixed_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "text" NOT NULL,
    "sales_order_id" "text",
    "sales_order_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "is_consolidated" boolean DEFAULT false NOT NULL,
    "consolidated_order_numbers" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "client_id" "text" NOT NULL,
    "issue_date" "text" NOT NULL,
    "due_date" "text" NOT NULL,
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "amount_paid" numeric DEFAULT 0 NOT NULL,
    "status" "text" NOT NULL,
    "payments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "paid_date" "text",
    "superseded_by_invoice_id" "text",
    "tukar_faktur_id" "uuid"
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_entries" (
    "id" "text" NOT NULL,
    "transaction_date" "text" NOT NULL,
    "description" "text" NOT NULL,
    "reference_type" "text",
    "reference_id" "text"
);


ALTER TABLE "public"."journal_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."journal_lines" (
    "id" "text" NOT NULL,
    "journal_entry_id" "text" NOT NULL,
    "account_id" "text" NOT NULL,
    "debit_amount" numeric DEFAULT 0 NOT NULL,
    "credit_amount" numeric DEFAULT 0 NOT NULL,
    "vendor_id" "text",
    "vendor_bill_id" "text"
);


ALTER TABLE "public"."journal_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpis" (
    "id" "text" NOT NULL,
    "assignee_user_id" "text" NOT NULL,
    "assigned_by_user_id" "text" NOT NULL,
    "specific" "text" NOT NULL,
    "measurable" "text" NOT NULL,
    "achievable" "text" NOT NULL,
    "relevant" "text" NOT NULL,
    "time_bound" "text" NOT NULL,
    "period" "text" NOT NULL,
    "weight" numeric DEFAULT 0 NOT NULL,
    "target_value" numeric DEFAULT 0 NOT NULL,
    "actual_value" numeric DEFAULT 0 NOT NULL,
    "unit" "text" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "status" "text" NOT NULL,
    "evaluator_note" "text",
    "evaluated_at" "text",
    "evaluated_by" "text",
    "manual_grade" "text",
    "created_at" "text" NOT NULL,
    "updated_at" "text"
);


ALTER TABLE "public"."kpis" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "text" NOT NULL,
    "company_name" "text" NOT NULL,
    "contact_name" "text" NOT NULL,
    "value" numeric DEFAULT 0 NOT NULL,
    "status" "text" NOT NULL,
    "notes" "text",
    "created_at" "text" NOT NULL
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" NOT NULL,
    "link" "text",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" "text" NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."okr_key_results" (
    "id" "text" NOT NULL,
    "objective_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "target_value" numeric DEFAULT 0 NOT NULL,
    "current_value" numeric DEFAULT 0 NOT NULL,
    "unit" "text" NOT NULL,
    "linked_kpi_id" "text",
    "linked_task_id" "text"
);


ALTER TABLE "public"."okr_key_results" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."okr_objectives" (
    "id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "period" "text" NOT NULL,
    "owner_id" "text" NOT NULL,
    "progress" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."okr_objectives" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_returns" (
    "id" "text" NOT NULL,
    "product_id" "text" NOT NULL,
    "original_so_id" "text" NOT NULL,
    "qty" numeric DEFAULT 0 NOT NULL,
    "reason" "text" NOT NULL,
    "date" "text" NOT NULL,
    "status" "text" NOT NULL
);


ALTER TABLE "public"."pending_returns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "text" NOT NULL,
    "sku_code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "uom" "text" NOT NULL,
    "base_price" numeric DEFAULT 0 NOT NULL,
    "selling_price" numeric DEFAULT 0 NOT NULL,
    "tier1_price" numeric DEFAULT 0 NOT NULL,
    "tier2_price" numeric DEFAULT 0 NOT NULL,
    "tier3_price" numeric DEFAULT 0 NOT NULL,
    "tier4_price" numeric DEFAULT 0 NOT NULL,
    "tier5_price" numeric DEFAULT 0 NOT NULL,
    "current_stock" numeric DEFAULT 0 NOT NULL,
    "price_history" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "weekly_price_range" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "category" "text"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchase_items" (
    "id" "text" NOT NULL,
    "purchase_id" "text" NOT NULL,
    "product_id" "text" NOT NULL,
    "sales_order_id" "text",
    "qty_target" numeric DEFAULT 0 NOT NULL,
    "qty_purchased" numeric DEFAULT 0 NOT NULL,
    "estimated_unit_price" numeric DEFAULT 0 NOT NULL,
    "actual_unit_price" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "receipt_url" "text",
    "is_checked" boolean DEFAULT false NOT NULL,
    "is_qced" boolean DEFAULT false NOT NULL,
    "purchase_method" "text",
    "online_ref" "text",
    "online_order_date" "text",
    "is_online_ordered" boolean DEFAULT false NOT NULL,
    "is_online_audited" boolean DEFAULT false NOT NULL,
    "vendor_id" "text",
    "payment_method" "text"
);


ALTER TABLE "public"."purchase_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."purchases" (
    "id" "text" NOT NULL,
    "date" "text" NOT NULL,
    "purchaser_id" "text" NOT NULL,
    "status" "text" NOT NULL,
    "budget_amount" numeric,
    "budget_transfer_date" "text",
    "budget_transfered_by" "text",
    "budget_bank_account_id" "text",
    "operational_spare_amount" numeric,
    "actual_spent" numeric,
    "change_returned" numeric,
    "reconciliation_note" "text",
    "reconciliation_status" "text",
    "reconciliation_proof_url" "text",
    "advance_code" "text",
    "shopping_list_document_id" "text",
    "shopping_list_compiled_by" "text"
);


ALTER TABLE "public"."purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reimbursements" (
    "id" "text" NOT NULL,
    "date" "text" NOT NULL,
    "user_id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "amount" numeric DEFAULT 0 NOT NULL,
    "description" "text" NOT NULL,
    "receipt_url" "text",
    "status" "text" NOT NULL,
    "audit_date" "text",
    "audit_note" "text",
    "payment_date" "text",
    "payment_reference" "text",
    "purchase_id" "text",
    "kind" "text",
    CONSTRAINT "reimbursements_kind_check" CHECK (("kind" = ANY (ARRAY['Manual'::"text", 'Auto-Talangan'::"text", 'Sourcing-Defisit'::"text"])))
);


ALTER TABLE "public"."reimbursements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rejected_items" (
    "id" "text" NOT NULL,
    "date" "text" NOT NULL,
    "product_id" "text" NOT NULL,
    "qty" numeric DEFAULT 0 NOT NULL,
    "reason" "text" NOT NULL,
    "source" "text" NOT NULL,
    "reference_id" "text",
    "reported_by" "text" NOT NULL,
    "image_url" "text"
);


ALTER TABLE "public"."rejected_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_order_items" (
    "id" "text" NOT NULL,
    "sales_order_id" "text" NOT NULL,
    "product_id" "text" NOT NULL,
    "qty" numeric DEFAULT 0 NOT NULL,
    "qty_final" numeric,
    "unit_price" numeric DEFAULT 0 NOT NULL,
    "subtotal" numeric DEFAULT 0 NOT NULL,
    "subtotal_final" numeric,
    "qty_adjustment_reason" "text",
    "is_packed" boolean DEFAULT false NOT NULL,
    "is_handover_checked" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."sales_order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_orders" (
    "id" "text" NOT NULL,
    "po_number" "text" NOT NULL,
    "client_id" "text" NOT NULL,
    "order_date" "text" NOT NULL,
    "target_delivery_date" "text" NOT NULL,
    "status" "text" NOT NULL,
    "archived_surat_jalan_url" "text",
    "archived_ba_url" "text",
    "proof_of_delivery_url" "text",
    "handover_date" "text",
    "handover_by" "text",
    "received_by" "text",
    "courier_signature" "text",
    "client_signature" "text",
    "shopping_list_document_id" "text",
    "shopping_list_compiled_at" "text",
    "shopping_list_compiled_by" "text"
);


ALTER TABLE "public"."sales_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" "text" NOT NULL,
    "date" "text" NOT NULL,
    "product_id" "text" NOT NULL,
    "product_name" "text",
    "sku_code" "text",
    "quantity" numeric DEFAULT 0 NOT NULL,
    "stock_delta" numeric DEFAULT 0 NOT NULL,
    "resulting_stock" numeric DEFAULT 0 NOT NULL,
    "direction" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "source" "text" NOT NULL,
    "destination" "text",
    "reference_type" "text",
    "reference_id" "text",
    "purchase_item_id" "text",
    "sales_order_id" "text",
    "note" "text",
    "created_by_user_id" "text"
);


ALTER TABLE "public"."stock_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tukar_faktur" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tf_number" "text" NOT NULL,
    "client_id" "text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "issue_date" "date" NOT NULL,
    "status" "text" DEFAULT 'Draft'::"text" NOT NULL,
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "notes" "text",
    "issued_by" "text",
    "received_at" timestamp with time zone,
    "received_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tukar_faktur_status_check" CHECK (("status" = ANY (ARRAY['Draft'::"text", 'Issued'::"text", 'Received'::"text", 'Paid'::"text"])))
);


ALTER TABLE "public"."tukar_faktur" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "role" "text" NOT NULL,
    "pin" "text" NOT NULL
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendor_bills" (
    "id" "text" NOT NULL,
    "bill_number" "text" NOT NULL,
    "vendor_id" "text" NOT NULL,
    "vendor_name" "text" NOT NULL,
    "issue_date" "text" NOT NULL,
    "due_date" "text" NOT NULL,
    "description" "text" NOT NULL,
    "category" "text",
    "total_amount" numeric DEFAULT 0 NOT NULL,
    "amount_paid" numeric DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'Pending'::"text" NOT NULL,
    "payments" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "receipt_url" "text",
    "purchase_id" "text",
    "created_at" "text" NOT NULL,
    "created_by" "text"
);


ALTER TABLE "public"."vendor_bills" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendors" (
    "id" "text" NOT NULL,
    "company_name" "text" NOT NULL,
    "pic_name" "text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" "text" NOT NULL,
    "payment_term_days" integer DEFAULT 14,
    "is_tempo" boolean DEFAULT true
);


ALTER TABLE "public"."vendors" OWNER TO "postgres";


ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bank_accounts"
    ADD CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cash_transactions"
    ADD CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_prices"
    ADD CONSTRAINT "client_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coas"
    ADD CONSTRAINT "coas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."deliveries"
    ADD CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."disma_tasks"
    ADD CONSTRAINT "disma_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fixed_assets"
    ADD CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_entries"
    ADD CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."journal_lines"
    ADD CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpis"
    ADD CONSTRAINT "kpis_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."okr_key_results"
    ADD CONSTRAINT "okr_key_results_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."okr_objectives"
    ADD CONSTRAINT "okr_objectives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_returns"
    ADD CONSTRAINT "pending_returns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchase_items"
    ADD CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."purchases"
    ADD CONSTRAINT "purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reimbursements"
    ADD CONSTRAINT "reimbursements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rejected_items"
    ADD CONSTRAINT "rejected_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_order_items"
    ADD CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sales_orders"
    ADD CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movements"
    ADD CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tukar_faktur"
    ADD CONSTRAINT "tukar_faktur_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tukar_faktur"
    ADD CONSTRAINT "tukar_faktur_tf_number_key" UNIQUE ("tf_number");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_bills"
    ADD CONSTRAINT "vendor_bills_bill_number_key" UNIQUE ("bill_number");



ALTER TABLE ONLY "public"."vendor_bills"
    ADD CONSTRAINT "vendor_bills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");



CREATE INDEX "invoices_tukar_faktur_id_idx" ON "public"."invoices" USING "btree" ("tukar_faktur_id");



CREATE INDEX "journal_lines_vendor_bill_id_idx" ON "public"."journal_lines" USING "btree" ("vendor_bill_id") WHERE ("vendor_bill_id" IS NOT NULL);



CREATE INDEX "journal_lines_vendor_id_idx" ON "public"."journal_lines" USING "btree" ("vendor_id") WHERE ("vendor_id" IS NOT NULL);



CREATE INDEX "purchase_items_vendor_id_idx" ON "public"."purchase_items" USING "btree" ("vendor_id");



CREATE INDEX "reimbursements_kind_idx" ON "public"."reimbursements" USING "btree" ("kind");



CREATE INDEX "tukar_faktur_client_period_idx" ON "public"."tukar_faktur" USING "btree" ("client_id", "period_start");



CREATE INDEX "tukar_faktur_status_idx" ON "public"."tukar_faktur" USING "btree" ("status");



CREATE INDEX "vendor_bills_due_date_idx" ON "public"."vendor_bills" USING "btree" ("due_date") WHERE ("status" <> 'Paid'::"text");



CREATE INDEX "vendor_bills_status_idx" ON "public"."vendor_bills" USING "btree" ("status");



CREATE INDEX "vendor_bills_vendor_id_idx" ON "public"."vendor_bills" USING "btree" ("vendor_id");



CREATE OR REPLACE TRIGGER "invoices_tf_auto_paid" AFTER UPDATE OF "status" ON "public"."invoices" FOR EACH ROW WHEN ((("new"."tukar_faktur_id" IS NOT NULL) AND ("new"."status" = 'Paid'::"text"))) EXECUTE FUNCTION "public"."tf_check_auto_paid"();



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_tukar_faktur_id_fkey" FOREIGN KEY ("tukar_faktur_id") REFERENCES "public"."tukar_faktur"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."journal_lines"
    ADD CONSTRAINT "journal_lines_vendor_bill_id_fkey" FOREIGN KEY ("vendor_bill_id") REFERENCES "public"."vendor_bills"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."journal_lines"
    ADD CONSTRAINT "journal_lines_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."purchase_items"
    ADD CONSTRAINT "purchase_items_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE ONLY "public"."tukar_faktur"
    ADD CONSTRAINT "tukar_faktur_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."vendor_bills"
    ADD CONSTRAINT "vendor_bills_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id");



ALTER TABLE ONLY "public"."vendor_bills"
    ADD CONSTRAINT "vendor_bills_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id");



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rejected_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_movements" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_tukar_faktur"("p_tf_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_tukar_faktur"("p_tf_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_tukar_faktur"("p_tf_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_vendor_bill_number"("p_vendor_id" "text", "p_bill_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_vendor_bill_number"("p_vendor_id" "text", "p_bill_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_vendor_bill_number"("p_vendor_id" "text", "p_bill_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."issue_tukar_faktur"("p_tf_id" "uuid", "p_invoice_ids" "text"[], "p_issue_date" "date", "p_user_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."issue_tukar_faktur"("p_tf_id" "uuid", "p_invoice_ids" "text"[], "p_issue_date" "date", "p_user_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_tukar_faktur"("p_tf_id" "uuid", "p_invoice_ids" "text"[], "p_issue_date" "date", "p_user_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."link_invoices_to_tukar_faktur"("p_tf_id" "uuid", "p_invoice_ids" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."link_invoices_to_tukar_faktur"("p_tf_id" "uuid", "p_invoice_ids" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_invoices_to_tukar_faktur"("p_tf_id" "uuid", "p_invoice_ids" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."post_cash_transaction"("p_transaction" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."post_cash_transaction"("p_transaction" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_cash_transaction"("p_transaction" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."post_journal_entry"("p_entry_id" "text", "p_transaction_date" "text", "p_description" "text", "p_reference_type" "text", "p_reference_id" "text", "p_debits" "jsonb", "p_credits" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."post_journal_entry"("p_entry_id" "text", "p_transaction_date" "text", "p_description" "text", "p_reference_type" "text", "p_reference_id" "text", "p_debits" "jsonb", "p_credits" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_journal_entry"("p_entry_id" "text", "p_transaction_date" "text", "p_description" "text", "p_reference_type" "text", "p_reference_id" "text", "p_debits" "jsonb", "p_credits" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."tf_check_auto_paid"() TO "anon";
GRANT ALL ON FUNCTION "public"."tf_check_auto_paid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tf_check_auto_paid"() TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."bank_accounts" TO "anon";
GRANT ALL ON TABLE "public"."bank_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."bank_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."cash_transactions" TO "anon";
GRANT ALL ON TABLE "public"."cash_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."client_prices" TO "anon";
GRANT ALL ON TABLE "public"."client_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."client_prices" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."coas" TO "anon";
GRANT ALL ON TABLE "public"."coas" TO "authenticated";
GRANT ALL ON TABLE "public"."coas" TO "service_role";



GRANT ALL ON TABLE "public"."deliveries" TO "anon";
GRANT ALL ON TABLE "public"."deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."disma_tasks" TO "anon";
GRANT ALL ON TABLE "public"."disma_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."disma_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."fixed_assets" TO "anon";
GRANT ALL ON TABLE "public"."fixed_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."fixed_assets" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON TABLE "public"."journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_entries" TO "service_role";



GRANT ALL ON TABLE "public"."journal_lines" TO "anon";
GRANT ALL ON TABLE "public"."journal_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."journal_lines" TO "service_role";



GRANT ALL ON TABLE "public"."kpis" TO "anon";
GRANT ALL ON TABLE "public"."kpis" TO "authenticated";
GRANT ALL ON TABLE "public"."kpis" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."okr_key_results" TO "anon";
GRANT ALL ON TABLE "public"."okr_key_results" TO "authenticated";
GRANT ALL ON TABLE "public"."okr_key_results" TO "service_role";



GRANT ALL ON TABLE "public"."okr_objectives" TO "anon";
GRANT ALL ON TABLE "public"."okr_objectives" TO "authenticated";
GRANT ALL ON TABLE "public"."okr_objectives" TO "service_role";



GRANT ALL ON TABLE "public"."pending_returns" TO "anon";
GRANT ALL ON TABLE "public"."pending_returns" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_returns" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."purchase_items" TO "anon";
GRANT ALL ON TABLE "public"."purchase_items" TO "authenticated";
GRANT ALL ON TABLE "public"."purchase_items" TO "service_role";



GRANT ALL ON TABLE "public"."purchases" TO "anon";
GRANT ALL ON TABLE "public"."purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."purchases" TO "service_role";



GRANT ALL ON TABLE "public"."reimbursements" TO "anon";
GRANT ALL ON TABLE "public"."reimbursements" TO "authenticated";
GRANT ALL ON TABLE "public"."reimbursements" TO "service_role";



GRANT ALL ON TABLE "public"."rejected_items" TO "anon";
GRANT ALL ON TABLE "public"."rejected_items" TO "authenticated";
GRANT ALL ON TABLE "public"."rejected_items" TO "service_role";



GRANT ALL ON TABLE "public"."sales_order_items" TO "anon";
GRANT ALL ON TABLE "public"."sales_order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_order_items" TO "service_role";



GRANT ALL ON TABLE "public"."sales_orders" TO "anon";
GRANT ALL ON TABLE "public"."sales_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_orders" TO "service_role";



GRANT ALL ON TABLE "public"."stock_movements" TO "anon";
GRANT ALL ON TABLE "public"."stock_movements" TO "authenticated";
GRANT ALL ON TABLE "public"."stock_movements" TO "service_role";



GRANT ALL ON TABLE "public"."tukar_faktur" TO "anon";
GRANT ALL ON TABLE "public"."tukar_faktur" TO "authenticated";
GRANT ALL ON TABLE "public"."tukar_faktur" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_bills" TO "anon";
GRANT ALL ON TABLE "public"."vendor_bills" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_bills" TO "service_role";



GRANT ALL ON TABLE "public"."vendors" TO "anon";
GRANT ALL ON TABLE "public"."vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."vendors" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







