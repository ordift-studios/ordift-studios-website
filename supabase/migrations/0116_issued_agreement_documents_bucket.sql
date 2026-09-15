-- Ordift Studios Legal Suite / COMP-SYS-1, Phase B7 Step 7 (2026-09-15)
-- — the smallest issuance-bridge: a private storage bucket for the
-- immutable, controlled artifact recorded when an agreement moves
-- approved_for_issue -> sent (agreementIssuance.ts).
--
-- No bucket for per-agreement issued documents existed before this —
-- confirmed by inventory of every storage.buckets insert across every
-- migration. legal-masters (0068) stores the Official Master source
-- files (the controlled TEMPLATE); legal-entity-documents (0105)
-- stores employing-entity evidence (registration certificates) — this
-- is a third, distinct concern: the frozen, per-agreement rendered
-- ISSUANCE artifact, one object per agreement, named by agreement id.
--
-- Exact same private-bucket pattern as both precedents: public=false,
-- Super Admin read via storage.objects RLS. No insert policy is
-- granted to `authenticated` — every write happens server-side via the
-- service-role admin client inside issueEmployeeEmploymentAgreement()
-- (agreementIssuance.ts), never a direct client upload; the external
-- signatory's read access is also entirely server-mediated (via their
-- verified signature token, never direct Storage/RLS access), so no
-- additional policy is needed for that path either.
--
-- text/plain only: the issued artifact is a deterministic, composed
-- text document (the verbatim OS-LGL-007 master text plus the frozen
-- Schedule A snapshot, clearly separated) — not a PDF. No PDF/HTML-to-
-- PDF rendering pipeline exists anywhere in this codebase (confirmed
-- by inventory); building one is a separate, substantial piece of
-- work, out of this narrow bridge's scope. A plain-text canonical
-- rendering is fully sufficient for genuine review/signature purposes
-- and — critically — is exactly reproducible/verifiable from the same
-- two already-immutable inputs (the registered master, the frozen
-- snapshot), which a binary PDF render would not add integrity value
-- over for this phase.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'issued-agreement-documents',
  'issued-agreement-documents',
  false,
  2097152, -- 2MB — generous for a composed plain-text employment agreement
  array['text/plain']
);

create policy "issued-agreement-documents: super admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'issued-agreement-documents' and (select private.is_super_admin()));

commit;
