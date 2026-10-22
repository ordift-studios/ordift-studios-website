import { createAdminClient } from "@/lib/supabase/admin";
import { assessAgreementReadiness, type AgreementReadiness, type EntityCandidate } from "./agreementReadiness";

// Read-only loader: gathers the recorded facts for one controlled legal document and the verified legal entities, then assesses them.
// It writes nothing and changes no approval, version or audit record.
export async function loadAgreementReadiness(params: { canonicalCode: string; jurisdictionName: string | null; confirmedEntityId: string | null }): Promise<AgreementReadiness | null> {
  const admin = createAdminClient();
  const { data: master } = await admin.from("legal_document_masters").select("id, title, current_version_id").eq("canonical_code", params.canonicalCode).maybeSingle();
  if (!master) return null;
  const { data: v } = master.current_version_id
    ? await admin.from("legal_document_versions").select("status, approved_by, approved_at, activated_at, effective_date, content_reference, document_hash, master_docx_sha256, master_pdf_sha256").eq("id", master.current_version_id as string).maybeSingle()
    : { data: null };

  const [{ data: entities }, { data: jurisdictions }, { data: signatories }] = await Promise.all([
    admin.from("employing_entities").select("id, name, jurisdiction_id, active, verification_status"),
    admin.from("employment_jurisdictions").select("id, name"),
    admin.from("entity_signatories").select("employing_entity_id"),
  ]);
  const jName = new Map((jurisdictions ?? []).map((j) => [j.id as string, j.name as string]));
  const withSignatory = new Set((signatories ?? []).map((s) => s.employing_entity_id as string));
  const candidates: EntityCandidate[] = (entities ?? [])
    .filter((e) => e.active)
    .map((e) => ({ id: e.id as string, name: e.name as string, jurisdiction: jName.get(e.jurisdiction_id as string) ?? null, verified: e.verification_status === "verified", hasSignatory: withSignatory.has(e.id as string) }));

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
        }
      : null,
    jurisdictionName: params.jurisdictionName,
    confirmedEntityId: params.confirmedEntityId,
    entityCandidates: candidates,
  });
}
