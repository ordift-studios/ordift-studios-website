// Ordift Studios — Compliance/COMP-SYS-1, Phase A1 (2026-09-13),
// extended by Phase A2's pre-migration provenance checkpoint (same
// date): ClassificationResult gained an explicit `outcome` discriminator
// (matched_rule | unsupported_jurisdiction | malformed_jurisdiction |
// no_applicable_rule | conflicting_rules) and, for conflicts, a
// structured `conflictingRules` list — both purely additive, so a
// future audit record (Phase A2's requirement_evaluations table) can
// distinguish WHY a REVIEW_REQUIRED result occurred without parsing the
// human-readable `reason` string. No resolver precedence/fail-closed
// BEHAVIOR changed — every existing decision still resolves to the same
// classification it always did.
// Jurisdiction-aware requirements-classification layer — PURE RESOLVER
// FOUNDATION ONLY. This module has no database dependency, no caller
// anywhere in the codebase yet, and is not wired into OS-LGL-007, the
// onboarding pipeline, or any other real workflow. It exists so that a
// later, separately authorized phase can persist evaluations
// (requirement_evaluations / requirement_review_resolutions /
// policy_acknowledgements — NOT built here) against a rule engine whose
// precedence and fail-closed behavior is already proven correct.
//
// IMPORTANT — this file intentionally contains NO real employment-law
// determination for any jurisdiction. STARTER_REQUIREMENT_CATALOG below
// is deliberately minimal: it does not decide leave entitlement, notice
// periods, gratuity/final settlement, working-hour rules, tax rules,
// licensing, or Model/Talent activation. Where no jurisdiction/relationship
// -specific rule has been formally reviewed and approved, this module
// resolves conservatively to REVIEW_REQUIRED rather than guessing.
//
// Relationship classification input contract: `WorkforceRelationship`
// must always come from the caller's real engagement/relationship
// record (e.g. an actual employment, contractor, vendor, or model/talent
// record). It must never be inferred from a UI label, job title, grade,
// department, or permission set — those are display/authorization
// concepts, not relationship facts, and mixing them in would let a title
// change silently change someone's compliance classification.

/** The five canonical classification outcomes. Semantics are fixed:
 * - REQUIRED: missing data/action blocks the action needing it.
 * - OPTIONAL: may be collected only for a legitimate configured purpose —
 *   never a blanket excuse to expose/request every field.
 * - PROHIBITED: must not be collected, read, or displayed at all.
 * - NOT_APPLICABLE: must not even be requested (distinct from PROHIBITED:
 *   NOT_APPLICABLE means "this relationship/jurisdiction never has this
 *   concept", PROHIBITED means "this exists but must not be handled here").
 * - REVIEW_REQUIRED: blocks automated progression pending human resolution.
 */
export const REQUIREMENT_CLASSIFICATIONS = [
  "REQUIRED",
  "OPTIONAL",
  "PROHIBITED",
  "NOT_APPLICABLE",
  "REVIEW_REQUIRED",
] as const;
export type RequirementClassification = (typeof REQUIREMENT_CLASSIFICATIONS)[number];

/** Minimal starter relationship vocabulary. Extend only when a real,
 * distinct engagement type needs its own compliance treatment — never to
 * mirror a job title or grade.
 *
 * INSTRUCTOR and COLLABORATOR_PARTNER added at Phase B1 (2026-09-14) —
 * the smallest additive extension needed to represent two real,
 * already-seeded engagement_types.slug values (`instructor`,
 * `collaborator_partner`) that don't correctly fit EMPLOYEE/CONTRACTOR/
 * VENDOR/MODEL_TALENT: a workshop instructor is engaged for a distinct
 * facilitation service, not folded into CONTRACTOR generically, and a
 * collaborator/partner is a business-relationship concept, not a
 * services-for-payment one. Purely additive — no existing value changed
 * or removed, so every prior classification decision is unaffected. */
export const WORKFORCE_RELATIONSHIPS = [
  "EMPLOYEE",
  "CONTRACTOR",
  "VENDOR",
  "MODEL_TALENT",
  "INSTRUCTOR",
  "COLLABORATOR_PARTNER",
] as const;
export type WorkforceRelationship = (typeof WORKFORCE_RELATIONSHIPS)[number];

