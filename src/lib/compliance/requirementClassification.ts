// Ordift Studios — Compliance/COMP-SYS-1, Phase A1 (2026-09-13).
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
 * mirror a job title or grade. */
export const WORKFORCE_RELATIONSHIPS = ["EMPLOYEE", "CONTRACTOR", "VENDOR", "MODEL_TALENT"] as const;
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

export interface ClassificationResult {
  classification: RequirementClassification;
  /** Populated only when a specific rule produced this result. Null for a
   * fail-closed result with no single governing rule (unsupported jurisdiction,
   * no applicable rule, or an equally-specific conflict). */
  ruleKey: string | null;
  ruleVersion: number | null;
  effectiveFrom: string | null;
  /** Always present — either "matched rule X vN" or the specific fail-closed reason. */
  reason: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function reviewRequired(reason: string): ClassificationResult {
  return { classification: "REVIEW_REQUIRED", ruleKey: null, ruleVersion: null, effectiveFrom: null, reason };
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
    return reviewRequired(
      `Unsupported or unconfigured jurisdiction: ${query.jurisdiction === null || query.jurisdiction === undefined ? "(none supplied)" : JSON.stringify(query.jurisdiction)}.`
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
      `No applicable rule for domain "${query.domain}" (relationship=${query.relationship}, jurisdiction=${jurisdiction}, asOfDate=${asOfDate}).`
    );
  }

  const bestTier = Math.min(...matches.map((rule) => specificityTier(rule, query.relationship, jurisdiction)));
  const winners = matches.filter((rule) => specificityTier(rule, query.relationship, jurisdiction) === bestTier);

  const distinctClassifications = new Set(winners.map((rule) => rule.classification));
  if (distinctClassifications.size > 1) {
    const detail = winners
      .map((rule) => `${rule.ruleKey}@v${rule.ruleVersion}=${rule.classification}`)
      .sort()
      .join(", ");
    return reviewRequired(
      `Conflicting equally-specific rules for domain "${query.domain}" (relationship=${query.relationship}, jurisdiction=${jurisdiction}): ${detail}.`
    );
  }

  const [chosen] = [...winners].sort((a, b) => a.ruleKey.localeCompare(b.ruleKey));
  return {
    classification: chosen.classification,
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
