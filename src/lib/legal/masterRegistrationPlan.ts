import { createHash } from "node:crypto";
import { extractDocxText, findUnresolvedReviewMarkers } from "./docxText";

// CONTROLLED-MASTER IMPORT AND VERSION REGISTRATION PLAN (pure; LOCAL; nothing here touches any database or storage).
// Given a new version's stored master files, it (1) validates the version identifier, hashes, paths and the files themselves, and (2) renders three SQL files:
// the registration migration (adds ONE draft row, changes no existing row), its guarded rollback, and a read-only verification. The registration CONTROL (hash re-check, clause
// check, content reference) stays exactly where it is, in the registry's own register action; this plan only records where the stored files are and what they hash to.
// Nothing here approves, activates, publishes or issues anything, and no master is ever "cleaned" by this code: a file that still carries counsel-review markers is REFUSED.

export type RegistrationPlanInput = { code: string; version: string; docxPath: string; docxSha256: string; pdfPath: string; pdfSha256: string };
export type ExistingVersion = { id: string; version: string; status: string; legacyCode: string | null; docxPath: string | null; docxSha256: string | null; pdfPath: string | null; pdfSha256: string | null };
export type ExistingMasterFacts = { masterExists: boolean; currentVersionId: string | null; versions: ExistingVersion[] } | null;
export type PlanVerdict = { ok: true; warnings: string[] } | { ok: false; errors: string[]; warnings: string[] };

export const CREATED_ACTION = "legal.master_version.created_by_migration";
export const ROLLED_BACK_ACTION = "legal.master_version.creation_rolled_back";
export const BUCKET = "legal-masters";

const SHA = /^[0-9a-f]{64}$/;
const CODE = /^OS-LGL-\d{3}$/;
const VERSION = /^\d{1,3}\.\d{1,3}$/;
const pathRe = (kind: "docx" | "pdf", code: string) => new RegExp(`^masters-${kind}/${code}/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\\.${kind}$`);
const tuple = (v: string) => v.split(".").map(Number) as [number, number];
const cmp = (a: string, b: string) => { const [a1, a2] = tuple(a), [b1, b2] = tuple(b); return a1 - b1 || a2 - b2; };

export const sha256Hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

// ------------------------------------------------------------------ 1. validate the plan against what the registry already holds
export function validateRegistrationPlan(i: RegistrationPlanInput, existing: ExistingMasterFacts): PlanVerdict {
  const errors: string[] = []; const warnings: string[] = [];
  if (!CODE.test(i.code)) errors.push("The document code must look like OS-LGL-014.");
  if (!VERSION.test(i.version)) errors.push("The version must look like 1.1 (major.minor, digits only).");
  if (!SHA.test(i.docxSha256)) errors.push("The Word master's SHA-256 must be 64 lower-case hex characters.");
  if (!SHA.test(i.pdfSha256)) errors.push("The PDF master's SHA-256 must be 64 lower-case hex characters.");
  if (SHA.test(i.docxSha256) && i.docxSha256 === i.pdfSha256) errors.push("The Word and PDF masters have the same SHA-256, which cannot be two different files.");
  if (CODE.test(i.code)) {
    if (!pathRe("docx", i.code).test(i.docxPath)) errors.push(`The Word master's storage path must look like masters-docx/${i.code}/<file>.docx (no folders beyond that, no “..”).`);
    if (!pathRe("pdf", i.code).test(i.pdfPath)) errors.push(`The PDF master's storage path must look like masters-pdf/${i.code}/<file>.pdf (no folders beyond that, no “..”).`);
  }
  if (!existing) {
    warnings.push("The registry's existing versions were not supplied, so uniqueness and ordering were not checked here. The migration itself refuses a duplicate version, a reused hash or path, and a missing master when it runs.");
  } else {
    if (!existing.masterExists) errors.push(`The legal master ${i.code} does not exist, so no version can be added to it.`);
    if (VERSION.test(i.version)) {
      if (existing.versions.some((v) => v.version === i.version)) errors.push(`${i.code} already has a version ${i.version}.`);
      const parseable = existing.versions.filter((v) => VERSION.test(v.version));
      if (parseable.some((v) => cmp(v.version, i.version) >= 0)) errors.push(`The new version ${i.version} must be higher than every existing version of ${i.code} (${parseable.map((v) => v.version).sort(cmp).join(", ")}).`);
    }
    for (const v of existing.versions) {
      if (v.docxSha256 && v.docxSha256 === i.docxSha256) errors.push(`The Word master is byte-identical to the stored master of version ${v.version}; a new version must be a different text.`);
      if (v.pdfSha256 && v.pdfSha256 === i.pdfSha256) errors.push(`The PDF master is byte-identical to the stored master of version ${v.version}.`);
      if (v.docxPath === i.docxPath || v.pdfPath === i.pdfPath || v.docxPath === i.pdfPath || v.pdfPath === i.docxPath) errors.push(`A storage path is already used by version ${v.version}; a stored master is never overwritten.`);
    }
    const cur = existing.versions.find((v) => v.id === existing.currentVersionId);
    if (!cur) warnings.push("The master has no current version on record.");
    else if (cur.status !== "active") warnings.push(`The master's current version is “${cur.status}”, not active: confirm that is expected.`);
  }
  return errors.length ? { ok: false, errors, warnings } : { ok: true, warnings };
}

