import type { AgreementReadiness, Guide } from "@/lib/legal/agreementReadiness";

// One guided roadmap for an external contributor's onboarding, built from facts the platform already records. HR, Legal and Finance stay
// the systems of record; this only EXPLAINS the journey and points at the real next action. It never advances a stage, issues anything,
// sends anything or marks anything complete. State is derived from stored records on every load, so returning to the same onboarding
// (a stable URL) always shows the true position.

export type Actor = "Founder" | "Ordift staff" | "Contributor" | "Legal" | "Finance" | "System";
export type ItemState = "completed" | "pending" | "blocked" | "not_applicable";
export type StageState = "done" | "current" | "upcoming";
export type StageItem = { key: string; label: string; state: ItemState; note: string | null };
export type RoadmapStage = { stage: string; title: string; state: StageState; actor: Actor; what: string; systemSupplies: string; items: StageItem[] };
export type NextAction = { title: string; explanation: string; actor: Actor; blockers: { label: string; detail: string; guide: Guide | null }[]; href: string | null; hrefLabel: string | null };

export type JourneyFacts = {
  pipeline: "employee" | "external_contractor";
  stages: readonly string[];
  stage: string;
  status: string;
  personName: string | null;
  isInstructor: boolean;
  requirements: { requirementKey: string; stage: string; requirementType: string; label: string; required: boolean; status: string }[];
  agreement: AgreementReadiness | null;
  // existing in-page actions the administrator can use right now (anchors into the existing onboarding workspace)
  anchors: { requirements: string; stage: string };
};

const DONE = new Set(["satisfied", "waived"]);

const STAGE_COPY: Record<string, Omit<RoadmapStage, "stage" | "state" | "items">> = {
  proposed: { title: "Proposed", actor: "Founder", what: "The Founder proposes the person and the role.", systemSupplies: "The requisition and role details." },
  approved: { title: "Approved", actor: "Founder", what: "The Founder approves the appointment.", systemSupplies: "The approved requisition, engagement type and member number." },
  invited: { title: "Invited", actor: "Ordift staff", what: "The person is invited to their workspace. No invitation is sent without separate authorization.", systemSupplies: "Their account, role and welcome workspace." },
  profile: { title: "Profile", actor: "Contributor", what: "The person completes their own profile. Ordift confirms the legal prerequisites for their agreement.", systemSupplies: "Name, email, member number, role, engagement type, jurisdiction and recorded entity are already known and are not asked for again." },
  payment_setup: { title: "Payment details", actor: "Finance", what: "The person adds payout details; Finance verifies them. Each payment is still approved separately.", systemSupplies: "The payee record and the verification checklist." },
  engagement_assigned: { title: "A specific engagement", actor: "Ordift staff", what: "Ordift assigns a particular workshop or job. This is a separate decision from general onboarding.", systemSupplies: "The workshop or assignment record." },
  active: { title: "Onboarding complete", actor: "Founder", what: "General onboarding is complete. Readiness for any particular assignment is still confirmed per engagement.", systemSupplies: "The completed onboarding record." },
};

function itemState(r: JourneyFacts["requirements"][number], agreement: AgreementReadiness | null): StageItem {
  if (r.status === "not_applicable") return { key: r.requirementKey, label: r.label, state: "not_applicable", note: null };
  if (DONE.has(r.status)) return { key: r.requirementKey, label: r.label, state: "completed", note: r.status === "waived" ? "Waived by an authorised person." : null };
  const isAgreement = r.requirementType === "agreement" || r.requirementType === "digital_signature";
  if (isAgreement && agreement && !agreement.canIssue) return { key: r.requirementKey, label: r.label, state: "blocked", note: `Cannot be issued yet — ${agreement.unresolved.length} legal prerequisite${agreement.unresolved.length === 1 ? "" : "s"} unresolved.` };
  return { key: r.requirementKey, label: r.label, state: "pending", note: null };
}

export function buildJourney(f: JourneyFacts): { roadmap: RoadmapStage[]; next: NextAction } {
  const at = f.stages.indexOf(f.stage);
  const roadmap: RoadmapStage[] = f.stages.map((s, i) => ({
    stage: s,
    state: i < at ? "done" : i === at ? "current" : "upcoming",
    ...(STAGE_COPY[s] ?? { title: s, actor: "Ordift staff" as Actor, what: "", systemSupplies: "" }),
    items: f.requirements.filter((r) => r.stage === s && r.required).map((r) => itemState(r, f.agreement)),
  }));

  const openHere = roadmap[at]?.items.filter((it) => it.state === "pending" || it.state === "blocked") ?? [];
  const blockedAgreement = f.requirements.find((r) => r.stage === f.stage && (r.requirementType === "agreement" || r.requirementType === "digital_signature") && !DONE.has(r.status) && r.status !== "not_applicable");

  let next: NextAction;
  if (f.status === "completed" || f.stage === "active") {
    next = { title: "Onboarding is complete", explanation: "Nothing more is needed for general onboarding. Assign a specific workshop or job separately when one is ready.", actor: "Founder", blockers: [], href: null, hrefLabel: null };
  } else if (blockedAgreement && f.agreement && !f.agreement.canIssue) {
    next = {
      title: `Resolve ${f.agreement.unresolved.length} legal prerequisite${f.agreement.unresolved.length === 1 ? "" : "s"} for ${f.agreement.code}`,
      explanation: `${f.personName ?? "This person"} cannot move past “${f.stage.replace(/_/g, " ")}” until their ${f.agreement.title} is genuinely executed, and it cannot be issued yet. Each item below says what is missing, why it matters, where the answer lives and who resolves it. Nothing has been sent to the person.`,
      actor: "Founder",
      blockers: f.agreement.unresolved.map((c) => ({ label: c.label, detail: c.detail, guide: c.guide })),
      href: null,
      hrefLabel: null,
    };
  } else if (blockedAgreement && f.agreement?.canIssue) {
    next = { title: `Prepare the ${f.agreement.code} agreement`, explanation: "The legal prerequisites are verified. The next step is to prepare the agreement from the verified profile and entity details, review it, and issue it for signature — each separately authorised. The preparation step for this agreement type is not built yet.", actor: "Ordift staff", blockers: [], href: null, hrefLabel: null };
  } else if (openHere.length > 0) {
    next = { title: openHere[0].label, explanation: `This is the next open required item at “${f.stage.replace(/_/g, " ")}”. Update it in “Current-Stage Requirements” below.`, actor: f.stage === "payment_setup" ? "Finance" : "Ordift staff", blockers: [], href: f.anchors.requirements, hrefLabel: "Go to the requirements" };
  } else {
    next = { title: "Advance to the next step", explanation: "Everything required here is complete. Use “Pipeline & Stage” below to advance — the system re-checks the requirements before it moves.", actor: "Ordift staff", blockers: [], href: f.anchors.stage, hrefLabel: "Go to Pipeline & Stage" };
  }
  return { roadmap, next };
}
