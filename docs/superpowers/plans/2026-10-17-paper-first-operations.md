# Paper-first operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let office staff print before operations and transcribe QC, courier custody and late orders afterward.
**Architecture:** Add a restricted transition RPC composing existing durable goods events, dedicated courier-spare custody and supplemental-order metadata. Pure packet and command builders feed compact office views; existing financial command boundaries stay intact.
**Tech Stack:** Next.js 16, React 19, Zustand, PostgreSQL/Supabase, jsPDF.
**Spec:** docs/superpowers/specs/2026-10-17-paper-first-operations-design.md

## Global Constraints
- Field workers continue using paper/WhatsApp; office actors authenticate all writes.
- Printing never moves stock; actual and entry timestamps stay distinct.
- Spare is not billable order qty; actual costs may arrive later.
- Preserve existing source commands and financial authorization.

## Review Focus
- Lost response must replay exact batch without duplicate goods/journals.
- Invalid last row must roll back earlier batch rows.
- Reserved or already-dispatched inventory must not become spare.
- Reusing a paper reference must not create another late order.
- Returning unpriced spare must preserve cost provenance for later booking.

### Task 1: Durable transition commands
Files: new migrations 20261017000002_paper_first_operations.sql and 20261017000003_paper_operations_backups.sql; tests/operations/paper-first.sql; src/lib/paper-operations.ts; API operations/paper.
Interfaces: process_paper_operation(command jsonb, actor text) -> {ok,eventId,updates}; stages transcribe, supplement, spare-settle. Combined transcribe consumes QC commands, selected dispatch rows and spare rows; emits canonical source updates and spare custody rows.
- [x] Write failing SQL fixtures for rollback/retry, late duplicate reference/parent linkage, reserved spare/conservation/costing.
- [x] Run fixture to confirm missing-command failure.
- [x] Implement additive schema, restricted RPC and protected metadata.
- [x] Run all fresh-schema database checks.

### Task 2: Print packet and office views
Files: new field-packet.ts/pdf, field-packet workspace, paper dispatch/results/supplement components; QC table; operasi/navigation and shopping-paper integration.
Interfaces: buildFieldPacket(state,date,assignments) -> typed pages; preparePaperTranscription(qcPlans,dispatches,spares,evidence) -> stable command; submitPaperOperation(command) merges confirmed updates once.
- [x] Write packet/command tests for planned vs blank actuals, per-outlet notes, spare separation, dates and pending retry.
- [x] Run tests to see failures.
- [x] Implement packet preview and date/courier selection, combined transcription, supplemental-order form and client/spare results.
- [x] Run regression tests and TypeScript/build sequentially.

### Task 3: Review and publish
- [x] Review final diff against spec and fix material issues; repeat affected checks.
- [ ] Back up production data/functions privately and verify additive migration preserves existing business facts.
- [ ] Apply tested migration, push PR, wait preview, merge exact head, verify production READY and canonical routes/auth/assets.
- [ ] Report usable entry points and limitations concisely in Indonesian.
