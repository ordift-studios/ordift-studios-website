import { createAdminClient } from "@/lib/supabase/admin";

// Can a SEPARATE agreement actually be produced and executed for a Creative
// Crew Support request? Requiring one when it can't would trap the request
// (it could never be confirmed), so the platform checks first and says
// exactly what is missing.
//
// Two things must exist:
//  1. a designated, APPROVED legal template for Crew Support client
//     agreements. Which template covers this service is a legal decision,
//     so none is assumed: Counsel/the Founder designate one by adding its
//     canonical code below. (Approved templates that exist, such as the
//     Client Service Terms & General Booking Agreement, are listed to help
//     that decision but are NOT chosen automatically.)
//  2. a flow that issues a client agreement for a request through the
//     existing agreements / signature engine. Today agreements are created
//     only by the employee and vendor flows; no client-agreement issuance
//     exists yet.
//
// Until both are true, "Agreement required" is refused with an explanation,
// quotations that would depend on it can't be issued, and confirmation
// reports the same gap — never a silent dead end.
export const CREW_SUPPORT_AGREEMENT_TEMPLATE_CODES: readonly string[] = [];
export const CLIENT_AGREEMENT_ISSUANCE_SUPPORTED = false;

export type AgreementWorkflowStatus = { available: true } | { available: false; missing: string[]; explanation: string };

export type MasterFact = { canonicalCode: string; title: string; classification: string; versionStatuses: string[] };

export function assessAgreementWorkflow(params: { designatedCodes: readonly string[]; masters: MasterFact[]; issuanceSupported: boolean }): AgreementWorkflowStatus {
  const missing: string[] = [];
  const approved = params.masters.filter((m) => m.classification === "transaction_agreement" && m.versionStatuses.some((s) => s === "approved" || s === "active"));
  const designated = approved.filter((m) => params.designatedCodes.includes(m.canonicalCode));

  if (params.designatedCodes.length === 0) {
    const options = approved.map((m) => `${m.canonicalCode} ${m.title}`).slice(0, 6);
    missing.push(`No approved legal template has been designated for Creative Crew Support client agreements${options.length ? ` (approved client agreements that exist: ${options.join("; ")} — which one covers this service is a legal decision for Counsel/the Founder)` : ""}.`);
  } else if (designated.length === 0) {
    missing.push(`The designated Crew Support agreement template (${params.designatedCodes.join(", ")}) is not approved in the Legal Suite.`);
  }
  if (!params.issuanceSupported) {
    missing.push("The platform can't yet issue a client agreement for a Crew Support request for signature (agreements are currently created only by the employee and vendor flows).");
  }
  if (missing.length === 0) return { available: true };
  return {
    available: false,
    missing,
    explanation: `A separate agreement can't be produced for this service yet. Missing: ${missing.join(" ")} Until then, use the standard route — the accepted quotation with its terms — or settle the agreement outside the platform before proceeding.`,
  };
}

export async function getAgreementWorkflowStatus(): Promise<AgreementWorkflowStatus> {
  const admin = createAdminClient();
  const [{ data: masters }, { data: versions }] = await Promise.all([
    admin.from("legal_document_masters").select("id, canonical_code, title, classification"),
    admin.from("legal_document_versions").select("master_id, status"),
  ]);
  const facts: MasterFact[] = (masters ?? []).map((m) => ({
    canonicalCode: m.canonical_code as string,
    title: m.title as string,
    classification: m.classification as string,
    versionStatuses: (versions ?? []).filter((v) => v.master_id === m.id).map((v) => v.status as string),
  }));
  return assessAgreementWorkflow({ designatedCodes: CREW_SUPPORT_AGREEMENT_TEMPLATE_CODES, masters: facts, issuanceSupported: CLIENT_AGREEMENT_ISSUANCE_SUPPORTED });
}
