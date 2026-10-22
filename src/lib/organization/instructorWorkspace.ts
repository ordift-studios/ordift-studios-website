import type { AgreementReadiness, ReadinessCheck } from "@/lib/legal/agreementReadiness";
import { summarizeWorkspace, type StepState, type WorkspaceStep, type WorkspaceSummary } from "@/lib/workspace/processWorkspace";

// The instructor onboarding as ONE guided workspace. Built only from records the platform already holds; it explains and points - it never
// advances a stage, issues, signs or sends anything. The same pattern (see processWorkspace.ts) is the template for the other modules.

export type InstructorWorkspaceFacts = {
  onboardingId: string;
  personName: string | null;
  memberNumber: string | null;
  engagementTypeName: string | null;
  stage: string;
  status: string;
  requisitionLinked: boolean;
  startDate: string | null;
  // genuine acknowledgement evidence for the currently active controlled policies (policy_acknowledgements)
  policies: { registered: number; acknowledged: number };
  requirements: { requirementKey: string; stage: string; requirementType: string; label: string; required: boolean; status: string }[];
  agreement: AgreementReadiness | null;
  draftAgreement: { id: string; reference: string; status: string } | null;
  paymentInstructionCount: number;
};

export type InstructorStep = WorkspaceStep<ReadinessCheck> & { forms: string[] };
const DONE = new Set(["satisfied", "waived"]);
const A = (id: string, label: string) => ({ kind: "anchor" as const, href: `#${id}`, label });

