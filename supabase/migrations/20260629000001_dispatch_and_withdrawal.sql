-- Sourcing withdrawal tracking
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS withdrawal_amount numeric;

-- Dispatch (serah terima QC → logistik) tracking per SO item
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS qty_dispatched numeric;
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS dispatch_note text;
