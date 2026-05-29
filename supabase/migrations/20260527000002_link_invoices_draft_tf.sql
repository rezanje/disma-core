-- supabase/migrations/20260527_link_invoices_draft_tf.sql
-- RPC: link invoices to a Draft TF without changing TF status or invoice due_date.
-- Used by GenerateTfModal "Save as Draft" so detail page tidak Invoice (0).

create or replace function public.link_invoices_to_tukar_faktur(
  p_tf_id uuid,
  p_invoice_ids text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
