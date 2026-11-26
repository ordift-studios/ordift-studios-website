// WHAT THE INSTRUCTOR SEES ABOUT THEIR OWN ONBOARDING (R1). One pure builder, driven only by facts read from records - nothing is written per person and nothing is hardcoded for anyone.
// Each item says its state, who must act, what the next action is, whether it is needed NOW, and whether it blocks (a) completing administrative onboarding and (b) a workshop assignment.
// An outstanding ORDIFT STUDIOS action is never shown as the instructor's failure.

export type ItemState = "completed" | "awaiting_instructor" | "awaiting_ordift" | "not_yet_requested" | "under_review" | "future_workshop";
export const STATE_LABELS: Record<ItemState, string> = {
  completed: "Completed", awaiting_instructor: "Awaiting you", awaiting_ordift: "Awaiting ORDIFT STUDIOS", not_yet_requested: "Not yet requested", under_review: "Under review", future_workshop: "For a future workshop",
};
export type OnboardingItem = {
  key: string; label: string; state: ItemState; stateLabel: string; owner: "You" | "ORDIFT STUDIOS" | "Both"; detail: string; nextAction: string | null;
  actionNeededNow: boolean; blocksOnboarding: boolean; blocksAssignment: boolean; applicability: "now" | "future_workshop"; link: { href: string; label: string } | null;
};
export type InstructorOnboardingFacts = {
  onboarding: { stage: string; status: string } | null;
  representativeName: string | null;
  agreement: { reference: string | null; status: string | null; executed: boolean; effectiveDate: string | null; expiryDate: string | null; ongoing: boolean; copyAvailable: boolean };
  standards: { state: "not_available" | "pending" | "acknowledged"; versionLabel: string | null };
  payment: { profileExists: boolean; instructionCount: number; verifiedCount: number };
  identity: { applicable: boolean; done: boolean };
  schedules: { total: number; approved: number };
};
export type InstructorOnboardingView = { items: OnboardingItem[]; representativeName: string | null; stageLabel: string | null; counts: { completed: number; awaitingYou: number; awaitingOrdift: number; later: number } };

const SIGNING = ["sent", "viewed", "accepted_for_signature", "partially_signed", "changes_requested"];
const day = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null);
const STAGES: Record<string, string> = { proposed: "Proposed", approved: "Approved", invited: "Invited", profile: "Profile", payment_setup: "Payment Setup", engagement_assigned: "Engagement Assigned", active: "Onboarding Complete" };

