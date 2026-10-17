# Paper-first operations transition

Approved in chat: office Admin PO works 10:00–19:00 WIB; purchasing 00:00–04:00,
QC 03:00–09:00, couriers from 08:00. Field workers continue using printed paper
and WhatsApp. The office transcribes actual events later; purchase costing may follow.

## User workflow

1. Print a dated field packet: shopping worksheet, QC sheet, QC-to-courier handover
   grouped by courier and destination, delivery note per outlet, and blank supplemental
   sheets. Planned amounts are labelled; actual amounts and signatures remain blank.
   Printing alone does not change physical stock or claim handover/client acceptance.
2. One QC/handover workspace: batch QC, outlet allocations, packing quantities,
   courier/time/paper, spare dispatch. One save can persist selected actual events.
   Separate QC and handover times/performers; never infer physical departure from QC.
3. Transcribe client results using frozen delivery lines and signed evidence. Record
   returns and reconcile spare carried/used for shrinkage/damaged/returned. Financial
   audit remains Finance's job, and no estimate becomes final cost prematurely.
4. Transcribe late WhatsApp orders with delivery date, original order time, unique
   paper reference, source evidence, additional quantities only. A supplement links
   to its original PO without reopening or overwriting a locked delivery snapshot.
   New late demand enters the same purchasing/QC queues; existing physical quantities
   are never silently recreated. Reported purchases remain Finance-only.

## Integrity

Every write authenticates the office actor server-side. Combined transcription is one
PostgreSQL transaction reusing existing goods-event commands. Stable event identity
makes lost-response retry safe; payload conflicts fail. A bad row rolls back the
whole combined save. Existing independent endpoints remain compatible.

Courier spare is company inventory in courier custody, separate from warehouse free
stock and billable client delivery lines. Outgoing spare requires free unreserved
stock. Reconciliation conserves qty = used + damaged + returned. Return restores
warehouse stock once; used/damaged quantities become inventory loss, valued only
once actual pending purchase costs are known. Cost provenance survives transfers.
Original events, orders, stock, journal entries and invoice history are not migrated
or rewritten. Source dates use actual event time; recorded_at uses server time.

## Delivery and verification

Keep legacy URLs reachable, but office navigation exposes packet, QC/handover and
results, with supplemental orders available in the workspace. Exercise retry,
rollback, shared demand, stock reservation conflicts, original-PO linkage, spare
conservation and late costing in an isolated PostgreSQL fixture. Run regression,
TypeScript and build. Back up production before additive schema deployment; verify
Vercel READY and canonical production alias before reporting live.
