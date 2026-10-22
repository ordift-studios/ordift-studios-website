// OS-LGL-010 Schedule A (Instructor profile and master terms) - the agreement-specific terms that have NO verified source in the platform and
// therefore must be stated by an authorised administrator before the agreement can be previewed or issued. Nothing here is defaulted or
// invented: a required term that is missing blocks issuance, and an optional one is shown as "Not stated". Choice values mirror the master's own
// bracketed options. The Session Schedules (Schedules B-E) are NOT part of this issuance: each assignment needs its own.

export const INDEPENDENT_STATUS_ROUTES = ["CONTRACTOR", "BUSINESS", "OTHER"] as const;
export const REGULATORY_APPROVAL_STATUSES = ["N/A", "REQUIRED", "PENDING", "CONFIRMED"] as const;
export const PROFESSIONAL_ROLES = ["INSTRUCTOR", "FACILITATOR", "SPEAKER", "PANELIST", "OTHER"] as const;

export type ScheduleATerms = {
  professionalRole: string;
  businessName: string;
  nationalityWorkAuthorization: string;
  addressCountry: string;
  contactPhone: string;
  primaryExpertise: string;
  qualifications: string;
  independentStatusRoute: string;
  masterTerm: string;
  masterTerminationNotice: string;
  regulatoryApprovalStatus: string;
  specialTerms: string;
  agreementEffectiveDate: string; // this agreement's OWN effective date - never the template's
};

export const SCHEDULE_A_FIELDS: readonly { key: keyof ScheduleATerms; label: string; required: boolean; hint: string }[] = [
  { key: "professionalRole", label: "Professional role", required: true, hint: "One of the master's options." },
  { key: "businessName", label: "Business / trading name", required: false, hint: "Leave blank if none." },
  { key: "nationalityWorkAuthorization", label: "Nationality / work authorization", required: false, hint: "Only where lawfully required (the master says so)." },
  { key: "addressCountry", label: "Address / country", required: true, hint: "The instructor's address and country." },
  { key: "contactPhone", label: "Contact phone", required: false, hint: "The email on the account is added automatically." },
  { key: "primaryExpertise", label: "Primary expertise", required: true, hint: "What the instructor will teach." },
  { key: "qualifications", label: "Qualifications / credentials", required: false, hint: "As relevant." },
  { key: "independentStatusRoute", label: "Independent status route", required: true, hint: "CONTRACTOR, BUSINESS or OTHER." },
  { key: "masterTerm", label: "Master term", required: true, hint: "ONGOING or a date range." },
  { key: "masterTerminationNotice", label: "Master termination notice", required: true, hint: "The notice period or terms." },
  { key: "regulatoryApprovalStatus", label: "Regulatory approval status", required: true, hint: "N/A, REQUIRED, PENDING or CONFIRMED." },
  { key: "specialTerms", label: "Special terms", required: true, hint: "State the terms, or enter NONE." },
  { key: "agreementEffectiveDate", label: "This agreement's effective date", required: true, hint: "Today or later. Independent of the template's dates." },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function validateScheduleATerms(t: Partial<ScheduleATerms>, today: string): { ok: true; terms: ScheduleATerms } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const v = (k: keyof ScheduleATerms) => (t[k] ?? "").trim();
  for (const f of SCHEDULE_A_FIELDS) if (f.required && !v(f.key)) errors.push(`${f.label} is required.`);
  if (v("professionalRole") && !(PROFESSIONAL_ROLES as readonly string[]).includes(v("professionalRole"))) errors.push("Professional role must be one of the master's options.");
  if (v("independentStatusRoute") && !(INDEPENDENT_STATUS_ROUTES as readonly string[]).includes(v("independentStatusRoute"))) errors.push("Independent status route must be CONTRACTOR, BUSINESS or OTHER.");
  if (v("regulatoryApprovalStatus") && !(REGULATORY_APPROVAL_STATUSES as readonly string[]).includes(v("regulatoryApprovalStatus"))) errors.push("Regulatory approval status must be N/A, REQUIRED, PENDING or CONFIRMED.");
  if (v("agreementEffectiveDate")) {
    if (!ISO.test(v("agreementEffectiveDate")) || Number.isNaN(Date.parse(v("agreementEffectiveDate")))) errors.push("Enter this agreement's effective date as YYYY-MM-DD.");
    else if (v("agreementEffectiveDate") < today) errors.push("This agreement's effective date cannot be in the past; it is not back-dated.");
  }
  if (errors.length) return { ok: false, errors };
  const terms = Object.fromEntries(SCHEDULE_A_FIELDS.map((f) => [f.key, v(f.key)])) as ScheduleATerms;
  return { ok: true, terms };
}

export function missingScheduleATerms(t: Partial<ScheduleATerms> | null | undefined): string[] {
  return SCHEDULE_A_FIELDS.filter((f) => f.required && !(t?.[f.key] ?? "").trim()).map((f) => f.label);
}
