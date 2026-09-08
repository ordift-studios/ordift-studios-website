// Ordift Studios Legal Suite — LEGAL-SYS-1, Phase G (2026-09-08).
// Pure, zero-import Releases/Rights catalogue for OS-LGL-004 (Model/
// Talent), OS-LGL-005 (Property/Location), and OS-LGL-006 (RAW/Source
// Files) — the three "release_authorization"/RAW-licence masters.
//
// Two independent grant sets, deliberately modeled as separate types
// rather than one flat bag of booleans:
//   - USAGE_RIGHTS_CATEGORIES: ordinary usage scope (portfolio,
//     organic social, paid advertising, website, print, third-party
//     transfer), each requiring a defined territory and duration the
//     moment any one of them is granted — a usage right with no scope
//     is meaningless and must never be recorded that way.
//   - AI_SYNTHETIC_RIGHTS_CATEGORIES: AI/synthetic-use categories
//     (AI training, digital replica, synthetic identity, synthetic
//     voice, face replacement) — per the continuation authorization
//     message, these "must default to NOT GRANTED unless explicitly
//     selected." createDefaultReleaseRights() is the single place that
//     default is established; nothing else in this module (or in
//     rightsEngine.ts) ever flips one of these to true implicitly.

export const RELEASE_MASTER_CODES = ["OS-LGL-004", "OS-LGL-005", "OS-LGL-006"] as const;
export type ReleaseMasterCode = (typeof RELEASE_MASTER_CODES)[number];

export function isReleaseMasterCode(code: string): code is ReleaseMasterCode {
  return (RELEASE_MASTER_CODES as readonly string[]).includes(code);
}

export const USAGE_RIGHTS_CATEGORIES = [
  "portfolio",
  "organic_social",
  "paid_advertising",
  "website",
  "print",
  "third_party_transfer",
] as const;
export type UsageRightsCategory = (typeof USAGE_RIGHTS_CATEGORIES)[number];
export type UsageRightsGrant = Record<UsageRightsCategory, boolean>;

export const AI_SYNTHETIC_RIGHTS_CATEGORIES = [
  "ai_training",
  "digital_replica",
  "synthetic_identity",
  "synthetic_voice",
  "face_replacement",
] as const;
export type AiSyntheticRightsCategory = (typeof AI_SYNTHETIC_RIGHTS_CATEGORIES)[number];
export type AiSyntheticRightsGrant = Record<AiSyntheticRightsCategory, boolean>;

// Controlled vocabulary, not a fabricated country list — "specified"
// carries a free-text detail field the caller fills in with the real
// agreed scope rather than this module inventing one.
export const RIGHTS_TERRITORIES = ["worldwide", "project_country_only", "specified"] as const;
export type RightsTerritory = (typeof RIGHTS_TERRITORIES)[number];

export const RIGHTS_DURATIONS = ["perpetual", "fixed_term", "project_only"] as const;
export type RightsDuration = (typeof RIGHTS_DURATIONS)[number];

export type ReleaseRights = {
  usage: UsageRightsGrant;
  aiSynthetic: AiSyntheticRightsGrant;
  territory: RightsTerritory | null;
  territoryDetail: string | null;
  duration: RightsDuration | null;
  durationEndDate: string | null; // ISO date, required only when duration === "fixed_term"
};

// The one safe default — every category, ordinary and AI/synthetic
// alike, starts NOT GRANTED. Nothing is granted until explicitly
// selected by a real, authorized administrator against a real
// counterparty's actual agreed terms.
export function createDefaultReleaseRights(): ReleaseRights {
  const usage = Object.fromEntries(USAGE_RIGHTS_CATEGORIES.map((c) => [c, false])) as UsageRightsGrant;
  const aiSynthetic = Object.fromEntries(AI_SYNTHETIC_RIGHTS_CATEGORIES.map((c) => [c, false])) as AiSyntheticRightsGrant;
  return { usage, aiSynthetic, territory: null, territoryDetail: null, duration: null, durationEndDate: null };
}

export function isAnyUsageRightGranted(usage: UsageRightsGrant): boolean {
  return USAGE_RIGHTS_CATEGORIES.some((c) => usage[c] === true);
}

export function isAnyAiSyntheticRightGranted(aiSynthetic: AiSyntheticRightsGrant): boolean {
  return AI_SYNTHETIC_RIGHTS_CATEGORIES.some((c) => aiSynthetic[c] === true);
}

export type ValidateReleaseRightsResult = { ok: true } | { ok: false; error: string };

// Structural well-formedness only — never silently fixes/defaults a
// missing field. A usage right can never be granted without a defined
// territory and duration; a fixed_term duration can never be granted
// without an explicit end date.
export function validateReleaseRights(rights: ReleaseRights): ValidateReleaseRightsResult {
  if (isAnyUsageRightGranted(rights.usage)) {
    if (!rights.territory) return { ok: false, error: "A territory must be specified whenever any usage right is granted." };
    if (rights.territory === "specified" && !rights.territoryDetail?.trim()) {
      return { ok: false, error: 'territoryDetail is required when territory is "specified".' };
    }
    if (!rights.duration) return { ok: false, error: "A duration must be specified whenever any usage right is granted." };
    if (rights.duration === "fixed_term" && !rights.durationEndDate) {
      return { ok: false, error: 'durationEndDate is required when duration is "fixed_term".' };
    }
  }
  return { ok: true };
}
