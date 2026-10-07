import { createAdminClient } from "@/lib/supabase/admin";
import type { Proficiency, VerificationStatus } from "./config";
import { rankCandidates, type Candidate, type PersonFacts } from "./matching";

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

  const [profiles, vendors, payees, staff, slots, leave] = await Promise.all([
    admin.from("profiles").select("id, full_name, member_number, access_status, access_expires_at").in("id", ids),
    admin.from("vendor_profiles").select("id, status").in("id", ids),
    admin.from("payee_profiles").select("id, status").in("id", ids),
    admin.from("staff_details").select("id, engagement_type:engagement_types(slug, name)").in("id", ids),
    admin
      .from("crew_support_slots")
      .select("assignee_profile_id, request:crew_support_requests!inner(id, status, start_date, end_date, reference_number, is_test)")
      .in("assignee_profile_id", ids)
      .in("status", ["assigned", "proposed"]),
    admin.from("leave_requests").select("profile_id, start_date, end_date").in("profile_id", ids).eq("status", "approved").lte("start_date", range.end).gte("end_date", range.start),
  ]);

  const byId = <T extends { id: string }>(rows: T[] | null) => new Map((rows ?? []).map((r) => [r.id, r]));
  const profileMap = byId(profiles.data as { id: string; full_name: string | null; member_number: string | null; access_status: string; access_expires_at: string | null }[] | null);
  const vendorMap = byId(vendors.data as { id: string; status: string }[] | null);
  const payeeMap = byId(payees.data as { id: string; status: string }[] | null);
  const staffMap = byId(staff.data as unknown as { id: string; engagement_type: { slug: string; name: string } | null }[] | null);

  const conflicts = new Map<string, PersonFacts["conflicts"]>();
  const push = (id: string, c: PersonFacts["conflicts"][number]) => conflicts.set(id, [...(conflicts.get(id) ?? []), c]);
  for (const s of (slots.data ?? []) as unknown as { assignee_profile_id: string; request: { id: string; status: string; start_date: string; end_date: string; reference_number: string; is_test: boolean } }[]) {
    const r = s.request;
    if (r.id === excludeRequestId || r.status === "declined" || r.status === "cancelled") continue;
    if (r.is_test && !currentIsTest) continue; // QA records never block real scheduling
    if (r.start_date <= range.end && r.end_date >= range.start) push(s.assignee_profile_id, { kind: "crew_slot", label: `${r.reference_number} (${r.start_date}${r.start_date === r.end_date ? "" : ` → ${r.end_date}`})` });
  }
  for (const l of leave.data ?? []) push(l.profile_id as string, { kind: "leave", label: `${l.start_date} → ${l.end_date}` });

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
