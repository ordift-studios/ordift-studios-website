import type { RegistrationFact } from "./entityRegistry";

// Jurisdiction-aware eligibility of a legal entity to contract (pure; no database access). Ghana and Qatar do NOT share one rule set: each jurisdiction has its own approved
// requirements (public.jurisdiction_entity_requirements) using its OWN document names and identifiers. This is the application's port of private.entity_issue_standing() (migration 0173);
// a parity test runs both over the same fixtures, so what the screens show and what the database enforces at issuance cannot drift apart. Messages are identical by design.
//
//   mandatory      always blocks if unmet            conditional    blocks only when the quotation declares condition_activity
//   optional       advisory only, never blocks       not_applicable explicitly not required in that jurisdiction (never demanded)
//
// Fail-closed: an entity with no jurisdiction, or whose jurisdiction has no APPROVED mandatory legal-registration requirement (e.g. a country that was only drafted), is not eligible.
// A planned activity is never treated as licensed; "licensed" needs verified, active, in-date evidence. Passing declaredActivities = null means "not declared yet" (selection time): activity coverage is
// then not judged; an EMPTY list means "declared none" and blocks where licensed activities are mandatory.

export type RequirementCategory = "legal_registration" | "tax_registration" | "operating_permission" | "activity_coverage" | "activity_licence" | "signatory" | "renewal_evidence";
export type Necessity = "mandatory" | "conditional" | "optional" | "not_applicable";

export type RequirementRow = {
  key: string; category: RequirementCategory; label: string; identifierLabel: string | null; identifierPattern?: string | null; registrationKind: string | null; signatoryCapacities?: string[] | null;
  necessity: Necessity; conditionActivity: string | null; requiresVerified: boolean; requiresInDate: boolean; shownOnDocument: boolean; sortOrder: number; approved: boolean;
};
export type ActivityStatus = "planned" | "licensed" | "suspended" | "withdrawn";
export type ActivityFact = { key: string; status: ActivityStatus; evidenceRegistrationId: string | null };
export type RenewalFact = { status: "founder_confirmed" | "official_verified" | "lapsed"; coversTo: string; createdAt: string; nextDueOn: string | null };
export type EntityFacts = {
  name: string; legalName: string | null; registrationType: string | null; active: boolean; verified: boolean; jurisdictionName: string | null;
  registrations: RegistrationFact[];                                    // statuses active / pending / not_issued / expired (history that is superseded or revoked is not passed)
  signatories: { effectiveFrom: string | null; effectiveTo: string | null; legalCapacity?: string | null }[];   // legalCapacity is the LEGAL capacity; the management title is never used here
  activities: ActivityFact[];
  activityLabels: Record<string, string>;
  renewals?: RenewalFact[];                                             // the entity's renewal history (latest by period covered is the current one)
  activityCodes?: { code: string; activityKey: string }[];              // this jurisdiction's registered-activity-code map
};
export type EntityDisplay = { legalName: string; registrationType: string | null; identifiers: { label: string; identifier: string }[] };
export type RequirementResult = { key: string; label: string; necessity: Necessity; applies: boolean; met: boolean; blocking: boolean };
// How each DECLARED activity stands where the jurisdiction requires licensed activities. 'listed_on_registration' = printed on the verified, current registration (not by itself permission to operate:
// the operating permit requirement still applies); 'licensed' = explicitly recorded with verified evidence; 'planned' is an intention and never counts.
export type ActivityState = { key: string; label: string; state: "licensed" | "listed_on_registration" | "planned" | "suspended" | "not_licensed" };
export type EntityAssessment = {
  eligible: boolean; blockers: string[]; advisories: string[]; requirements: RequirementResult[]; activities: ActivityState[]; declaredActivities: string[]; jurisdiction: string | null; legal: EntityDisplay;
};

const CURRENT = ["active", "pending", "not_issued"];