export function buildInstructorOnboardingView(f: InstructorOnboardingFacts): InstructorOnboardingView {
  const item = (i: Omit<OnboardingItem, "stateLabel"> & { stateLabel?: string }): OnboardingItem => ({ ...i, stateLabel: i.stateLabel ?? STATE_LABELS[i.state] });
  const items: OnboardingItem[] = [];

  // 1. Agreement
  const ag = f.agreement;
  if (ag.executed) {
    const term = [day(ag.effectiveDate) ? `Effective ${day(ag.effectiveDate)}` : null, ag.ongoing ? "no fixed expiry" : day(ag.expiryDate) ? `expires ${day(ag.expiryDate)}` : null].filter(Boolean).join(", ");
    items.push(item({ key: "agreement", label: "Instructor / Workshop Facilitator Agreement", state: "completed", stateLabel: "Executed", owner: "ORDIFT STUDIOS", detail: `Signed by both parties${term ? `. ${term}.` : "."} Signing the agreement does not by itself start any workshop work.`,
      nextAction: null, actionNeededNow: false, blocksOnboarding: true, blocksAssignment: true, applicability: "now", link: null }));
  } else if (ag.status && SIGNING.includes(ag.status)) {
    items.push(item({ key: "agreement", label: "Instructor / Workshop Facilitator Agreement", state: "awaiting_instructor", owner: "You", detail: "Your agreement has been issued for signature.", nextAction: "Use the secure signing link emailed to you to review and sign it.", actionNeededNow: true, blocksOnboarding: true, blocksAssignment: true, applicability: "now", link: null }));
  } else {
    items.push(item({ key: "agreement", label: "Instructor / Workshop Facilitator Agreement", state: "awaiting_ordift", owner: "ORDIFT STUDIOS", detail: "ORDIFT STUDIOS is preparing your agreement.", nextAction: "Nothing is needed from you yet.", actionNeededNow: false, blocksOnboarding: true, blocksAssignment: true, applicability: "now", link: null }));
  }

  // 2. Instructor standards (mandatory before the first workshop assignment; not required immediately)
  if (f.standards.state === "acknowledged") {
    items.push(item({ key: "standards", label: `Independent Instructor Standards${f.standards.versionLabel ? ` — Version ${f.standards.versionLabel}` : ""}`, state: "completed", stateLabel: "Acknowledged", owner: "You", detail: `You acknowledged version ${f.standards.versionLabel ?? ""}.`.replace(" .", "."), nextAction: null, actionNeededNow: false, blocksOnboarding: false, blocksAssignment: true, applicability: "now", link: { href: "/portal/instructor/standards", label: "View your acknowledgment" } }));
  } else if (f.standards.state === "pending") {
    items.push(item({ key: "standards", label: `Independent Instructor Standards${f.standards.versionLabel ? ` — Version ${f.standards.versionLabel}` : ""}`, state: "awaiting_instructor", stateLabel: "Action required", owner: "You", detail: "Please read the standards in full and acknowledge them. It takes a few minutes and does not affect your signed agreement.",
      nextAction: "Read the standards, type your full name, tick the confirmation and submit.", actionNeededNow: true, blocksOnboarding: false, blocksAssignment: true, applicability: "now", link: { href: "/portal/instructor/standards", label: "Review & acknowledge standards" } }));
  } else {
    items.push(item({ key: "standards", label: "Independent Instructor Standards", state: "awaiting_ordift", owner: "ORDIFT STUDIOS", detail: "The standards are not available for acknowledgement yet.", nextAction: "ORDIFT STUDIOS will notify you when they are ready.", actionNeededNow: false, blocksOnboarding: false, blocksAssignment: true, applicability: "now", link: null }));
  }

  // 3. Payment destination
  const pay = f.payment;
  if (pay.instructionCount > 0 && pay.verifiedCount > 0) {
    items.push(item({ key: "payment", label: "Payment destination", state: "completed", owner: "ORDIFT STUDIOS", detail: "Your payment destination has been submitted and verified. Each payment is still approved separately.", nextAction: null, actionNeededNow: false, blocksOnboarding: true, blocksAssignment: false, applicability: "now", link: { href: "/portal/payment-details", label: "View payment details" } }));
  } else if (pay.instructionCount > 0) {
    items.push(item({ key: "payment", label: "Payment destination", state: "under_review", owner: "ORDIFT STUDIOS", detail: "Your payment destination has been submitted and is being reviewed by ORDIFT STUDIOS.", nextAction: "Nothing is needed from you unless we contact you.", actionNeededNow: false, blocksOnboarding: true, blocksAssignment: false, applicability: "now", link: { href: "/portal/payment-details", label: "View payment details" } }));
  } else if (pay.profileExists) {
    items.push(item({ key: "payment", label: "Payment destination", state: "awaiting_instructor", owner: "You", detail: "ORDIFT STUDIOS is ready to receive your payment details.", nextAction: "Add your payment destination securely in Payment Details. Never send bank details by email.", actionNeededNow: true, blocksOnboarding: true, blocksAssignment: false, applicability: "now", link: { href: "/portal/payment-details", label: "Add payment details" } }));
  } else {
    items.push(item({ key: "payment", label: "Payment destination", state: "not_yet_requested", owner: "ORDIFT STUDIOS", detail: "Not yet requested — ORDIFT STUDIOS will notify you when payment details are required.", nextAction: null, actionNeededNow: false, blocksOnboarding: true, blocksAssignment: false, applicability: "now", link: null }));
  }

  // 4. Identity document check (only where the record has it)
  if (f.identity.applicable) {
    items.push(item({ key: "identity", label: "Identity document check (optional)", state: f.identity.done ? "completed" : "awaiting_ordift", owner: "ORDIFT STUDIOS", detail: f.identity.done ? "ORDIFT STUDIOS has sighted and verified your identity document." : "ORDIFT STUDIOS may ask to verify an identity document.", nextAction: null, actionNeededNow: false, blocksOnboarding: false, blocksAssignment: false, applicability: "now", link: null }));
  }

  // 5. The workshop itself (per workshop, jointly)
  items.push(item({ key: "programme", label: "Workshop programme, schedule and rights", state: f.schedules.approved > 0 ? "completed" : "future_workshop", stateLabel: f.schedules.approved > 0 ? undefined : "Upcoming", owner: "Both", detail: f.schedules.approved > 0 ? "A workshop assignment has been approved." : "For each workshop, ORDIFT STUDIOS and you agree the topic, dates, venue, fees, recording and rights arrangements together, and any required regulatory clearance is confirmed. Nothing is required from you yet.", nextAction: null, actionNeededNow: false, blocksOnboarding: false, blocksAssignment: true, applicability: "future_workshop", link: null }));

  // 6. Final administrative approval
  const done = f.onboarding?.status === "completed" || f.onboarding?.stage === "active";
  items.push(item({ key: "completion", label: "Onboarding completion", state: done ? "completed" : "awaiting_ordift", owner: "ORDIFT STUDIOS", detail: done ? "Your onboarding is complete." : "ORDIFT STUDIOS completes your onboarding once the required items above are done.", nextAction: null, actionNeededNow: false, blocksOnboarding: false, blocksAssignment: false, applicability: "now", link: null }));

  const count = (p: (i: OnboardingItem) => boolean) => items.filter(p).length;
  return { items, representativeName: f.representativeName, stageLabel: f.onboarding ? STAGES[f.onboarding.stage] ?? f.onboarding.stage : null,
    counts: { completed: count((i) => i.state === "completed"), awaitingYou: count((i) => i.state === "awaiting_instructor"), awaitingOrdift: count((i) => i.state === "awaiting_ordift" || i.state === "not_yet_requested" || i.state === "under_review"), later: count((i) => i.state === "future_workshop") } };
}