/** Jurisdiction set kept intentionally short today. The resolver itself
 * (classifyRequirement, below) does not hard-code this list into its
 * logic — adding a new jurisdiction (e.g. Canada) is a matter of adding
 * a value here and, separately, formally-approved rules; it never
 * requires redesigning classifyRequirement. OTHER is a deliberate,
 * explicitly-chosen configured value — never a fallback the resolver
 * assigns to unknown input. Unknown/malformed input fails closed to
 * REVIEW_REQUIRED instead (see classifyRequirement). */
export const WORKFORCE_JURISDICTIONS = ["GH", "QA", "GB", "DE_EU", "US", "OTHER"] as const;
export type WorkforceJurisdiction = (typeof WORKFORCE_JURISDICTIONS)[number];

function isWorkforceJurisdiction(value: unknown): value is WorkforceJurisdiction {
  return typeof value === "string" && (WORKFORCE_JURISDICTIONS as readonly string[]).includes(value);
}

/** A syntactically plausible jurisdiction CODE shape (uppercase letters/
 * underscores, 2-10 chars — matches the shape of every value in
 * WORKFORCE_JURISDICTIONS). Used only to distinguish two different kinds
 * of fail-closed input for audit provenance (Phase A2): a well-formed
 * but not-yet-configured code like "FR" (unsupported_jurisdiction — a
 * real business gap) versus null/empty/lowercase/punctuated input like
 * "gh" or "not-a-jurisdiction" (malformed_jurisdiction — a caller/API
 * formatting defect). Both still fail closed to REVIEW_REQUIRED either
 * way; this distinction is provenance detail only, never a relaxation. */
function isWellFormedJurisdictionCodeShape(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z][A-Z_]{1,9}$/.test(value);
}

/** A rule scope dimension: an exact value, or the ANY wildcard. */
export type RelationshipScope = WorkforceRelationship | "ANY";
export type JurisdictionScope = WorkforceJurisdiction | "ANY";

/** The requirement domain a rule governs — e.g. "identity_document_collection".
 * Deliberately a plain string (not a fixed enum): the set of real-world
 * compliance domains this layer will eventually cover is not yet known
 * or approved, and a string keeps the resolver itself domain-agnostic. */
export type RequirementDomain = string;

/** Immutable rule identity (refinement A). A rule's meaning must never
 * be mutated in place — a later policy change creates a NEW version
 * (incremented ruleVersion, new effectiveFrom), never an edit of an
 * existing version's classification. This lets a future persisted
 * evaluation record exactly which rule/version produced a result, and
 * lets an evaluation dated in the past keep resolving against the rule
 * that was actually in effect then. */
export interface RequirementRule {
  /** Stable across versions — identifies "this rule", not "this rule at this version". */
  ruleKey: string;
  /** Monotonically increasing per ruleKey. Higher = newer. */
  ruleVersion: number;
  /** ISO date (YYYY-MM-DD) this version takes effect. */
  effectiveFrom: string;
  relationshipScope: RelationshipScope;
  jurisdictionScope: JurisdictionScope;
  domain: RequirementDomain;
  classification: RequirementClassification;
  /** Human-readable provenance/rationale — never a substitute for real legal review. */
  notes?: string;
}

export interface ClassificationQuery {
  relationship: WorkforceRelationship;
  /** Raw, caller-supplied jurisdiction. Deliberately untyped as `string | null | undefined`
   * (rather than WorkforceJurisdiction) so malformed/unknown input can be validated
   * here and fail closed, instead of being silently coerced by a caller upstream. */
  jurisdiction: string | null | undefined;
  domain: RequirementDomain;
  /** ISO date (YYYY-MM-DD) to evaluate as of. Defaults to today. Pass an explicit
   * historical date to reproduce what a past evaluation would have resolved to. */
  asOfDate?: string;
}

/** Explicit provenance discriminator (Phase A2 audit requirement) —
 * distinguishes WHY a result looks the way it does, independent of what
 * `classification` ended up being. "matched_rule" means a real
 * RequirementRule governed this result (its classification may itself
 * be REVIEW_REQUIRED, e.g. STARTER_REQUIREMENT_CATALOG's global default
 * — that is a deliberate authored decision, not a fail-closed default,
 * and outcome makes that distinction inspectable). The other four values
 * are always fail-closed: they only ever occur with classification
 * REVIEW_REQUIRED and never carry a rule identity, real or fabricated. */
