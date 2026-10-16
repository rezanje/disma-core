-- Additive audit repairs. Historical documents remain untouched; NULL snapshots
-- mean legacy detail was not frozen and must not be invented by a backfill.
begin;

alter table public.purchases
  add column if not exists expected_remainder numeric,
  add column if not exists paper_session_id text,
  add column if not exists paper_occurred_at text,
  add column if not exists paper_performer_id text,
  add column if not exists paper_recorded_at text,
  add column if not exists occurred_at text;

alter table public.purchase_items
  add column if not exists inbound_status text,
  add column if not exists inbound_qty_received numeric,
  add column if not exists inbound_verified_at text,
  add column if not exists inbound_verified_by text,
  add column if not exists inbound_note text,
  add column if not exists qc_processed_qty numeric not null default 0,
  add column if not exists qc_event_ids jsonb not null default '[]'::jsonb,
  add column if not exists qc_occurred_at text,
  add column if not exists qc_recorded_at text,
  add column if not exists qc_recorded_by text,
  add column if not exists qc_paper_number text,
  add column if not exists qc_paper_proof text,
  add column if not exists report_event_id text,
  add column if not exists report_event_ids jsonb not null default '[]'::jsonb,
  add column if not exists report_complete boolean not null default false;

alter table public.deliveries
  add column if not exists line_snapshots jsonb,
  add column if not exists accepted_line_snapshots jsonb,
  add column if not exists occurred_at text,
  add column if not exists performed_by text,
  add column if not exists recorded_at text,
  add column if not exists recorded_by text,
  add column if not exists paper_number text,
  add column if not exists paper_proof text,
  add column if not exists recipient_name text,
  add column if not exists rejection_reason text;

alter table public.invoices
  add column if not exists delivery_id text,
  add column if not exists line_snapshots jsonb;

alter table public.sales_order_items add column if not exists qty_delivered numeric not null default 0;

create index if not exists invoices_delivery_id_idx on public.invoices(delivery_id);

alter table public.tukar_faktur add column if not exists received_proof_url text;

commit;
