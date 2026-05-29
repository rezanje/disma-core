-- supabase/migrations/20260527_tukar_faktur.sql
-- Tukar Faktur (weekly invoice exchange document per client)

create table if not exists public.tukar_faktur (
  id uuid primary key default gen_random_uuid(),
  tf_number text unique not null,
  client_id text not null references public.clients(id),
  period_start date not null,
  period_end date not null,
  issue_date date not null,
  status text not null default 'Draft' check (status in ('Draft','Issued','Received','Paid')),
  total_amount numeric not null default 0,
  notes text,
  issued_by text,
  received_at timestamptz,
  received_by text,
  created_at timestamptz not null default now()
);

create index if not exists tukar_faktur_client_period_idx on public.tukar_faktur(client_id, period_start);
create index if not exists tukar_faktur_status_idx on public.tukar_faktur(status);

alter table public.tukar_faktur disable row level security;

alter table public.invoices
  add column if not exists tukar_faktur_id uuid references public.tukar_faktur(id) on delete set null;
create index if not exists invoices_tukar_faktur_id_idx on public.invoices(tukar_faktur_id);

-- RPC: atomic issue. Re-validates each invoice still unlinked under FOR UPDATE,
-- then links them and recomputes due_date = issue_date + client.payment_term_days.
create or replace function public.issue_tukar_faktur(
  p_tf_id uuid,
  p_invoice_ids text[],
  p_issue_date date,
  p_user_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- RPC: atomic delete. Draft drops directly. Issued reverts invoice links + due_date.
create or replace function public.delete_tukar_faktur(p_tf_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- Trigger: when an invoice goes fully Paid, check if its TF is fully paid and auto-promote.
create or replace function public.tf_check_auto_paid() returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists invoices_tf_auto_paid on public.invoices;
create trigger invoices_tf_auto_paid
  after update of status on public.invoices
  for each row
  when (NEW.tukar_faktur_id is not null and NEW.status = 'Paid')
  execute function public.tf_check_auto_paid();