export const CLASSIFICATION_OUTCOMES = [
  "matched_rule",
  "unsupported_jurisdiction",
  "malformed_jurisdiction",
  "no_applicable_rule",
  "conflicting_rules",
] as const;
export type ClassificationOutcome = (typeof CLASSIFICATION_OUTCOMES)[number];

/** One competing rule's identity, for the "conflicting_rules" outcome —
 * enough to look up exactly which rules disagreed, without needing to
 * parse the human-readable `reason` string. */
export interface ConflictingRuleRef {
  ruleKey: string;
  ruleVersion: number;
  classification: RequirementClassification;
}

export interface ClassificationResult {
  classification: RequirementClassification;
  outcome: ClassificationOutcome;
  /** Populated only when outcome is "matched_rule". Null for every fail-closed
   * outcome — never a fabricated rule identity standing in for "no rule matched". */
  ruleKey: string | null;
  ruleVersion: number | null;
  effectiveFrom: string | null;
  /** Always present — either "matched rule X vN" or the specific fail-closed reason. */
  reason: string;
  /** Present only when outcome is "conflicting_rules" — the competing rules'
   * identities and the classification each one produced. */
  conflictingRules?: ConflictingRuleRef[];
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function reviewRequired(
  outcome: Exclude<ClassificationOutcome, "matched_rule">,
  reason: string,
  conflictingRules?: ConflictingRuleRef[]
): ClassificationResult {
  return {
    classification: "REVIEW_REQUIRED",
    outcome,
    ruleKey: null,
    ruleVersion: null,
    effectiveFrom: null,
    reason,
    ...(conflictingRules ? { conflictingRules } : {}),
  };
}

/** For each ruleKey, keep only the highest-ruleVersion rule whose
 * effectiveFrom is on or before asOfDate. A ruleKey with no version yet
 * effective as of that date is dropped entirely (refinement L: a newer
 * rule version must never retroactively alter an older-dated evaluation —
 * achieved here by never considering a version before its own effective date). */
function selectActiveVersionsByRuleKey(
  rules: readonly RequirementRule[],
  asOfDate: string
): RequirementRule[] {
  const activeByKey = new Map<string, RequirementRule>();
  for (const rule of rules) {
    if (rule.effectiveFrom > asOfDate) continue;
    const current = activeByKey.get(rule.ruleKey);
    if (!current || rule.ruleVersion > current.ruleVersion) {
      activeByKey.set(rule.ruleKey, rule);
    }
  }
  return [...activeByKey.values()];
}

/** Specificity tier: 1 = exact relationship + exact jurisdiction (most
 * specific), 2 = exactly one dimension exact and the other ANY, 3 = both
 * ANY (global fallback, least specific). Two rules in the same tier that
 * disagree are, by definition, an equally-specific conflict. */
function specificityTier(
  rule: RequirementRule,
  relationship: WorkforceRelationship,
  jurisdiction: WorkforceJurisdiction
): 1 | 2 | 3 {
  const relationshipExact = rule.relationshipScope === relationship;
  const jurisdictionExact = rule.jurisdictionScope === jurisdiction;
  if (relationshipExact && jurisdictionExact) return 1;
  if (relationshipExact || jurisdictionExact) return 2;
  return 3;
}

/** Pure resolver. Same inputs always produce the same output — no I/O,
 * no clock dependency unless asOfDate is omitted, no hidden state.
 *
 * Precedence (refinement B): relationship+jurisdiction exact match wins
 * over a rule with exactly one exact dimension, which wins over the
 * global ANY+ANY fallback. Equally-specific rules that disagree fail
 * closed to REVIEW_REQUIRED with the conflicting rule keys named in the
 * reason — this resolver never arbitrarily picks a winner between them.
 *
 * Fail-closed cases (refinements B, C): unsupported/malformed jurisdiction,
 * no applicable rule at all, and equally-specific conflicts all resolve to
 * REVIEW_REQUIRED rather than guessing.
 */
export function classifyRequirement(
  rules: readonly RequirementRule[],
  query: ClassificationQuery
): ClassificationResult {
  if (!isWorkforceJurisdiction(query.jurisdiction)) {
    if (isWellFormedJurisdictionCodeShape(query.jurisdiction)) {
      return reviewRequired(
        "unsupported_jurisdiction",
        `Unsupported or unconfigured jurisdiction: ${JSON.stringify(query.jurisdiction)}.`
      );
    }
    return reviewRequired(
      "malformed_jurisdiction",
      `Malformed or missing jurisdiction: ${query.jurisdiction === null || query.jurisdiction === undefined ? "(none supplied)" : JSON.stringify(query.jurisdiction)}.`
    );
  }
  const jurisdiction = query.jurisdiction;
  const asOfDate = query.asOfDate ?? todayIsoDate();

  const domainRules = rules.filter((rule) => rule.domain === query.domain);
  const activeRules = selectActiveVersionsByRuleKey(domainRules, asOfDate);

  const matches = activeRules.filter(
    (rule) =>
      (rule.relationshipScope === query.relationship || rule.relationshipScope === "ANY") &&
      (rule.jurisdictionScope === jurisdiction || rule.jurisdictionScope === "ANY")
  );

  if (matches.length === 0) {
    return reviewRequired(
      "no_applicable_rule",
      `No applicable rule for domain "${query.domain}" (relationship=${query.relationship}, jurisdiction=${jurisdiction}, asOfDate=${asOfDate}).`
    );
  }

  const bestTier = Math.min(...matches.map((rule) => specificityTier(rule, query.relationship, jurisdiction)));
  const winners = matches.filter((rule) => specificityTier(rule, query.relationship, jurisdiction) === bestTier);

  const distinctClassifications = new Set(winners.map((rule) => rule.classification));
  if (distinctClassifications.size > 1) {
    const conflictingRules: ConflictingRuleRef[] = [...winners]
      .map((rule) => ({ ruleKey: rule.ruleKey, ruleVersion: rule.ruleVersion, classification: rule.classification }))
      .sort((a, b) => a.ruleKey.localeCompare(b.ruleKey));
    const detail = conflictingRules.map((rule) => `${rule.ruleKey}@v${rule.ruleVersion}=${rule.classification}`).join(", ");
    return reviewRequired(
      "conflicting_rules",
      `Conflicting equally-specific rules for domain "${query.domain}" (relationship=${query.relationship}, jurisdiction=${jurisdiction}): ${detail}.`,
      conflictingRules
    );
  }

  const [chosen] = [...winners].sort((a, b) => a.ruleKey.localeCompare(b.ruleKey));
  return {
    classification: chosen.classification,
    outcome: "matched_rule",
    ruleKey: chosen.ruleKey,
    ruleVersion: chosen.ruleVersion,
    effectiveFrom: chosen.effectiveFrom,
    reason: `Matched rule "${chosen.ruleKey}" v${chosen.ruleVersion} (effective ${chosen.effectiveFrom}).`,
  };
}

/** Deliberately minimal starter catalogue (refinement G). This is the
 * ONLY content shipped in Phase A1: a single global fallback rule for a
 * single illustrative domain, resolving to REVIEW_REQUIRED. It does NOT
 * assert that any jurisdiction or relationship has been legally reviewed
 * for identity-document collection — it exists only to give the resolver
 * one real (non-test-fixture) rule to operate on. Adding a
 * relationship/jurisdiction-specific rule here is a legal-content
 * decision for a later, separately authorized phase — not a mechanical
 * follow-up to A1.
 */
export const STARTER_REQUIREMENT_CATALOG: readonly RequirementRule[] = [
  {
    ruleKey: "identity_document_collection.global_default",
    ruleVersion: 1,
    effectiveFrom: "2026-09-13",
    relationshipScope: "ANY",
    jurisdictionScope: "ANY",
    domain: "identity_document_collection",
    classification: "REVIEW_REQUIRED",
    notes:
      "No relationship/jurisdiction-specific identity-document rule has been formally reviewed and approved yet. Conservative global default only — not a legal determination.",
  },
];