// ------------------------------------------------------------------ 2. verify the actual files against the plan (no network)
export function verifyMasterFiles(plan: RegistrationPlanInput, docx: Uint8Array, pdf: Uint8Array): { ok: true; markerCount: 0; textSha256: string } | { ok: false; errors: string[]; markers: string[] } {
  const errors: string[] = []; let markers: string[] = [];
  if (sha256Hex(docx) !== plan.docxSha256) errors.push("The Word file does not hash to the SHA-256 in the plan.");
  if (sha256Hex(pdf) !== plan.pdfSha256) errors.push("The PDF file does not hash to the SHA-256 in the plan.");
  if (Buffer.from(pdf.subarray(0, 5)).toString("latin1") !== "%PDF-") errors.push("The PDF file does not start with a PDF header.");
  const text = extractDocxText(docx);
  if (text === null) errors.push("The Word file could not be read (it must be a .docx containing word/document.xml).");
  else {
    markers = findUnresolvedReviewMarkers(text);
    if (markers.length > 0) errors.push(`The Word master still contains ${markers.length} unresolved counsel-review marker(s). It is not a final master and is refused: incorporate counsel's decisions first. Nothing is cleaned automatically.`);
    if (!text.includes(plan.code)) errors.push(`The Word master does not mention ${plan.code} anywhere in its text; check that it is the right document.`);
  }
  if (errors.length || text === null) return { ok: false, errors, markers };
  return { ok: true, markerCount: 0, textSha256: sha256Hex(Buffer.from(text, "utf8")) };
}

// ------------------------------------------------------------------ 3. the SQL (every interpolated value has already passed the strict patterns above)
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
function assertRenderable(i: RegistrationPlanInput) {
  const v = validateRegistrationPlan(i, null);
  if (!v.ok) throw new Error(`Refusing to render SQL for an invalid plan: ${v.errors.join(" ")}`);
}
const noteText = (i: RegistrationPlanInput) => `Version ${i.version} of ${i.code}, added by the controlled master import as a DRAFT. Not reviewed by counsel, not approved, not registered under a controlled content reference, not active. Approval is recorded only through the Founder approval screen after the legal review. The active version is unchanged.`;

