-- Vendor Agreement Safety Check (2026-09-16), explicitly authorized as
-- part of the standing backlog-completion run: ORD-AGR-2026-000005
-- traced in full. Both signature_evidence rows (Lady Anim-Tetey as
-- vendor, Myredlive Anim-Tetey as ordift) are GENUINE — real signatures,
-- recorded via the real Signature Engine, during the Founder's own live
-- Production QA of the real Vendor Portal signing flow (the same
-- session migration 0128 repaired a stuck status transition for). The
-- signing PARTY, however, is Lady Anim-Tetey / Lavish & Cedar — the
-- explicitly-designated controlled QA Vendor account, not a genuine
-- commercial vendor relationship. Technically genuine execution
-- mechanism, controlled-test business context: this must never be
-- silently relied upon later as a real, binding vendor agreement.
--
-- No signature_evidence, signature_signatories, agreement_snapshots, or
-- agreements.status/timestamps are touched — the real execution history
-- is fully preserved exactly as it happened (0128's own explicit
-- policy). This migration only adds an additive, nullable
-- classification column (null/default = genuine, the correct reading
-- for every other agreement in this table) and marks this one row.

begin;

alter table public.agreements
  add column evidence_classification text
    check (evidence_classification is null or evidence_classification in ('genuine', 'controlled_test'));

comment on column public.agreements.evidence_classification is
  'Null (default) = genuine, the correct reading for virtually every row. ''controlled_test'' marks an agreement whose signature evidence is technically real (genuine Signature Engine, real signature_evidence rows) but whose signing party is a designated controlled QA/test account, not a genuine commercial counterparty — set only by explicit, one-off administrative correction (see migration 0133), never by application code. UI must surface this prominently; it must never be treated as a genuine legal execution.';

update public.agreements
set evidence_classification = 'controlled_test'
where id = '70359ce5-7039-40ab-96db-319819ba51d4'
  and agreement_reference = 'ORD-AGR-2026-000005'
  and status = 'fully_executed';

commit;