export function assessEntityForQuotation(entity: EntityFacts, catalog: RequirementRow[], declaredActivities: string[] | null, today: string): EntityAssessment {
  const acts = [...new Set(declaredActivities ?? [])].sort();
  const blockers: string[] = [];
  const advisories: string[] = [];
  const requirements: RequirementResult[] = [];
  const activityStates: ActivityState[] = [];
  const identifiers: { label: string; identifier: string }[] = [];

  if (!entity.active) blockers.push("The entity is not active.");
  if (!entity.verified) blockers.push("The entity's registration has not been verified by a Super Admin.");
  const rules = catalog.filter((r) => r.approved).sort((a, b) => a.sortOrder - b.sortOrder || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  let configured = false;
  if (entity.jurisdictionName === null) {
    blockers.push("The entity has no jurisdiction recorded.");
  } else {
    configured = rules.some((r) => r.category === "legal_registration" && r.necessity === "mandatory");
    if (!configured) blockers.push(`No approved registration requirements are defined for ${entity.jurisdictionName} yet; a Super Admin must define and approve them before an entity there can contract.`);
  }

  const currentOf = (kind: string | null) => entity.registrations.find((x) => x.kind === kind && CURRENT.includes(x.status));
  // the current legal registration, whose printed activity codes may stand for an activity
  const crCurrent = currentOf("commercial_registration");
  const crOk = Boolean(crCurrent && crCurrent.status === "active" && crCurrent.verifiedAt && (!crCurrent.expiresOn || crCurrent.expiresOn >= today));
  const listedOnRegistration = (activityKey: string): boolean => {
    const list = (crCurrent?.facts as { activities?: unknown } | undefined)?.activities;
    if (!crOk || !Array.isArray(list)) return false;
    return list.some((el) => entity.activityCodes?.some((m) => m.activityKey === activityKey && m.code === (el as { code?: unknown })?.code));
  };
  const activityOutcome = (activityKey: string, mapped: boolean): { state: ActivityState["state"]; messages: string[] } => {
    const label = entity.activityLabels[activityKey] ?? activityKey;
    const act = entity.activities.find((a) => a.key === activityKey);
    if (act && (act.status === "planned" || act.status === "suspended")) {
      return { state: act.status, messages: [act.status === "planned" ? `${label} is planned for this entity but not yet licensed.` : `${label} is suspended for this entity.`] };
    }
    if (act && act.status === "licensed") {
      const ev = entity.registrations.find((x) => x.id === act.evidenceRegistrationId);
      if (!ev || ev.status !== "active" || !ev.verifiedAt) return { state: "not_licensed", messages: [`${label}: its licensing evidence is not verified.`] };
      if (ev.expiresOn && ev.expiresOn < today) return { state: "not_licensed", messages: [`${label}: its licensing evidence expired on ${ev.expiresOn}.`] };
      return { state: "licensed", messages: [] };
    }
    if (act && act.status === "withdrawn") return { state: "not_licensed", messages: [`${label} is not licensed for this entity.`] };
    if (mapped && listedOnRegistration(activityKey)) return { state: "listed_on_registration", messages: [] };
    return { state: "not_licensed", messages: [`${label} is not licensed for this entity.`] };
  };

  if (configured) {
    for (const r of rules) {
      const base = { key: r.key, label: r.label, necessity: r.necessity };
      if (r.necessity === "not_applicable") { requirements.push({ ...base, applies: false, met: true, blocking: false }); continue; }
      const applies = r.necessity === "mandatory" || r.necessity === "optional" || (r.necessity === "conditional" && r.conditionActivity !== null && acts.includes(r.conditionActivity));
      if (!applies) { requirements.push({ ...base, applies: false, met: true, blocking: false }); continue; }
      const msgs: string[] = [];
      let lapsed = false;

      if (r.category === "legal_registration" || r.category === "tax_registration" || r.category === "operating_permission") {
        const reg = currentOf(r.registrationKind);
        if (!reg) {
          msgs.push(entity.registrations.some((x) => x.kind === r.registrationKind && x.status === "expired") ? `${r.label} has expired.` : `${r.label} is not on record.`);
        } else if (reg.status === "pending" || reg.status === "not_issued") {
          msgs.push(`${r.label} has not been issued.`);
        } else if (!reg.identifier) {
          msgs.push(`${r.label} has no identifier recorded.`);
        } else if (r.requiresInDate && reg.expiresOn && reg.expiresOn < today) {
          msgs.push(`${r.label} expired on ${reg.expiresOn}.`);
        } else if (r.requiresVerified && !reg.verifiedAt) {
          msgs.push(`${r.label} has not been verified.`);
        }
        // what a client document may show: only a CURRENT, VERIFIED, unexpired record's identifier
        if (r.shownOnDocument && reg && reg.status === "active" && reg.verifiedAt && reg.identifier && reg.identifier.trim() && (!reg.expiresOn || reg.expiresOn >= today)) {
          identifiers.push({ label: r.identifierLabel ?? r.label, identifier: reg.identifier.trim() });
        }
      } else if (r.category === "signatory") {
        // LEGAL authority only: the management title is irrelevant here
        const caps = r.signatoryCapacities ?? [];
        if (!entity.signatories.some((s) => (s.effectiveFrom === null || s.effectiveFrom <= today) && (s.effectiveTo === null || s.effectiveTo >= today) && s.legalCapacity != null && caps.includes(s.legalCapacity))) {
          msgs.push("No signatory with legal authority to contract is recorded for the entity.");
        }
      } else if (r.category === "renewal_evidence") {
        const rn = [...(entity.renewals ?? [])].sort((a, b) => (a.coversTo < b.coversTo ? 1 : a.coversTo > b.coversTo ? -1 : a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))[0];
        if (!rn) {
          msgs.push(`${r.label}: no renewal confirmation is recorded.`);
        } else if (rn.status === "lapsed") {
          lapsed = true;
          blockers.push(`${r.label}: the registration is recorded as lapsed.`);                    // a KNOWN adverse fact blocks whatever the requirement's necessity
        } else if (rn.status === "founder_confirmed") {
          msgs.push(`${r.label}: Founder-confirmed; official verification pending.`);
        }
        if (rn && rn.status !== "lapsed" && rn.nextDueOn && rn.nextDueOn < today && rn.status !== "official_verified") msgs.push(`${r.label}: the renewal due ${rn.nextDueOn} has passed; confirm the latest renewal.`);
      } else if (r.category === "activity_coverage" && (r.necessity !== "mandatory" || declaredActivities === null)) {
        // informational where a jurisdiction does not require licensed activities (e.g. Ghana); judged when the quotation is issued where it does (activities are not declared at selection)
      } else if (r.category === "activity_coverage" || r.category === "activity_licence") {
        if (r.category === "activity_coverage" && acts.length === 0) msgs.push("State the activities this quotation covers.");
        for (const a of r.category === "activity_licence" ? [r.conditionActivity as string] : acts) {
          const out = activityOutcome(a, r.category === "activity_coverage");
          msgs.push(...out.messages);
          if (r.category === "activity_coverage") activityStates.push({ key: a, label: entity.activityLabels[a] ?? a, state: out.state });
        }
      }

      const met = msgs.length === 0 && !lapsed;
      if (msgs.length > 0) (r.necessity === "optional" ? advisories : blockers).push(...msgs);
      requirements.push({ ...base, applies: true, met, blocking: !met && (r.necessity !== "optional" || lapsed) });
    }
  }

  return {
    eligible: blockers.length === 0, blockers, advisories, requirements, activities: activityStates, declaredActivities: acts, jurisdiction: entity.jurisdictionName,
    legal: { legalName: (entity.legalName?.trim() || entity.name).trim(), registrationType: entity.registrationType?.trim() || null, identifiers },
  };
}

// Display helper for requirement states on screens (plain language; never "licensed" unless the requirement is met).
export function requirementStateLabel(r: RequirementResult): string {
  if (!r.applies) return r.necessity === "not_applicable" ? "Not applicable here" : "Not needed for this quotation";
  if (r.met) return "Met";
  return r.necessity === "optional" ? "Not recorded (advisory)" : "Missing — blocks issuing";
}
