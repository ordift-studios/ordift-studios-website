import type { AgreementReadiness } from "@/lib/legal/agreementReadiness";

// One guided roadmap for an external contributor's onboarding, built from facts the platform already records. It reuses the existing
// departments (HR onboarding, Legal, Finance) as the systems of record and only EXPLAINS the journey and the next action. It never
// advances a stage, issues anything, sends anything or marks anything complete.

export type Actor = "Founder" | "Ordift staff" | "Contributor" | "Legal" | "Finance" | "System";
export type StageState = "done" | "current" | "upcoming";
export type RoadmapStage = { stage: string; title: string; state: StageState; actor: Actor; what: string; systemSupplies: string };
export type NextAction = { title: string; explanation: string; actor: Actor; blockedBy: string[]; href: string | null; hrefLabel: string | null };

export type JourneyFacts = {
  pipeline: "employee" | "external_contractor";
  stages: readonly string[];
  stage: string;
  status: string;
  personName: string | null;
  engagementTypeLabel: string | null;
  isInstructor: boolean;
  requirements: { requirementKey: string; stage: string; requirementType: string; label: string; required: boolean; status: string }[];
  hasPaymentDetails: boolean;
  engagementCount: number;
  agreement: AgreementReadiness | null;
  agreementsHref: string | null;
  legalHref: string | null;
};

const SATISFIED = new Set(["satisfied", "waived", "not_applicable"]);

const STAGE_COPY: Record<string, Omit<RoadmapStage, "stage" | "state">> = {
  proposed: { title: "Proposed", actor: "Founder", what: "The Founder proposes the person and the role.", systemSupplies: "The requisition and role details." },
  approved: { title: "Approved", actor: "Founder", what: "The Founder approves the appointment.", systemSupplies: "The approved requisition, engagement type and member number." },
  invited: { title: "Invited", actor: "Ordift staff", what: "The person is invited to their workspace. No invitation is sent without separate authorization.", systemSupplies: "Their account, role and welcome workspace." },
  profile: { title: "Profile and agreement prerequisites", actor: "Contributor", what: "The person completes their own profile. Ordift confirms the legal prerequisites for their agreement.", systemSupplies: "Name, email, member number, role and engagement type are already known and are not asked for again." },
  payment_setup: { title: "Payment details", actor: "Finance", what: "The person adds payout details; Finance verifies them. Each payment is still approved separately.", systemSupplies: "The payee record and the verification checklist." },
  engagement_assigned: { title: "A specific engagement", actor: "Ordift staff", what: "Ordift assigns a particular workshop or job. This is a separate decision from general onboarding.", systemSupplies: "The workshop or assignment record." },
  active: { title: "Onboarding complete", actor: "Founder", what: "General onboarding is complete. Readiness for any particular assignment is still confirmed per engagement.", systemSupplies: "The completed onboarding record." },
};

export function buildJourney(f: JourneyFacts): { roadmap: RoadmapStage[]; next: NextAction } {
  const at = f.stages.indexOf(f.stage);
  const roadmap: RoadmapStage[] = f.stages.map((s, i) => ({ stage: s, state: i < at ? "done" : i === at ? "current" : "upcoming", ...(STAGE_COPY[s] ?? { title: s, actor: "Ordift staff" as Actor, what: "", systemSupplies: "" }) }));

  const open = f.requirements.filter((r) => r.required && !SATISFIED.has(r.status));
  const openHere = open.filter((r) => r.stage === f.stage);
  const agreementOpen = openHere.find((r) => r.requirementType === "agreement" || r.requirementType === "digital_signature");

  let next: NextAction;
  if (f.status === "completed" || f.stage === "active") {
    next = { title: "Onboarding is complete", explanation: "Nothing more is needed for general onboarding. Assign a specific workshop or job separately when one is ready.", actor: "Founder", blockedBy: [], href: null, hrefLabel: null };
  } else if (agreementOpen && f.agreement && !f.agreement.canIssue) {
    next = {
      title: `Resolve the legal prerequisites for ${f.agreement.code}`,
      explanation: `${f.personName ?? "This person"} cannot be moved past the “${f.stage.replace(/_/g, " ")}” step until their ${f.agreement.title} is executed, and it cannot be issued yet. ${f.agreement.missing.length} fact${f.agreement.missing.length === 1 ? " is" : "s are"} still missing — each one is listed below with the action that resolves it. Nothing has been sent to the person.`,
      actor: "Founder",
      blockedBy: f.agreement.missing.map((m) => `${m.label}: ${m.action}`),
      href: f.legalHref,
      hrefLabel: f.legalHref ? "Open the legal document registry" : null,
    };
  } else if (agreementOpen && f.agreement?.canIssue) {
    next = { title: `Prepare the ${f.agreement.code} agreement`, explanation: "The legal prerequisites are verified. Prepare the agreement from the verified profile and entity details, review it, then issue it for signature — each step is separately authorized.", actor: "Ordift staff", blockedBy: [], href: f.agreementsHref, hrefLabel: f.agreementsHref ? "Open agreements" : null };
  } else if (openHere.length > 0) {
    const r = openHere[0];
    next = { title: r.label, explanation: `This is the next open required item at the “${f.stage.replace(/_/g, " ")}” step.`, actor: f.stage === "payment_setup" ? "Finance" : "Ordift staff", blockedBy: [], href: null, hrefLabel: null };
  } else {
    next = { title: "Advance to the next step", explanation: "Everything required at this step is complete. A person with onboarding authority can advance the onboarding.", actor: "Ordift staff", blockedBy: [], href: null, hrefLabel: null };
  }
  return { roadmap, next };
}
