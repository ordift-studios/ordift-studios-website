import { createAdminClient } from "@/lib/supabase/admin";
import { assessAgreementReadiness, type AgreementReadiness, type AttestationFacts, type EntityCandidate } from "./agreementReadiness";

// Read-only loader: gathers the recorded facts for one controlled legal document and the verified legal entities, then assesses them.
// It writes nothing and changes no approval, version, entity or audit record.
export async function loadAgreementReadiness(params: {
  canonicalCode: string;
  jurisdictionName: string | null;
  jurisdictionSource: string | null;
  recordedEntityId: string | null;
  confirmedEntityId: string | null;
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

  const [{ data: entities }, { data: jurisdictions }, { data: signatories }] = await Promise.all([
    admin.from("employing_entities").select("id, name, jurisdiction_id, active, verification_status"),
    admin.from("employment_jurisdictions").select("id, name"),
    admin.from("entity_signatories").select("employing_entity_id, full_name").is("effective_to", null),
  ]);
  const jName = new Map((jurisdictions ?? []).map((j) => [j.id as string, j.name as string]));
  const signatoryOf = new Map<string, string>();
  for (const s of signatories ?? []) if (!signatoryOf.has(s.employing_entity_id as string)) signatoryOf.set(s.employing_entity_id as string, s.full_name as string);
  const candidates: EntityCandidate[] = (entities ?? [])
    .filter((e) => e.active)
    .map((e) => ({
      id: e.id as string,
      name: e.name as string,
      jurisdiction: jName.get(e.jurisdiction_id as string) ?? null,
      verified: e.verification_status === "verified",
      hasSignatory: signatoryOf.has(e.id as string),
      signatoryName: signatoryOf.get(e.id as string) ?? null,
      href: `/admin/organization/legal-entities/${e.id as string}`,
    }));

  // The attestation store is a PROPOSED table that does not exist until a separately authorised migration is applied; its absence is
  // a normal state here, not an error.
  let attestation: AttestationFacts = null;
  let attestationStoreAvailable = false;
  if (v) {
    const { data: a, error } = await admin
      .from("legal_document_approval_attestations")
      .select("approval_date, counsel_name, counsel_firm, verified_at")
      .eq("version_id", v.id as string)
      .order("verified_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error) {
      attestationStoreAvailable = true;
      if (a) attestation = { approvalDate: a.approval_date as string, counselName: a.counsel_name as string, counselFirm: a.counsel_firm as string, verifiedAt: a.verified_at as string };
    }
  }

  return assessAgreementReadiness({
    code: params.canonicalCode,
    title: master.title as string,
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
    confirmedEntityId: params.confirmedEntityId,
    entityCandidates: candidates,
    attestation,
    attestationStoreAvailable,
    legalHref: "/admin/legal",
  });
}
