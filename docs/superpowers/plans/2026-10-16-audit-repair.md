# DISMA Two Admin Audit Repair Implementation Plan

> **For agentic workers:** Execute the independent ownership groups below with Superpowers parallel development and test-first verification. Do not edit another group's files without coordination.

**Goal:** Repair the approved audit's money, stock, document and access defects and make the existing ERP operable through Admin PO and Finance, retaining Super Admin oversight.

**Architecture:** Preserve the existing Next.js/Supabase application and its shared business helpers. Introduce authenticated server commands for authoritative financial events, fail-closed persistence, immutable delivery/invoice details, and common quantity/permission rules; retain historical rows and compatibility readers. Database migrations are prepared and tested against an isolated fixture, never silently applied to the connected live database.

**Tech Stack:** Next.js 16, TypeScript, React 19, Zustand, Supabase/Postgres, Node assertions.

**Spec:** Approved audit at https://chatgpt.com/space/page_3da3f82a365881918273bcb5f5990480 and /workspace/audit-disma/laporan-audit-disma.md with /workspace/audit-disma/lampiran-bukti.md. User approval: "oke perbaiki!".

## Global Constraints

- Reuse existing functions and preserve all historical documents/IDs; no rebuild, destructive cleanup, live test writes or deploy during local implementation.
- Only Admin PO, Finance and Super Admin need app accounts. Field performers remain separate selectable people.
- Adopt the audit's recommendations as defaults for implementation; keep contractual due-date/payment policies explicit and configurable.
- A successful operation must be durable, reentrant by stable event ID, and consistent across stock, cash, journal and invoice/AP allocations.
- Every behavior change gets a failing regression followed by a passing run; test transport must fail closed against external network access.
- Existing task checkout on non-main branch `work` is already separate from the user's local checkout. Work here; no additional worktree or dependencies required.

## Review Focus

- Lost response after commit, identical retries and conflicting payload with identical event ID.
- Two admins acting on stale quantities/invoice balances, partial receipts and zero-accepted decisions.
- Old invoices without snapshots, historical TF representations, and printing after supplemental rounds.
- Authentication expiry/revocation, spoofed client roles and generic table/RPC bypasses.
- Failure after one financial leg and failed persistence of ordinary business rows.

## Task 1 Server authentication and privileged actions

Files: new server session/auth helpers and /api/auth/session; login/AuthGuard; all API boundary guards; SQL privilege migration.
Produces: server `requireApiUser(request, allowedRoles?)` or equivalent, verified against DB users and a signed HttpOnly session; no client PIN/user list authority. Coordinate imports with other API owners.

- [x] RED: reject missing/tampered/expired sessions, spoofed role, cross-origin mutations and non-SA maintenance; authenticated three-role operational paths allowed.
- [x] Implement server login/session/logout, rate limiting and server table/action authorization; exclude PINs from client user payloads.
- [x] Prepare explicit RPC privilege migration compatible with existing TF client callers (move privileged RPC calls behind authenticated API).
- [x] GREEN: offline auth/API regression suite and typecheck.

## Task 2 Store durability and safe maintenance

Files: store.ts, global undo/rollback controls. Root owns backup/reset API implementation integration.
Produces: read-only init, all authoritative sync errors propagate, mutations restore prior state on rejection; financial rows are immutable through raw generic edits/deletes, rollback cannot replay broad snapshots.

- [x] RED: init emits no writes, missing table/non-2xx errors reject, optimistic row changes roll back; posted cash/AP/PO deletion and destructive global undo are rejected.
- [x] Remove implicit repair/seed/reset from hydration. Keep cached last-known state on read error; no fake success for missing schema.
- [x] Route bulk receipt client state to the atomic receipt command from Task 3. Guard unsafe edit/delete/cascade paths rather than deleting history.
- [x] GREEN: persistence and lifecycle regression suite.

## Task 3 Atomic financial receipts and checked postings

Files: accounting.ts, new receipt command/API and SQL migrations. Own these files exclusively.
Produces: `recordClientReceipt(input: {paymentId:string; date:string; bankAccountId:string; amount:number; allocations:Array<{invoiceId:string;amount:number}>}): Promise<boolean>`; current recordPaymentReceived remains compatible with optional stable payment ID, and frontend receives refreshed invoice/bank/journal/cash rows. Stable IDs per event, not per invoice.

