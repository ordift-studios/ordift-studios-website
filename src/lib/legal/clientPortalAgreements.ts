import { createClient } from "@/lib/supabase/server";
import { isFullyExecuted, isIssuedAgreementStatus, type AgreementLifecycleStatus } from "./agreementLifecycle";

// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase H (2026-09-08).
// Client Portal read layer. Deliberately uses the AUTHENTICATED
// Supabase client (createClient(), never createAdminClient()) so the
// real RLS "own party read" policies on agreements/agreement_parties/
// agreement_amendments/agreement_releases/signature_requests/
// signature_signatories (migrations 0069/0070/0071) are the actual
// enforcement boundary — a client can structurally never see another
// client's agreement, another client's internal notes, a master DOCX,
// Admin-only data, or internal Finance data through this module,
// because Postgres itself refuses the row, not an application-layer
// filter this code could get wrong.

export type MyAgreementRequiredAction = "none" | "review_and_respond" | "sign" | "awaiting_counterparty";

export type MyAgreementSummary = {
  id: string;
  agreementReference: string;
  status: AgreementLifecycleStatus;
  requiredAction: MyAgreementRequiredAction;
  mySignatureStatus: string | null;
  fullyExecuted: boolean;
  executedCopyAvailable: boolean;
  amendmentCount: number;
  releaseSummary: { usageRightsGranted: string[]; aiSyntheticRightsGranted: string[] } | null;
};

function deriveRequiredAction(status: AgreementLifecycleStatus, mySignatureStatus: string | null): MyAgreementRequiredAction {
  if (status === "changes_requested") return "review_and_respond";
  if (mySignatureStatus === "pending" || mySignatureStatus === "viewed") return "sign";
  if (isIssuedAgreementStatus(status) && !isFullyExecuted(status) && mySignatureStatus !== "signed") return "awaiting_counterparty";
  return "none";
}

// Every agreement the signed-in user is a party to — never another
// client's. Real DB rows only; returns an empty array (rendered as a
// truthful empty state by the page) rather than any fixture data.
export async function listMyAgreements(userId: string): Promise<MyAgreementSummary[]> {
  const supabase = await createClient();

  const { data: agreements, error } = await supabase
    .from("agreements")
    .select("id, agreement_reference, status, agreement_parties(id, profile_id), agreement_amendments(id), agreement_releases(usage_rights, ai_synthetic_rights)")
    .order("created_at", { ascending: false });
  if (error || !agreements) {
    console.error("[legal] failed to load client portal agreements", error?.message);
    return [];
  }

  const results: MyAgreementSummary[] = [];
  for (const agreement of agreements) {
    const myParty = (agreement.agreement_parties as unknown as { id: string; profile_id: string | null }[]).find((p) => p.profile_id === userId);
    if (!myParty) continue; // RLS already scopes this, but this guards the case of a multi-party agreement where another row is visible via the same policy join.

    const { data: mySignatory } = await supabase
      .from("signature_signatories")
      .select("status")
      .eq("agreement_party_id", myParty.id)
      .maybeSingle();

    const status = agreement.status as AgreementLifecycleStatus;
    const release = (agreement.agreement_releases as unknown as { usage_rights: Record<string, boolean>; ai_synthetic_rights: Record<string, boolean> }[] | null)?.[0] ?? null;

    results.push({
      id: agreement.id,
      agreementReference: agreement.agreement_reference,
      status,
      requiredAction: deriveRequiredAction(status, mySignatory?.status ?? null),
      mySignatureStatus: mySignatory?.status ?? null,
      fullyExecuted: isFullyExecuted(status),
      executedCopyAvailable: false, // No real issued-artifact rendering/storage exists yet — honestly false rather than a fabricated download link (separately-authorized wiring phase).
      amendmentCount: (agreement.agreement_amendments as unknown as { id: string }[] | null)?.length ?? 0,
      releaseSummary: release
        ? {
            usageRightsGranted: Object.entries(release.usage_rights).filter(([, v]) => v).map(([k]) => k),
            aiSyntheticRightsGranted: Object.entries(release.ai_synthetic_rights).filter(([, v]) => v).map(([k]) => k),
          }
        : null,
    });
  }
  return results;
}
