// Five SEPARATE questions about a contributor, answered only from facts already recorded. They are deliberately not merged into one
// "progress" number: completing one never implies another, and nothing here is invented or marked complete on anyone's behalf.
//   1. Profile onboarding              - has the contributor finished their own onboarding steps?
//   2. Readiness for assignments       - has Ordift confirmed the person as generally ready? (a human decision, never automatic)
//   3. A specific engagement           - is there an actual workshop / assignment / engagement for them?
//   4. Agreement execution             - is a genuine, fully executed agreement on record?
//   5. Payment eligibility             - are payout details on file? (payout authorisation is still decided per payment)

export type LayerState = "done" | "in_progress" | "not_started" | "on_hold" | "not_applicable";
export type Layer = { key: "profile" | "readiness" | "engagement" | "agreement" | "payment"; title: string; state: LayerState; summary: string };

export type LayerFacts = {
  onboarding: { stage: string; status: string } | null;
  requirements: { requirementType: string; label: string; required: boolean; status: string }[];
  engagementCount: number; // workshop instructor engagements + crew/other assignments for this person
  hasPayeeProfile: boolean;
  // true while the controlled legal text for the agreement this person needs is not confirmed (the OS-LGL-010 hold)
  agreementOnHold?: boolean;
};

const SATISFIED = new Set(["satisfied", "waived", "not_applicable"]);
const stageLabel = (s: string) => s.replace(/_/g, " ");

export function contributorStatusLayers(f: LayerFacts): Layer[] {
  const required = f.requirements.filter((r) => r.required);
  const openRequired = required.filter((r) => !SATISFIED.has(r.status));
  const onboardingDone = f.onboarding?.status === "completed";

  const profile: Layer = !f.onboarding
    ? { key: "profile", title: "Your profile onboarding", state: "not_started", summary: "Ordift hasn't started your onboarding yet." }
    : onboardingDone
      ? { key: "profile", title: "Your profile onboarding", state: "done", summary: "Your onboarding is complete." }
      : { key: "profile", title: "Your profile onboarding", state: "in_progress", summary: `In progress — you are at the “${stageLabel(f.onboarding.stage)}” step.${openRequired.length ? ` ${openRequired.length} required item${openRequired.length === 1 ? "" : "s"} still open.` : ""}` };

  const readiness: Layer = onboardingDone
    ? { key: "readiness", title: "Readiness for assignments", state: "in_progress", summary: "Your onboarding is complete. Ordift confirms when you are ready to be assigned — this is a separate decision." }
    : { key: "readiness", title: "Readiness for assignments", state: "not_started", summary: "Not yet. Ordift confirms this after your onboarding is complete." };

  const engagement: Layer = f.engagementCount > 0
    ? { key: "engagement", title: "A specific engagement", state: "in_progress", summary: `${f.engagementCount} engagement${f.engagementCount === 1 ? "" : "s"} recorded for you.` }
    : { key: "engagement", title: "A specific engagement", state: "not_started", summary: "No workshop or assignment has been set up for you yet." };

  const agreements = f.requirements.filter((r) => r.requirementType === "agreement" || r.requirementType === "digital_signature");
  const executed = agreements.length > 0 && agreements.every((r) => SATISFIED.has(r.status));
  const agreement: Layer = f.agreementOnHold
    ? { key: "agreement", title: "Your agreement", state: "on_hold", summary: "Not issued yet. Ordift is confirming the final agreement wording before it can be sent to you for signature." }
    : agreements.length === 0
      ? { key: "agreement", title: "Your agreement", state: "not_applicable", summary: "No agreement is required at this step." }
      : executed
        ? { key: "agreement", title: "Your agreement", state: "done", summary: "A signed agreement is on record." }
        : { key: "agreement", title: "Your agreement", state: "not_started", summary: "No signed agreement is on record yet." };

  const payment: Layer = f.hasPayeeProfile
    ? { key: "payment", title: "Getting paid", state: "in_progress", summary: "Payout details are on file. Each payment is still approved separately when work is done." }
    : { key: "payment", title: "Getting paid", state: "not_started", summary: "No payout details on file yet. They are needed before any payment can be made." };

  return [profile, readiness, engagement, agreement, payment];
}
