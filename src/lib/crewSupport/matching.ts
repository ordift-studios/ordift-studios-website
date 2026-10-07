import type { Proficiency, VerificationStatus } from "./config";

// Role-aware crew candidate matching (Crew Support Phase 1, 2026-10-07).
// Pure and framework-free so the eligibility/ranking rules are directly
// testable. What it deliberately does NOT use: attendance, department,
// organizational title, or role strings on the auth account. Eligibility
// comes from declared/verified CAPABILITY plus an active relationship;
// unknown availability never disqualifies anyone.

export type PersonFacts = {
  profileId: string;
  name: string;
  memberNumber: string | null;
  accessActive: boolean;
  vendorStatus: string | null;
  payeeStatus: string | null;
  engagementTypeName: string | null;
  isInternal: boolean | null;
  capabilities: { titleId: string; titleName: string; proficiency: Proficiency; verification: VerificationStatus }[];
  conflicts: { kind: "crew_slot" | "leave"; label: string; firm?: boolean }[];
};

export type Availability = "unknown" | "conflict" | "on_leave";

export type Candidate = {
  profileId: string;
  name: string;
  memberNumber: string | null;
  matchTitle: string | null;
  proficiency: Proficiency | null;
  verification: VerificationStatus | null;
  engagementTypeName: string | null;
  isInternal: boolean | null;
  availability: Availability;
  availabilityDetail: string | null;
  score: number;
};

export type ExclusionReason = "access_inactive" | "vendor_not_active" | "payee_inactive" | "no_matching_capability";

const PROFICIENCY_SCORE: Record<Proficiency, number> = { primary: 300, secondary: 200, supporting: 100 };

export function rankCandidates(requiredTitleId: string | null, people: PersonFacts[]): { candidates: Candidate[]; excluded: { profileId: string; reason: ExclusionReason }[] } {
  const candidates: Candidate[] = [];
  const excluded: { profileId: string; reason: ExclusionReason }[] = [];

  for (const person of people) {
    // A custom (unconfigured) role has no title to match, so any live
    // capability qualifies and the admin chooses manually.
    const live = person.capabilities.filter((c) => c.verification !== "revoked");
    const matches = requiredTitleId ? live.filter((c) => c.titleId === requiredTitleId) : live;
    if (matches.length === 0) {
      excluded.push({ profileId: person.profileId, reason: "no_matching_capability" });
      continue;
    }
    if (!person.accessActive) { excluded.push({ profileId: person.profileId, reason: "access_inactive" }); continue; }
    if (person.vendorStatus !== null && person.vendorStatus !== "active") { excluded.push({ profileId: person.profileId, reason: "vendor_not_active" }); continue; }
    if (person.payeeStatus === "inactive" || person.payeeStatus === "suspended") { excluded.push({ profileId: person.profileId, reason: "payee_inactive" }); continue; }

    const best = [...matches].sort(
      (a, b) => PROFICIENCY_SCORE[b.proficiency] + (b.verification === "verified" ? 50 : 0) - (PROFICIENCY_SCORE[a.proficiency] + (a.verification === "verified" ? 50 : 0))
    )[0];
    const onLeave = person.conflicts.find((c) => c.kind === "leave");
    const slotConflict = person.conflicts.find((c) => c.kind === "crew_slot");
    const availability: Availability = onLeave ? "on_leave" : slotConflict ? "conflict" : "unknown";
    const score = PROFICIENCY_SCORE[best.proficiency] + (best.verification === "verified" ? 50 : 0) + (person.isInternal ? 10 : 0) - (availability === "on_leave" ? 200 : availability === "conflict" ? 100 : 0);

    candidates.push({
      profileId: person.profileId,
      name: person.name,
      memberNumber: person.memberNumber,
      matchTitle: best.titleName,
      proficiency: best.proficiency,
      verification: best.verification,
      engagementTypeName: person.engagementTypeName,
      isInternal: person.isInternal,
      availability,
      availabilityDetail: onLeave?.label ?? slotConflict?.label ?? null,
      score,
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return { candidates, excluded };
}

export function candidateLabel(c: Candidate): string {
  const parts = [c.name];
  if (c.memberNumber) parts[0] = `${c.name} (${c.memberNumber})`;
  if (c.matchTitle && c.proficiency) parts.push(`${c.matchTitle} — ${c.proficiency}${c.verification === "verified" ? ", verified" : ", unverified"}`);
  parts.push(c.isInternal === null ? (c.engagementTypeName ?? "Relationship unspecified") : c.isInternal ? "Internal" : "External");
  parts.push(c.availability === "unknown" ? "Availability unknown" : c.availability === "on_leave" ? `On leave: ${c.availabilityDetail}` : `Conflict: ${c.availabilityDetail}`);
  return parts.join(" · ");
}