export function buildInstructorWorkspace(f: InstructorWorkspaceFacts): { steps: InstructorStep[]; summary: WorkspaceSummary; person: string } {
  const person = f.personName ?? "This person";
  const check = (...keys: string[]) => (f.agreement?.checks ?? []).filter((c) => keys.includes(c.key));
  const req = (key: string) => f.requirements.find((r) => r.requirementKey === key) ?? null;
  const reqDone = (key: string) => { const r = req(key); return r ? DONE.has(r.status) : false; };
  const executed = reqDone("instructor_agreement_executed");
  const unresolved = (cs: ReadinessCheck[]) => cs.filter((c) => c.state !== "verified");
  const stateFromChecks = (cs: ReadinessCheck[]): StepState => (cs.length === 0 ? "pending" : unresolved(cs).length === 0 ? "completed" : "pending");
  const completedOnboarding = f.status === "completed" || f.stage === "active";

  const raw: Omit<InstructorStep, "number">[] = [];

  raw.push({ key: "requisition", title: "Hiring authorization and role", owner: "Founder", purpose: "The Founder authorises the appointment and defines the role.",
    known: f.requisitionLinked ? ["Founder-approved requisition is linked", f.startDate ? `Preferred start date ${f.startDate}` : "No start date recorded"] : [], missing: f.requisitionLinked ? [] : ["No requisition is linked to this onboarding"],
    state: f.requisitionLinked ? "completed" : "pending", blocker: null, action: f.requisitionLinked ? null : A("section-requisition", "Link the requisition"), checks: [], forms: [] });

  raw.push({ key: "classification", title: "Contributor classification", owner: "Founder", purpose: "Confirms what kind of relationship this is, which decides the agreement and the requirements.",
    known: [f.engagementTypeName ? `Engagement type: ${f.engagementTypeName}` : "", f.memberNumber ? `Member number ${f.memberNumber}` : ""].filter(Boolean), missing: f.engagementTypeName ? [] : ["Engagement type not set"],
    state: f.engagementTypeName ? "completed" : "pending", blocker: null, action: f.engagementTypeName ? null : A("section-person", "Set the engagement type"), checks: [], forms: [] });

  const identityDone = reqDone("instructor_identity_verified");
  const identityApplicable = Boolean(req("instructor_identity_verified"));
  raw.push({ key: "profile", title: "Profile information and documents", owner: `${person} supplies; Ordift staff verify`, purpose: "The person completes their own profile and supplies identity and supporting documents. This is NOT conditional on any agreement - the agreement is prepared from this information.",
    known: ["Name, email and member number are already on the account", ...(identityDone ? ["Identity document verified by staff"] : [])], missing: identityDone || !identityApplicable ? [] : ["Identity document not yet verified by staff"],
    state: identityApplicable ? (identityDone ? "completed" : "pending") : "pending", blocker: null, action: identityDone ? null : A("section-requirements", "Record identity verification (Current-Stage Requirements)"), checks: [], forms: [] });

  const place = check("jurisdiction", "contracting_entity");
  raw.push({ key: "jurisdiction_entity", title: "Jurisdiction and contracting entity", owner: "Founder", purpose: "Which jurisdiction governs this relationship and which verified legal entity contracts with the person.",
    known: place.filter((c) => c.state === "verified" || c.state === "needs_confirmation").map((c) => c.detail), missing: unresolved(place).map((c) => (c.state === "needs_confirmation" ? `To confirm: ${c.label.replace(/^Confirm /, "")}` : c.label)),
    state: f.agreement ? stateFromChecks(place) : "not_applicable", blocker: null, action: unresolved(place).length ? { kind: "embedded", label: "Confirm below" } : null, checks: place, forms: ["confirm_entity"] });

  const noPolicies = f.policies.registered === 0;
  const policiesOk = !noPolicies && f.policies.acknowledged >= f.policies.registered;
  raw.push({ key: "policies", title: "Policies and acknowledgements", owner: person, purpose: "The person acknowledges the controlled company policies in their own workspace; the acknowledgement is recorded as evidence.",
    known: noPolicies ? ["No controlled policy is currently registered"] : [`${f.policies.acknowledged} of ${f.policies.registered} controlled policies acknowledged`], missing: noPolicies || policiesOk ? [] : [`${f.policies.registered - f.policies.acknowledged} policy acknowledgement(s) outstanding - the person completes these in their own workspace`],
    state: noPolicies ? "not_applicable" : policiesOk ? "completed" : "pending", blocker: null, action: null, checks: [], forms: [] });

  const template = check("approval_recorded", "approval_date", "master_files", "content_reference", "review_clauses", "activation", "effective_date");
  raw.push({ key: "template", title: "Legal approval of the contract template", owner: "Founder / Legal Counsel", purpose: "Before the Instructor Agreement can be used, its template must have a verified approval, a controlled content reference, no open review clauses, an effective date and an activation.",
    known: template.filter((c) => c.state === "verified").map((c) => c.label), missing: unresolved(template).map((c) => c.label),
    state: f.agreement ? stateFromChecks(template) : "pending", blocker: null, action: unresolved(template).length ? { kind: "embedded", label: "Resolve below" } : null, checks: template, forms: ["attest_approval", "register_master", "activate"] });

  const sign = check("signatory");
  raw.push({ key: "signatory", title: "Authorised signatory", owner: "Founder", purpose: "Who signs for the contracting entity, and the document that proves their authority.",
    known: sign.filter((c) => c.state === "verified").map((c) => c.detail), missing: unresolved(sign).map((c) => (c.state === "needs_confirmation" ? `To confirm: ${c.label.replace(/^Confirm /, "")}` : c.label)),
    state: f.agreement ? stateFromChecks(sign) : "pending", blocker: null, action: unresolved(sign).length ? { kind: "embedded", label: "Resolve below" } : null, checks: sign, forms: ["add_signatory", "select_signatory"] });

  const allLegal = f.agreement?.canIssue ?? false;
  const blockedBy = (f.agreement?.unresolved ?? []).map((c) => c.label);
  raw.push({ key: "agreement", title: "Prepare, issue and sign the agreement", owner: "Ordift staff, then the person", purpose: "Prepare the Instructor Agreement from the verified information, review it, issue it for signature and record the signatures.",
    known: f.draftAgreement ? [`Draft ${f.draftAgreement.reference} (status: ${f.draftAgreement.status})`] : [], missing: executed ? [] : f.draftAgreement ? ["Not yet issued and signed"] : ["No agreement has been prepared"],
    state: executed ? "completed" : !allLegal ? "blocked" : "pending", blocker: !executed && !allLegal ? `Waiting for: ${blockedBy.join("; ")}.` : null,
    action: f.draftAgreement ? { kind: "link", href: `/admin/organization/agreements/${f.draftAgreement.id}`, label: "Open the agreement" } : allLegal && !executed ? { kind: "embedded", label: "Prepare below" } : null, checks: [], forms: allLegal && !f.draftAgreement && !executed ? ["prepare_agreement"] : [] });

  const payOk = reqDone("instructor_payment_setup_completed");
  raw.push({ key: "payment", title: "Payment profile", owner: "Finance", purpose: "Payout details are added and verified by Finance. Each payment is still approved separately.",
    known: f.paymentInstructionCount ? [`${f.paymentInstructionCount} payout instruction(s) recorded`] : [], missing: payOk ? [] : ["Payment destination not configured and verified"], state: payOk ? "completed" : "pending", blocker: null,
    action: payOk ? null : A("section-payment", "Go to payment details"), checks: [], forms: [] });

  raw.push({ key: "eligibility", title: "Assignment eligibility", owner: "System, confirmed by the Founder", purpose: "A person can be assigned to a workshop only once their agreement is genuinely executed. The assignment screen enforces this independently.",
    known: executed ? ["Agreement executed"] : [], missing: executed ? [] : ["A genuinely executed agreement"], state: executed ? "completed" : "blocked", blocker: executed ? null : "Not eligible for any workshop assignment until the agreement is executed.", action: null, checks: [], forms: [] });

  raw.push({ key: "approval", title: "Final onboarding approval", owner: "Founder", purpose: "Complete the onboarding once every required item is done. The system re-checks the requirements before it moves.",
    known: completedOnboarding ? ["Onboarding completed"] : [], missing: completedOnboarding ? [] : ["Remaining steps above"], state: completedOnboarding ? "completed" : "pending", blocker: null, action: completedOnboarding ? null : A("section-stage", "Go to Pipeline & Stage"), checks: [], forms: [] });

  const steps = raw.map((s, i) => ({ ...s, number: i + 1 }));
  return { steps, summary: summarizeWorkspace(steps), person };
}
