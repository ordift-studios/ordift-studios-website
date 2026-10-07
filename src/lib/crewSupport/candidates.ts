import { createAdminClient } from "@/lib/supabase/admin";
import type { Proficiency, VerificationStatus } from "./config";
import { rankCandidates, type Candidate, type PersonFacts } from "./matching";
import { loadConflicts } from "./conflicts";

// Server-only loader feeding the pure matcher. Reads capabilities and the
// active-relationship facts (access, vendor/payee status, engagement
// type) plus schedule conflicts. It never reads attendance_records.
const INTERNAL_ENGAGEMENT_SLUGS = new Set(["full_time", "part_time", "intern"]);

type Range = { start: string; end: string };

async function loadPeopleFacts(range: Range, excludeRequestId: string, currentIsTest: boolean): Promise<PersonFacts[]> {
  const admin = createAdminClient();
  const { data: caps, error } = await admin
    .from("person_capabilities")
    .select("profile_id, operational_title_id, proficiency, verification_status, title:operational_titles(name)")
    .neq("verification_status", "revoked");
  if (error) throw new Error(error.message);
  const ids = [...new Set((caps ?? []).map((c) => c.profile_id as string))];
  if (ids.length === 0) return [];

  const [profiles, vendors, payees, staff, conflicts] = await Promise.all([
    admin.from("profiles").select("id, full_name, member_number, access_status, access_expires_at").in("id", ids),
    admin.from("vendor_profiles").select("id, status").in("id", ids),
    admin.from("payee_profiles").select("id, status").in("id", ids),
    admin.from("staff_details").select("id, engagement_type:engagement_types(slug, name)").in("id", ids),
    // The one shared definition of "conflict" (conflicts.ts) — the
    // confirmation gate uses the same loader.
    loadConflicts(ids, range, excludeRequestId, currentIsTest),
  ]);

  const byId = <T extends { id: string }>(rows: T[] | null) => new Map((rows ?? []).map((r) => [r.id, r]));
  const profileMap = byId(profiles.data as { id: string; full_name: string | null; member_number: string | null; access_status: string; access_expires_at: string | null }[] | null);
  const vendorMap = byId(vendors.data as { id: string; status: string }[] | null);
  const payeeMap = byId(payees.data as { id: string; status: string }[] | null);
  const staffMap = byId(staff.data as unknown as { id: string; engagement_type: { slug: string; name: string } | null }[] | null);

  const now = Date.now();
  return ids.map((id) => {
    const p = profileMap.get(id);
    const eng = staffMap.get(id)?.engagement_type ?? null;
    const expired = p?.access_expires_at ? new Date(p.access_expires_at).getTime() <= now : false;
    return {
      profileId: id,
      name: p?.full_name ?? "Unnamed profile",
      memberNumber: p?.member_number ?? null,
      accessActive: p?.access_status === "active" && !expired,
      vendorStatus: vendorMap.get(id)?.status ?? null,
      payeeStatus: payeeMap.get(id)?.status ?? null,
      engagementTypeName: eng?.name ?? null,
      isInternal: eng ? INTERNAL_ENGAGEMENT_SLUGS.has(eng.slug) : null,
      capabilities: (caps ?? [])
        .filter((c) => c.profile_id === id)
        .map((c) => ({
          titleId: c.operational_title_id as string,
          titleName: ((c.title as unknown as { name: string } | null)?.name) ?? "Capability",
          proficiency: c.proficiency as Proficiency,
          verification: c.verification_status as VerificationStatus,
        })),
      conflicts: conflicts.get(id) ?? [],
    };
  });
}

export type RequirementCandidates = Record<string, { candidates: Candidate[]; excludedCount: number }>;

export async function loadCandidatesForRequirements(params: {
  requestId: string;
  isTest: boolean;
  range: Range;
  requirements: { id: string; operationalTitleId: string | null }[];
}): Promise<RequirementCandidates> {
  const people = await loadPeopleFacts(params.range, params.requestId, params.isTest);
  const out: RequirementCandidates = {};
  for (const req of params.requirements) {
    const { candidates, excluded } = rankCandidates(req.operationalTitleId, people);
    out[req.id] = { candidates, excludedCount: excluded.length };
  }
  return out;
}
