import { createAdminClient } from "@/lib/supabase/admin";
import { INSTRUCTOR_FRAMEWORK_ENABLED } from "./featureGate";

// INSTRUCTOR DIRECTORY (read-only). One row per independent instructor (engagement type "instructor"), linking to the existing onboarding workspace and profile. It creates nothing and changes nothing;
// it only gathers what other modules already hold: onboarding stage, framework-agreement status, whether the adopted standards are acknowledged, and how many approved assignments exist.
export type InstructorDirectoryRow = {
  profileId: string; name: string; memberNumber: string | null;
  onboardingId: string | null; stage: string | null; onboardingStatus: string | null;
  agreementReference: string | null; agreementStatus: string | null; agreementExecuted: boolean;
  standards: "not_adopted" | "pending" | "acknowledged" | "framework_off";
  proposedAssignments: number; approvedAssignments: number;
};

export const standardsStateLabel = (s: InstructorDirectoryRow["standards"]) => ({ not_adopted: "Standards not yet adopted", pending: "Acknowledgement pending", acknowledged: "Acknowledged", framework_off: "—" })[s];

export async function listInstructorDirectory(): Promise<InstructorDirectoryRow[]> {
  const admin = createAdminClient();
  const { data: type } = await admin.from("engagement_types").select("id").eq("slug", "instructor").maybeSingle();
  if (!type) return [];
  const { data: sd } = await admin.from("staff_details").select("id").eq("engagement_type_id", type.id as string);
  const ids = (sd ?? []).map((r) => r.id as string);
  if (ids.length === 0) return [];
  const [{ data: profiles }, { data: onboardings }, { data: agreements }] = await Promise.all([
    admin.from("profiles").select("id, full_name, member_number").in("id", ids),
    admin.from("staff_onboarding").select("id, profile_id, stage, status, created_at").in("profile_id", ids).order("created_at", { ascending: false }),
    admin.from("agreements").select("agreement_reference, status, executed_at, primary_context_reference, created_at").eq("primary_context_type", "instructor_profile").in("primary_context_reference", ids).order("created_at", { ascending: false }),
  ]);
  let adopted: { id: string; body_sha256: string } | null = null;
  const acked = new Set<string>(); const proposed = new Map<string, number>(); const approved = new Map<string, number>();
  if (INSTRUCTOR_FRAMEWORK_ENABLED) {
    const { data: v } = await admin.from("instructor_standards_versions").select("id, body_sha256").eq("applies_to", "independent_instructor").eq("status", "adopted").maybeSingle();
    adopted = (v as { id: string; body_sha256: string } | null) ?? null;
    if (adopted) { const { data: a } = await admin.from("instructor_standards_acknowledgements").select("profile_id").eq("version_id", adopted.id).eq("document_sha256", adopted.body_sha256).in("profile_id", ids); for (const r of a ?? []) acked.add(r.profile_id as string); }
    const { data: sc } = await admin.from("instructor_session_schedules").select("instructor_profile_id, status").in("instructor_profile_id", ids);
    for (const r of sc ?? []) { const m = r.status === "approved" ? approved : r.status === "proposed" ? proposed : null; if (m) m.set(r.instructor_profile_id as string, (m.get(r.instructor_profile_id as string) ?? 0) + 1); }
  }
  const ob = new Map<string, { id: string; stage: string; status: string }>(); for (const o of onboardings ?? []) if (!ob.has(o.profile_id as string)) ob.set(o.profile_id as string, { id: o.id as string, stage: o.stage as string, status: o.status as string });
  const ag = new Map<string, { ref: string; status: string; executed: boolean }>(); for (const a of agreements ?? []) if (!ag.has(a.primary_context_reference as string)) ag.set(a.primary_context_reference as string, { ref: a.agreement_reference as string, status: a.status as string, executed: a.executed_at != null });
  return (profiles ?? []).map((p) => {
    const o = ob.get(p.id as string), a = ag.get(p.id as string);
    return { profileId: p.id as string, name: (p.full_name as string | null) ?? "Instructor", memberNumber: (p.member_number as string | null) ?? null, onboardingId: o?.id ?? null, stage: o?.stage ?? null, onboardingStatus: o?.status ?? null, agreementReference: a?.ref ?? null, agreementStatus: a?.status ?? null, agreementExecuted: a?.executed ?? false,
      standards: !INSTRUCTOR_FRAMEWORK_ENABLED ? "framework_off" : !adopted ? "not_adopted" : acked.has(p.id as string) ? "acknowledged" : "pending", proposedAssignments: proposed.get(p.id as string) ?? 0, approvedAssignments: approved.get(p.id as string) ?? 0 } as InstructorDirectoryRow;
  }).sort((x, y) => x.name.localeCompare(y.name));
}