export function renderRegistrationSql(i: RegistrationPlanInput): string {
  assertRenderable(i);
  return `-- PROPOSAL (NOT a numbered migration, NOT applied anywhere): adds ${i.code} version ${i.version} as ONE DRAFT row, pointing at its two stored master files. The number is assigned at release.
-- It changes NO existing row: no status, no approver label, no current-version pointer, no content reference. Rollback: ROLLBACK_${i.code}_v${i.version}_registration.sql. Verification (read-only): VERIFY_${i.code}_v${i.version}_registration.sql.
-- Pre-condition (a separate, authorised step): the two files are already stored in the private '${BUCKET}' bucket at exactly the paths below. This migration refuses to run if they are not.
-- Registration under a controlled content reference, the clause check and every approval step are NOT done here; they stay with the registry's own controls.
begin;

do $$
declare m uuid; cur uuid; nobj int; new_id uuid;
begin
  select id, current_version_id into m, cur from public.legal_document_masters where canonical_code = ${q(i.code)};
  if m is null then raise exception 'REGISTRATION REFUSED: the legal master ${i.code} does not exist'; end if;
  if exists (select 1 from public.legal_document_versions where master_id = m and version = ${q(i.version)}) then
    raise exception 'REGISTRATION REFUSED: ${i.code} already has a version ${i.version}';
  end if;
  if exists (select 1 from public.legal_document_versions where master_id = m and (version ~ '^[0-9]+\\.[0-9]+$') and (split_part(version, '.', 1)::int, split_part(version, '.', 2)::int) >= (${i.version.split(".")[0]}, ${i.version.split(".")[1]})) then
    raise exception 'REGISTRATION REFUSED: version ${i.version} is not higher than every existing version of ${i.code}';
  end if;
  if exists (select 1 from public.legal_document_versions where master_docx_sha256 in (${q(i.docxSha256)}, ${q(i.pdfSha256)}) or master_pdf_sha256 in (${q(i.docxSha256)}, ${q(i.pdfSha256)})
             or master_docx_storage_path in (${q(i.docxPath)}, ${q(i.pdfPath)}) or master_pdf_storage_path in (${q(i.docxPath)}, ${q(i.pdfPath)})) then
    raise exception 'REGISTRATION REFUSED: a hash or storage path is already recorded on another version';
  end if;
  select count(*) into nobj from storage.objects where bucket_id = ${q(BUCKET)} and name in (${q(i.docxPath)}, ${q(i.pdfPath)});
  if nobj <> 2 then raise exception 'REGISTRATION REFUSED: both master files must already be stored in the ${BUCKET} bucket (found % of 2)', nobj; end if;

  insert into public.legal_document_versions (master_id, version, status, notes, master_docx_storage_path, master_docx_sha256, master_pdf_storage_path, master_pdf_sha256, ingested_at)
  values (m, ${q(i.version)}, 'draft', ${q(noteText(i))}, ${q(i.docxPath)}, ${q(i.docxSha256)}, ${q(i.pdfPath)}, ${q(i.pdfSha256)}, now())
  returning id into new_id;

  insert into public.activity_log (action, entity_type, entity_id, metadata)
  values (${q(CREATED_ACTION)}, 'legal_document_version', new_id::text, jsonb_build_object(
    'documentCode', ${q(i.code)}, 'version', ${q(i.version)}, 'status', 'draft', 'docxPath', ${q(i.docxPath)}, 'docxSha256', ${q(i.docxSha256)}, 'pdfPath', ${q(i.pdfPath)}, 'pdfSha256', ${q(i.pdfSha256)},
    'currentVersionAtCreation', cur, 'changedExistingRows', false, 'approved', false, 'registeredUnderContentReference', false, 'basis', 'controlled_master_import'));
end $$;

commit;
`;
}

