import type { ActivityState, EntityAssessment, EntityFacts } from "./jurisdictionRequirements";

// Entity activity register — what the screen shows, built from the SAME facts and the SAME assessment the quotation check uses, so this page can never disagree with it.
// Pure and import-light. Two things are kept apart on purpose:
//   * the INTERNAL RECORD (entity_activities): what Ordift has recorded about an activity, who recorded it, and which evidence it relies on. Entering one is a record-keeping act.
//     It is never a grant: an administrator cannot license an activity by typing it, because 'licensed' is refused unless it points to verified, in-date evidence.
//   * the REGULATORY EVIDENCE (entity_registrations: the Commercial Registration, the Commercial Permit, an activity licence): what the authority issued, and whether it has been verified.
// "Listed on the registration" is a third, derived fact: the verified Commercial Registration prints an activity code that stands for this activity. It needs no record at all.

export type EvidenceState = "usable" | "unverified" | "expired" | "not_active";

// Only these documents can license an activity. An Establishment Card, a tax card or Articles of Association are real, verified records, but none of them licenses an activity.
export const LICENSING_KINDS = ["commercial_registration", "commercial_permit", "activity_licence"] as const;
export const canLicenseActivity = (kind: string): boolean => (LICENSING_KINDS as readonly string[]).includes(kind);

export type EvidenceOption = {
  id: string;
  kind: string;
  label: string;
  identifier: string | null;
  expiresOn: string | null;
  state: EvidenceState;
  // For a Commercial Registration or Permit: the activity keys its printed codes stand for. null = this kind of evidence does not list activities.
  listsActivities: string[] | null;
};

export type RegisterRecord = {
  status: "planned" | "licensed" | "suspended" | "withdrawn";
  note: string | null;
  recordedByLabel: string | null; // the member number: the platform's authoritative actor label, never a name
  updatedAt: string | null;
  evidence: EvidenceOption | null;
};

export type RegisterRow = {
  key: string;
  label: string;
  printedCode: string | null; // the jurisdiction's registered activity code that stands for this activity (e.g. 742010), if any
  effective: ActivityState["state"] | "not_judged";
  effectiveText: string;
  record: RegisterRecord | null;
  warnings: string[];
};

const EFFECTIVE_TEXT: Record<RegisterRow["effective"], string> = {
  licensed: "Licensed: recorded with verified, in-date evidence.",
  listed_on_registration: "Listed on the verified Commercial Registration. No separate record is needed for this to count.",
  planned: "Planned only: an intention, never treated as licensed.",
  suspended: "Suspended: cannot be quoted.",
  not_licensed: "Not licensed or listed: cannot be quoted for this entity.",
  not_judged: "This entity's jurisdiction does not require licensed activities, so this is not judged here.",
};

export function evidenceStateOf(r: { status: string; verifiedAt: string | null; expiresOn: string | null }, today: string): EvidenceState {
  if (r.status !== "active") return "not_active";
  if (!r.verifiedAt) return "unverified";
  if (r.expiresOn && r.expiresOn < today) return "expired";
  return "usable";
}

const LISTING_KINDS = new Set(["commercial_registration", "commercial_permit"]);

export function evidenceOptions(facts: EntityFacts, today: string, registrationLabel: (kind: string) => string): EvidenceOption[] {
  const codes = facts.activityCodes ?? [];
  return facts.registrations.map((r) => {
    const printed = (r.facts as { activities?: unknown }).activities;
    const printedCodes = Array.isArray(printed) ? printed.map((a) => (a as { code?: unknown })?.code).filter((c): c is string => typeof c === "string") : [];
    return {
      id: r.id,
      kind: r.kind,
      label: registrationLabel(r.kind),
      identifier: r.identifier,
      expiresOn: r.expiresOn,
      state: evidenceStateOf(r, today),
      listsActivities: LISTING_KINDS.has(r.kind) ? [...new Set(codes.filter((m) => printedCodes.includes(m.code)).map((m) => m.activityKey))] : null,
    };
  });
}

export type RecordRow = { activityKey: string; status: RegisterRecord["status"]; evidenceRegistrationId: string | null; note: string | null; recordedByLabel: string | null; updatedAt: string | null };

export function buildActivityRegister(args: { facts: EntityFacts; assessment: EntityAssessment; records: RecordRow[]; types: { key: string; label: string }[]; today: string; registrationLabel: (kind: string) => string }): { rows: RegisterRow[]; evidence: EvidenceOption[] } {
  const evidence = evidenceOptions(args.facts, args.today, args.registrationLabel);
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const judged = new Map(args.assessment.activities.map((a) => [a.key, a.state]));
  const codes = args.facts.activityCodes ?? [];
  const rows = args.types.map((t): RegisterRow => {
    const rec = args.records.find((r) => r.activityKey === t.key) ?? null;
    const ev = rec?.evidenceRegistrationId ? byId.get(rec.evidenceRegistrationId) ?? null : null;
    const warnings: string[] = [];
    if (rec?.status === "licensed") {
      if (!ev) warnings.push("The evidence this record relies on is no longer on file for this entity.");
      else if (ev.state === "unverified") warnings.push(`${ev.label} has not been verified, so this does not count as licensed.`);
      else if (ev.state === "expired") warnings.push(`${ev.label} expired on ${ev.expiresOn}, so this no longer counts as licensed.`);
      else if (ev.state === "not_active") warnings.push(`${ev.label} is no longer the active record, so this no longer counts as licensed.`);
      if (ev?.listsActivities && !ev.listsActivities.includes(t.key)) warnings.push(`${ev.label} does not list this activity.`);
    }
    const effective = judged.get(t.key) ?? "not_judged";
    return {
      key: t.key,
      label: t.label,
      printedCode: codes.find((c) => c.activityKey === t.key)?.code ?? null,
      effective,
      effectiveText: EFFECTIVE_TEXT[effective],
      record: rec ? { status: rec.status, note: rec.note, recordedByLabel: rec.recordedByLabel, updatedAt: rec.updatedAt, evidence: ev } : null,
      warnings,
    };
  });
  return { rows, evidence };
}

// What recording an activity may rely on. Used by the recording path (the database guard is still the final authority).
export function checkActivityEvidence(args: { activityKey: string; evidence: EvidenceOption | undefined }): { ok: true } | { ok: false; error: string } {
  const ev = args.evidence;
  if (!ev) return { ok: false, error: "Choose the registration or licence that covers this activity. It must belong to this entity." };
  if (ev.state === "not_active") return { ok: false, error: `${ev.label} is not the active record. Use the current one.` };
  // checked after the state tests so an unverified or expired document is reported as that first
  const kindError = canLicenseActivity(ev.kind) ? null : `${ev.label} is not a licensing document. Choose the Commercial Registration, the Commercial Permit or an activity licence.`;
  if (ev.state === "unverified") return { ok: false, error: `${ev.label} has not been verified yet. An activity is recorded as licensed only against verified evidence.` };
  if (ev.state === "expired") return { ok: false, error: `${ev.label} expired on ${ev.expiresOn}. Record the renewed document first.` };
  if (kindError) return { ok: false, error: kindError };
  if (ev.listsActivities && !ev.listsActivities.includes(args.activityKey)) return { ok: false, error: `${ev.label} does not list this activity, so it cannot be the evidence for it.` };
  return { ok: true };
}
