// Repeatable legal-approval policy (Founder directive, 2026-10-22). Pure rules; the server actions in masterRegistryActions.ts apply them.
//
//  - An approved master's approval date should ordinarily BECOME its effective date, and it is then eligible for activation once every
//    legal and document-control condition is met.
//  - A future approval captures its timestamp automatically (the registry's approve transition stamps approved_at). A version that
//    is recorded as approved WITHOUT a stamp, or a verified attestation, is a recorded gap and can never be activated until closed.
//  - Template dates (approval, effective, activation) are never used as an individual agreement's dates.

export type ActivationFacts = {
  status: string;
  approvalDate: string | null; // registry stamp or verified attestation
  contentRegistered: boolean;
  unresolvedMarkers: number | null; // null = the stored master has not been scanned yet
  effectiveDate: string; // proposed
  today: string; // YYYY-MM-DD
  backdatedReason: string | null;
};

export function proposedEffectiveDate(approvalDate: string): string {
  return approvalDate;
}

export function approvalRecordGap(v: { status: string; approvedAt: string | null }, attestation: { approvalDate: string } | null): boolean {
  return ["approved", "active"].includes(v.status) && !v.approvedAt && !attestation;
}

export function checkActivationPreconditions(f: ActivationFacts): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (f.status !== "approved") errors.push(`Only an approved version can be activated (this one is “${f.status}”).`);
  if (!f.approvalDate) errors.push("The historical approval date has not been verified.");
  if (!f.contentRegistered) errors.push("The stored master has not been registered under a controlled content reference.");
  if (f.unresolvedMarkers === null) errors.push("The stored master has not been checked for unresolved counsel-review clauses.");
  else if (f.unresolvedMarkers > 0) errors.push(`The stored master still contains ${f.unresolvedMarkers} unresolved counsel-review marker(s).`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.effectiveDate)) errors.push("Enter the effective date as YYYY-MM-DD.");
  else {
    if (f.approvalDate && f.effectiveDate < f.approvalDate) errors.push("The effective date cannot be earlier than the verified approval date.");
    if (f.effectiveDate < f.today && (f.backdatedReason ?? "").trim().length < 10)
      errors.push("An effective date in the past must be confirmed with the reason (at least a short sentence). The activation timestamp itself is always the real time of activation.");
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}
