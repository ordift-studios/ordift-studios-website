begin;

-- OS-LGL-009 Vendor & Supplier Framework Agreement — consolidated
-- controlled content attachment (2026-09-15), same precedent as
-- migration 0082 (OS-LGL-007). Migration 0067 seeded OS-LGL-009's
-- v1.0 legal_document_versions row with status 'approved',
-- approved_by 'Legal Counsel', content_reference NULL, and notes
-- stating "Content not yet imported through the controlled
-- document-import process" — the exact same starting state OS-LGL-007
-- was in before 0082 ran.
--
-- This migration attaches the real content ONLY where content_reference
-- is still unset, and ONLY for that exact pre-existing row — it never
-- overwrites approved_by/approved_at/status (which reflect a decision
-- already on record before this stage) and never creates a second
-- OS-LGL-009 master or a second v1.0 version. The historical note is
-- preserved, not deleted; this only appends a fact: that consolidated
-- controlled content was attached today, under the Founder/Super
-- Admin's own general authorization for the ordinary operational,
-- commercial and drafting decisions this consolidation required. This
-- is NOT a claim that any individual sentence of the consolidated text
-- was separately reviewed by outside legal counsel on this date — no
-- such review evidence exists, and none is asserted.
--
-- OS-LGL-009A (Vendor & Supplier Framework Agreement), OS-LGL-009B
-- (Vendor Schedule / Work Order), and OS-LGL-009C (Variation / Change
-- Order) are controlled INSTRUMENT roles within this single master —
-- see src/lib/legal/vendorAgreements.ts's own header comment for the
-- full architecture. Only 009A has master-level prose (this content
-- reference); 009B/009C are issued as their own agreements/
-- agreement_amendments rows referencing the SAME master, never a
-- second or third legal_document_masters row.
update public.legal_document_versions v
set content_reference = 'src/lib/legal/documents/os-lgl-009a-vendor-supplier-framework-agreement.ts',
    notes = coalesce(v.notes, '') || ' Consolidated controlled content attached 2026-09-15 (OS-LGL-009 Vendor & Supplier Framework Agreement implementation phase) — see content_reference. Covers OS-LGL-009A (Framework); OS-LGL-009B (Work Order) and OS-LGL-009C (Variation) are issued as their own agreement/amendment records against this same master, per the approved Option A architecture. Existing Counsel Approved status/approved_by preserved unchanged; this note does not assert a separate counsel review of this specific consolidated text on this date.'
from public.legal_document_masters m
where v.master_id = m.id
  and m.canonical_code = 'OS-LGL-009'
  and v.version = '1.0'
  and v.content_reference is null;

commit;
