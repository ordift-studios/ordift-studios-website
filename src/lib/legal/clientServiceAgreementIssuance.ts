// CLIENT SERVICES AGREEMENT - issuance gate. ISSUANCE IS DISABLED IN THIS BUILD.
//
// Nothing here creates an agreement row, a signature request, an email or a document. `assessClientAgreementIssuance` is a pure, read-only statement of WHAT STILL BLOCKS issuance;
// `issueClientServiceAgreement` always refuses, even if every blocker were cleared, because the sending step is deliberately not built until the master is approved by counsel,
// the Founder authorises the release, and the canonical document code is allocated. Issuing will remain a separate, explicit, Super Admin action behind its own flag.
export const CLIENT_AGREEMENT_ISSUANCE_FLAG = "CLIENT_SERVICE_AGREEMENT_ISSUANCE_ENABLED";
export const clientAgreementIssuanceFlagOn = (env: Record<string, string | undefined> = process.env) => env[CLIENT_AGREEMENT_ISSUANCE_FLAG] === "true";      // default OFF

export type IssuanceFacts = {
  flagOn: boolean; actorIsSuperAdmin: boolean; quotationAccepted: boolean; bookingConfirmed: boolean; entityEligible: boolean; canonicalCodeAllocated: boolean;
  master: { status: string; counselApprovalRecorded: boolean; activated: boolean; counselSlotsRemaining: number } | null; compositionOk: boolean;
};
export function assessClientAgreementIssuance(f: IssuanceFacts): string[] {
  const out: string[] = [];
  if (!f.flagOn) out.push("Client agreement issuance is not switched on.");
  if (!f.actorIsSuperAdmin) out.push("Only a Super Admin can issue a client agreement.");
  if (!f.canonicalCodeAllocated) out.push("The document code for the Client Services Agreement has not been allocated by management.");
  if (!f.master) out.push("The Client Services Agreement master is not registered.");
  else {
    if (f.master.counselSlotsRemaining > 0) out.push(`The master still has ${f.master.counselSlotsRemaining} clause(s) awaiting counsel's wording.`);
    if (!f.master.counselApprovalRecorded) out.push("Counsel's written approval of the master is not recorded.");
    if (f.master.status !== "active" || !f.master.activated) out.push("The master is not active.");
  }
  if (!f.quotationAccepted) out.push("The client must accept an issued ordinary quotation first.");
  if (!f.entityEligible) out.push("The contracting entity is not eligible for the quoted activities (an agreement cannot override an unlicensed activity).");
  if (!f.bookingConfirmed) out.push("The booking must be confirmed so the schedule can be stated.");
  if (!f.compositionOk) out.push("The document cannot be composed from the recorded particulars.");
  return out;
}
export async function issueClientServiceAgreement(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: "Client agreement issuance is disabled in this build. The master is a draft awaiting counsel's approval." };
}
