// Multi-jurisdiction legal representation - PURE RULES (no storage). The database tables that would hold firms, representatives, appointments
// and review decisions are NOT created yet (they need a migration, prepared in supabase/proposals/PROPOSED_legal_representation.sql and not
// applied), so the feature is OFF and nothing in the product depends on it.
//
// Principles encoded here:
//  - Administrative authority (Founder / Super Admin), documented company signing authority (entity signatories) and independent legal review
//    (this module) are three different things and are never derived from one another.
//  - A review is attached to the firm, the individual reviewer, the jurisdiction, the document version, the decision, the date and the evidence
//    AT THE TIME. Changing the appointed firm later never rewrites a past review and never invalidates a signed agreement.
//  - An interim arrangement (for example the Ghana firm advising on Qatar documents) must be expressly authorised, and its advice is always
//    PROVISIONAL: it is never treated as verified Qatar-law compliance or final Qatar approval.

export const LEGAL_REPRESENTATION_ENABLED = false;

export type Appointment = {
  id: string;
  firmId: string;
  firmName: string;
  jurisdiction: string; // jurisdiction the firm is appointed FOR
  categories: string[]; // document categories it may review; "*" = all
  status: "active" | "ended";
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null;
  evidenceReference: string | null;
  // interim arrangement: this firm is expressly authorised to advise on ANOTHER jurisdiction's documents
  interimFor: { jurisdiction: string; expressAuthorisationReference: string } | null;
};

export type Routing =
  | { kind: "appointed"; firmId: string; firmName: string; provisional: false }
  | { kind: "interim"; firmId: string; firmName: string; provisional: true; note: string }
  | { kind: "none"; reason: string };

const covers = (a: Appointment, category: string) => a.categories.includes("*") || a.categories.includes(category);
const inForce = (a: Appointment, on: string) => a.status === "active" && a.effectiveFrom <= on && (!a.effectiveTo || a.effectiveTo >= on);

// Who reviews a NEW document in this jurisdiction and category on this date? A firm formally appointed for the jurisdiction always wins over
// an interim arrangement. Nothing is routed to a firm that has no appointment covering that jurisdiction (or an express interim authorisation).
export function routeLegalReview(appointments: readonly Appointment[], jurisdiction: string, category: string, on: string): Routing {
  const direct = appointments.find((a) => inForce(a, on) && a.jurisdiction === jurisdiction && covers(a, category));
  if (direct) return { kind: "appointed", firmId: direct.firmId, firmName: direct.firmName, provisional: false };
  const interim = appointments.find((a) => inForce(a, on) && a.interimFor?.jurisdiction === jurisdiction && a.interimFor.expressAuthorisationReference.trim().length >= 10 && covers(a, category));
  if (interim) return { kind: "interim", firmId: interim.firmId, firmName: interim.firmName, provisional: true, note: `Advice from ${interim.firmName} (appointed for ${interim.jurisdiction}) is provisional for ${jurisdiction}: it is not verified ${jurisdiction}-law compliance or final ${jurisdiction} approval.` };
  return { kind: "none", reason: `No legal firm is appointed for ${jurisdiction} (${category}) on ${on}.` };
}

export type ReviewRecord = {
  documentCode: string; versionId: string; firmId: string; reviewerName: string; jurisdiction: string; // jurisdiction the document is FOR
  adviceBasisJurisdiction: string; // jurisdiction the firm is appointed for
  provisional: boolean; decision: "approved" | "changes_required" | "declined"; reviewedOn: string; evidenceReference: string | null;
};

// A provisional review leaves the document needing a review from a firm appointed for its own jurisdiction.
export function awaitingJurisdictionSpecificReview(reviews: readonly ReviewRecord[], jurisdiction: string): { documentCode: string; versionId: string; provisionalBy: string }[] {
  const finalByVersion = new Set(reviews.filter((r) => r.jurisdiction === jurisdiction && !r.provisional && r.adviceBasisJurisdiction === jurisdiction && r.decision === "approved").map((r) => `${r.documentCode}|${r.versionId}`));
  const out = new Map<string, { documentCode: string; versionId: string; provisionalBy: string }>();
  for (const r of reviews) {
    const key = `${r.documentCode}|${r.versionId}`;
    if (r.jurisdiction === jurisdiction && r.provisional && !finalByVersion.has(key)) out.set(key, { documentCode: r.documentCode, versionId: r.versionId, provisionalBy: r.reviewerName });
  }
  return [...out.values()];
}

// Replacing the appointed firm is an append: the old appointment is ended (never deleted or edited) and a new one starts. Past reviews keep
// the firm that made them; existing agreements are untouched.
export function replaceAppointment(appointments: readonly Appointment[], current: { id: string; endedOn: string; reason: string }, next: Appointment): { ok: true; appointments: Appointment[] } | { ok: false; error: string } {
  const old = appointments.find((a) => a.id === current.id);
  if (!old || old.status !== "active") return { ok: false, error: "The appointment being replaced is not active." };
  if (current.reason.trim().length < 10) return { ok: false, error: "A reason is required to end an appointment." };
  if (next.effectiveFrom < current.endedOn) return { ok: false, error: "The new appointment cannot start before the old one ends." };
  if (next.jurisdiction !== old.jurisdiction) return { ok: false, error: "A replacement must be for the same jurisdiction." };
  return { ok: true, appointments: [...appointments.map((a) => (a.id === old.id ? { ...a, status: "ended" as const, effectiveTo: current.endedOn } : a)), next] };
}