- [x] RED: client 60k+90k payments on150k -> GL/cash/paid150k/AR0; one150k across A100k+B50k; overallocations, non-membership, conflict/retry and failure at each stage.
- [x] Implement one SQL transaction for receipt header/allocations, journal, cash, bank and invoice status with locking, payload validation and event dedupe. Service-role only execution.
- [x] Require HPP/reject/transfer posting success; deterministic event cash IDs; source-selected payments; no unsupported cash/credit paths silently succeed.
- [x] GREEN: financial command regressions, isolated migration SQL tests, full helper suite.

## Task 4 Goods events and paper transcription

Files: qc-process.ts, dispatch.ts, delivery-audit.ts, qc-workspace, Hari ini, warehouse/courier flows. Request type changes from root.
Produces: validated receipt/QC/packing/dispatch/acceptance quantities, stable event IDs, snapshot details per delivery and accepted invoice round, performer/time vs recorder/time; no field login.

- [x] RED: negative/NaN/overallocation, all rejected mixed PO, partial receipt6+4, repeated QC/release/finalize, packed6/QC10, rejection2 and subsequent return.
- [x] Guard completed events and stable movement IDs; preserve partial queues and explicit zero decisions; qty dispatched governs actual release; no repeated deduction.
- [x] Separate occurredAt/performedBy from recorded time; complete paper reception/packing/handover/acceptance evidence and accessible office path.
- [x] GREEN: operational regressions and safe normal/supplemental simulations.

## Task 5 Purchasing and PO revision

Files: shopping-report and purchase-plan helpers; purchase-plan/salin-belanja/online-purchase; admin shopping-list/consolidation/sales-orders.
Produces: shared stock demand allocator, selected per-paper submission, merged actual purchase allocations, correct total/unit prices, allowed payment combinations, protected revision and no fabricated returned money.

- [x] RED: two10kg PO with5kg free ->15kg buy; active reserved stock excluded; checked session doesn't close unrelated document; partial buying remains open; .25kg total10k ->40k/unit.
- [x] Apply one edit lock from every PO entry; select exact paper/doc, respect merged allocations, propagate transfer failures and keep failed online orders pending.
- [x] Distinguish expected remainder from actually received return; support selected source for costs. Reject unsupported method/payment combinations before release.
- [x] GREEN: purchasing regressions and typecheck.

## Task 6 Billing documents and financial entry surfaces

Files: pdf.ts; finance invoices/AP/cash-bank/reconciliation/TF pages; TF picker. Root owns navigation/reports.
Consumes: Task3 recordClientReceipt; Task4 snapshots (use optional snapshot fields, legacy fallback labelled, never mutate historic documents).

- [x] RED: immutable first6/second4 invoice print, unpaid stamp, alternative approval paths identical, manual cash can't settle AR without invoice allocation, wrong AP reversal blocked.
- [x] Use atomic receipts/stable ID UI with in-flight guard; consolidate TF to invoice references; no age cutoff preventing payment; preserve contractual due basis and receipt proof.
- [x] Freeze invoice/SJ/BA details; remove mock evidence/actions; block raw posted cash/GL/AP mutation until source-linked reversal can run safely.
- [x] GREEN: billing/document regressions and typecheck.

## Task 7 Integration menu oversight and verification

Root owns shared types, navigation/permission registry, reports, backup/reset safety and integration tests.

- [x] Implement five PO, seven Finance and five Super Admin task groups using existing pages/forms and contextual links. Match server grants, desktop/mobile/search and prevent dangerous route inheritance.
- [x] Backup fails on missing data, includes all app tables/settings with manifest/counts; restore is privileged and explicit, no silent partial success. Do not run restore live.
- [x] Daily/PO summaries use posted facts and consistent balances, include failed/open paper events; use GL for official profit.
- [x] Run full offline helper/regression suite, typecheck and build with dummy/no-write environment. Validate migrations on disposable PostgreSQL if available.
- [x] Fresh independent review; fix material findings with regression tests. Report exact remaining deployment/migration steps and any unresolved business-policy limitations.

## Execution decisions

The approved written audit contains the design, recommendations and staged repair sequence; the user's explicit request authorizes implementation without another approval round for the same scope. Use independent ownership groups to avoid shared-file conflicts. No live database mutation/deployment is necessary to make the code and migrations reviewable.

## Integrated verification

Implementation and independent review are complete in the task checkout. See [verification](../../audit-repair-verification.md) and [rollout](../../audit-repair-rollout.md) for scope, reproducible checks and deployment requirements. These checkboxes describe local implementation/verification; no live deployment or browser UAT is claimed.