export function renderRollbackSql(i: RegistrationPlanInput): string {
  assertRenderable(i);
  return `-- ROLLBACK for the ${i.code} v${i.version} registration proposal. It removes the ONE draft row it added, and only while that row is still exactly as the migration left it.
-- It REFUSES (changing nothing) if the version has moved past draft, carries any approval, content reference, effective date, supersession or later audit event, or is referenced by an agreement or as a master's current version.
-- The creation audit entry is kept (the audit log is never rewritten); a "rolled back" entry is appended.
begin;

do $$
declare v public.legal_document_versions%rowtype; later int;
begin
  select v2.* into v from public.legal_document_versions v2 join public.legal_document_masters m on m.id = v2.master_id
   where m.canonical_code = ${q(i.code)} and v2.version = ${q(i.version)} and v2.master_docx_sha256 = ${q(i.docxSha256)} and v2.master_pdf_sha256 = ${q(i.pdfSha256)};
  if v.id is null then raise exception 'ROLLBACK REFUSED: no ${i.code} v${i.version} row with these fingerprints exists'; end if;
  if v.status <> 'draft' then raise exception 'ROLLBACK REFUSED: the version is "%", not a draft', v.status; end if;
  if v.approved_at is not null or v.approved_by is not null or v.content_reference is not null or v.document_hash is not null or v.effective_date is not null or v.activated_at is not null or v.retired_at is not null or v.supersedes_id is not null then
    raise exception 'ROLLBACK REFUSED: the version carries an approval, content reference, date or supersession';
  end if;
  if exists (select 1 from public.agreements where master_version_id = v.id) then raise exception 'ROLLBACK REFUSED: an agreement references this version'; end if;
  if exists (select 1 from public.legal_document_masters where current_version_id = v.id) then raise exception 'ROLLBACK REFUSED: it is a master''s current version'; end if;
  if exists (select 1 from public.legal_document_versions where supersedes_id = v.id) then raise exception 'ROLLBACK REFUSED: another version supersedes it'; end if;
  select count(*) into later from public.activity_log where entity_id = v.id::text and action <> ${q(CREATED_ACTION)};
  if later > 0 then raise exception 'ROLLBACK REFUSED: % later audit event(s) exist for this version', later; end if;

  insert into public.activity_log (action, entity_type, entity_id, metadata)
  values (${q(ROLLED_BACK_ACTION)}, 'legal_document_version', v.id::text, jsonb_build_object('documentCode', ${q(i.code)}, 'version', ${q(i.version)}, 'docxSha256', ${q(i.docxSha256)}, 'pdfSha256', ${q(i.pdfSha256)}, 'removedDraftRowOnly', true));
  delete from public.legal_document_versions where id = v.id;
  if exists (select 1 from public.legal_document_versions where id = v.id) then raise exception 'ROLLBACK FAILED: the row is still present'; end if;
end $$;

commit;
`;
}

// A read-only fingerprint of every OTHER row of the master: run before and after; the two outputs must be identical.
export function renderVerificationSql(i: RegistrationPlanInput): string {
  assertRenderable(i);
  return `-- READ-ONLY verification for the ${i.code} v${i.version} registration. Run it before the migration and again after it; the "existing_rows_fingerprint" line must be IDENTICAL both times.
select 'existing_rows_fingerprint' as check, md5(coalesce(string_agg(concat_ws('|', v.id, v.version, v.status, v.approved_by, v.approved_at, v.effective_date, v.activated_at, v.retired_at, v.supersedes_id, v.legacy_code, v.content_reference, v.document_hash, v.master_docx_storage_path, v.master_docx_sha256, v.master_pdf_storage_path, v.master_pdf_sha256), E'\\n' order by v.id), '')) as value
  from public.legal_document_versions v join public.legal_document_masters m on m.id = v.master_id where m.canonical_code = ${q(i.code)} and v.version <> ${q(i.version)};
select 'current_version_pointer' as check, m.current_version_id::text as value from public.legal_document_masters m where m.canonical_code = ${q(i.code)};
select 'new_row' as check, concat_ws(' | ', v.version, v.status, coalesce(v.approved_by, 'no approver'), case when v.content_reference is null then 'not registered' else 'REGISTERED' end, case when v.master_docx_sha256 = ${q(i.docxSha256)} and v.master_pdf_sha256 = ${q(i.pdfSha256)} then 'hashes match plan' else 'HASH MISMATCH' end) as value
  from public.legal_document_versions v join public.legal_document_masters m on m.id = v.master_id where m.canonical_code = ${q(i.code)} and v.version = ${q(i.version)};
select 'files_in_bucket' as check, count(*)::text as value from storage.objects where bucket_id = ${q(BUCKET)} and name in (${q(i.docxPath)}, ${q(i.pdfPath)});
select 'audit_events_for_new_row' as check, string_agg(a.action, ', ' order by a.created_at) as value from public.activity_log a join public.legal_document_versions v on a.entity_id = v.id::text join public.legal_document_masters m on m.id = v.master_id where m.canonical_code = ${q(i.code)} and v.version = ${q(i.version)};
`;
}
