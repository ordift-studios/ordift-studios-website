import { createAdminClient } from "@/lib/supabase/admin";
import { assessAgreementReadiness, type AgreementReadiness, type AttestationFacts, type EntityCandidate, type FounderFact } from "./agreementReadiness";
import { loadApprovalAttestation, loadRegistrationCheck } from "./masterRegistryActions";
import { loadOnboardingDecisions } from "@/lib/organization/onboardingDecisions";

// Read-only loader: gathers the recorded facts for one controlled legal document, the verified legal entities (with their documents and
// signatories), the Founder's verified identity and the audited decisions made in this onboarding, then assesses them. It writes nothing.
export async function loadAgreementReadiness(params: {
  onboardingId: string;
  canonicalCode: string;
  jurisdictionName: string | null;
  jurisdictionSource: string | null;
  recordedEntityId: string | null;
}): Promise<AgreementReadiness | null> {
  const admin = createAdminClient();
  const { data: master } = await admin.from("legal_document_masters").select("id, title, current_version_id").eq("canonical_code", params.canonicalCode).maybeSingle();
  if (!master) return null;
  const { data: v } = master.current_version_id
    ? await admin
        .from("legal_document_versions")
        .select("id, status, approved_by, approved_at, activated_at, effective_date, content_reference, document_hash, master_docx_sha256, master_pdf_sha256, master_docx_storage_path, master_pdf_storage_path, created_at, ingested_at")
        .eq("id", master.current_version_id as string)
        .maybeSingle()
    : { data: null };

  const [{ data: entities }, { data: jurisdictions }, { data: signatories }, { data: documents }, { data: founderRow }, decisions] = await Promise.all([
    admin.from("employing_entities").select("id, name, jurisdiction_id, active, verification_status"),
    admin.from("employment_jurisdictions").select("id, name"),
    admin.from("entity_signatories").select("id, employing_entity_id, full_name, position, authority, source_document_id, profile_id").is("effective_to", null),
    admin.from("employing_entity_documents").select("id, employing_entity_id, document_type, original_filename, file_sha256, notes"),
    admin.from("founder_identities").select("profile_id").eq("status", "active").maybeSingle(),
    loadOnboardingDecisions(params.onboardingId),
  ]);
  const jName = new Map((jurisdictions ?? []).map((j) => [j.id as string, j.name as string]));
  const candidates: EntityCandidate[] = (entities ?? [])
    .filter((e) => e.active)
    .map((e) => ({
      id: e.id as string,
      name: e.name as string,
      jurisdiction: jName.get(e.jurisdiction_id as string) ?? null,
      verified: e.verification_status === "verified",
      signatories: (signatories ?? []).filter((s) => s.employing_entity_id === e.id).map((s) => ({ id: s.id as string, fullName: s.full_name as string, position: s.position as string, authority: (s.authority as string | null) ?? null, sourceDocumentId: (s.source_document_id as string | null) ?? null, profileId: (s.profile_id as string | null) ?? null })),
      documents: (documents ?? []).filter((d) => d.employing_entity_id === e.id).map((d) => ({ id: d.id as string, type: d.document_type as string, filename: (d.original_filename as string | null) ?? null, hasStoredFile: Boolean(d.file_sha256 && d.original_filename), notes: (d.notes as string | null) ?? null })),
      href: `/admin/organization/legal-entities/${e.id as string}`,
    }));

  let founder: FounderFact = null;
  if (founderRow?.profile_id) {
    const { data: p } = await admin.from("profiles").select("full_name, member_number").eq("id", founderRow.profile_id as string).maybeSingle();
    if (p) founder = { profileId: founderRow.profile_id as string, name: (p.full_name as string) ?? "Founder", memberNumber: (p.member_number as string | null) ?? null };
  }

  let attestation: AttestationFacts = null;
  let registrationCheck: { unresolvedMarkers: number } | null = null;
  if (v) {
    const a = await loadApprovalAttestation(v.id as string);
    if (a) {
      let verifiedByLabel: string | null = null;
      if (a.verifiedByProfileId) {
        const { data: p } = await admin.from("profiles").select("member_number").eq("id", a.verifiedByProfileId).maybeSingle();
        verifiedByLabel = (p?.member_number as string | null) ? `member ${p!.member_number}` : null; // audit identity standard: member number, not name
      }
      attestation = { approvalDate: a.approvalDate, counselName: a.counselName, counselFirm: a.counselFirm, verifiedAt: a.verifiedAt, verifiedByLabel, identityCheck: a.identityCheck ? { method: a.identityCheck.method, checkedOn: a.identityCheck.checkedOn } : null, approvalDateInEvidence: a.approvalDateInEvidence };
    }
    const r = await loadRegistrationCheck(v.id as string);
    if (r && r.unresolvedMarkers >= 0) registrationCheck = { unresolvedMarkers: r.unresolvedMarkers };
  }

  return assessAgreementReadiness({
    code: params.canonicalCode,
    title: master.title as string,
    versionId: (v?.id as string | undefined) ?? null,
    version: v
      ? {
          status: v.status as string,
          approvedBy: (v.approved_by as string | null) ?? null,
          approvedAt: (v.approved_at as string | null) ?? null,
          activatedAt: (v.activated_at as string | null) ?? null,
          effectiveDate: (v.effective_date as string | null) ?? null,
          contentReference: (v.content_reference as string | null) ?? null,
          documentHash: (v.document_hash as string | null) ?? null,
          masterDocxSha256: (v.master_docx_sha256 as string | null) ?? null,
          masterPdfSha256: (v.master_pdf_sha256 as string | null) ?? null,
          masterDocxPath: (v.master_docx_storage_path as string | null) ?? null,
          masterPdfPath: (v.master_pdf_storage_path as string | null) ?? null,
          createdAt: (v.created_at as string | null) ?? null,
          ingestedAt: (v.ingested_at as string | null) ?? null,
        }
      : null,
    jurisdictionName: params.jurisdictionName,
    jurisdictionSource: params.jurisdictionSource,
    recordedEntityId: params.recordedEntityId,
    confirmedEntityId: decisions.entityId,
    entityCandidates: candidates,
    attestation,
    registrationCheck,
    selectedSignatoryId: decisions.signatoryId,
    founder,
    legalHref: "/admin/legal",
  });
}
