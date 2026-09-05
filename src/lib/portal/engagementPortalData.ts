import { createClient } from "@/lib/supabase/server";

// Phase H.1/H.2 (2026-09-04) — self-read data layer for the shared
// External Workforce Portal (contractor/vendor/model relationships),
// covering Universal Payables `engagements` and their linked
// `payment_obligations`. Deliberately mirrors collaboratorData.ts's
// own stated philosophy, not workspace.ts's: every query here relies
// on RLS itself (engagements: read own or staff / payment_obligations:
// read own or super admin, both already live since 0046/0049) as the
// real boundary — the session client only ever returns rows those
// policies allow — with an explicit `.eq("payee_profile_id", userId)`
// added anyway as defense in depth, matching workspace.ts's own
// explicit-filter convention. Uses the session client throughout,
// never the admin client — this file must never be given
// createAdminClient, on purpose.

export type MyEngagement = {
  id: string;
  engagementTypeName: string | null;
  operationalTitleName: string | null;
  roleNote: string | null;
  notes: string | null;
  currency: string | null;
  agreedAmount: number | null;
  dueDate: string | null;
  status: string;
  paymentObligationId: string | null;
  createdAt: string;
};

// Single-FK embeds only (engagement_types/operational_titles each have
// exactly one FK from engagements) — safe via the session client,
// unlike the admin-side profiles embed, which has two FKs and is why
// engagements.ts's own admin-facing reads do a manual join instead.
const MY_ENGAGEMENT_SELECT =
  "id, role_note, notes, currency, agreed_amount, due_date, status, payment_obligation_id, created_at, engagement_types(name), operational_titles(name)";

type RawMyEngagementRow = {
  id: string;
  role_note: string | null;
  notes: string | null;
  currency: string | null;
  agreed_amount: number | null;
  due_date: string | null;
  status: string;
  payment_obligation_id: string | null;
  created_at: string;
  engagement_types: { name: string } | null;
  operational_titles: { name: string } | null;
};

function mapMyEngagement(r: RawMyEngagementRow): MyEngagement {
  return {
    id: r.id,
    engagementTypeName: r.engagement_types?.name ?? null,
    operationalTitleName: r.operational_titles?.name ?? null,
    roleNote: r.role_note,
    notes: r.notes,
    currency: r.currency,
    agreedAmount: r.agreed_amount,
    dueDate: r.due_date,
    status: r.status,
    paymentObligationId: r.payment_obligation_id,
    createdAt: r.created_at,
  };
}

// Phase H.7 (2026-09-05) — H.6 found that a completed engagement simply
// disappeared from the contractor's list (only ever filtered to
// non-terminal statuses) while remaining reachable by direct link. Pure
// projection, no DB — the actual data comes from listMyEngagements()
// above; this only decides how to group what's already been fetched.
// `cancelled` is kept in its own bucket rather than folded into
// `completed` — an engagement that was called off is not equivalent
// history to one that was actually delivered, and presenting them
// identically would misrepresent what happened.
export type EngagementLifecycleGroups = {
  active: MyEngagement[];
  completed: MyEngagement[];
  cancelled: MyEngagement[];
};

export function groupEngagementsByLifecycle(engagements: MyEngagement[]): EngagementLifecycleGroups {
  return {
    active: engagements.filter((e) => e.status !== "completed" && e.status !== "cancelled"),
    completed: engagements.filter((e) => e.status === "completed"),
    cancelled: engagements.filter((e) => e.status === "cancelled"),
  };
}

export async function listMyEngagements(userId: string): Promise<MyEngagement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("engagements")
    .select(MY_ENGAGEMENT_SELECT)
    .eq("payee_profile_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[portal external-workforce] failed to load engagements", error.message);
    return [];
  }
  return ((data ?? []) as unknown as RawMyEngagementRow[]).map(mapMyEngagement);
}

export async function getMyEngagement(engagementId: string, userId: string): Promise<MyEngagement | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("engagements")
    .select(MY_ENGAGEMENT_SELECT)
    .eq("id", engagementId)
    .eq("payee_profile_id", userId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[portal external-workforce] failed to load engagement", error.message);
    return null;
  }
  return mapMyEngagement(data as unknown as RawMyEngagementRow);
}

export type MyPayableStatus = {
  id: string;
  currency: string;
  amount: number;
  status: string;
  paidAt: string | null;
};

export async function getMyPayableStatus(paymentObligationId: string): Promise<MyPayableStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_obligations")
    .select("id, currency, amount, status, paid_at")
    .eq("id", paymentObligationId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[portal external-workforce] failed to load payable status", error.message);
    return null;
  }
  return { id: data.id, currency: data.currency, amount: data.amount, status: data.status, paidAt: data.paid_at };
}

// Instructor-as-contractor (Section 5) — minimum additive, read-safe
// integration. Full workshop title/session date/topic live in Sanity
// (referenced only by the opaque workshop_id text column) and are
// deliberately not resolved here — see the Phase H.1/H.2 report.
export type MyWorkshopInstructorEngagement = {
  id: string;
  workshopId: string;
  role: string;
  agreedCompensationAmount: number | null;
  agreedCompensationCurrency: string | null;
  engagementStatus: string;
  paymentObligationId: string | null;
};

export type EngagementUpdate = {
  id: string;
  authorName: string | null;
  note: string;
  linkUrl: string | null;
  createdAt: string;
};

// Engagement-linked counterpart to collaboratorData.ts's
// getProjectUpdates() — same shape, same RLS-reliance philosophy, using
// the widened entity_type ('engagement') and the has_engagement_access()
// policies added in migration 0051.
export async function getEngagementUpdates(engagementId: string): Promise<EngagementUpdate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_updates")
    .select("id, note, link_url, created_at, profiles(full_name)")
    .eq("entity_type", "engagement")
    .eq("entity_id", engagementId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[portal external-workforce] failed to load engagement updates", error.message);
    return [];
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    authorName: (row.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
    note: row.note,
    linkUrl: row.link_url,
    createdAt: row.created_at,
  }));
}

export async function listMyWorkshopInstructorEngagements(userId: string): Promise<MyWorkshopInstructorEngagement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workshop_instructor_engagements")
    .select("id, workshop_id, role, agreed_compensation_amount, agreed_compensation_currency, engagement_status, payment_obligation_id")
    .eq("profile_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[portal external-workforce] failed to load workshop instructor engagements", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    workshopId: r.workshop_id,
    role: r.role,
    agreedCompensationAmount: r.agreed_compensation_amount,
    agreedCompensationCurrency: r.agreed_compensation_currency,
    engagementStatus: r.engagement_status,
    paymentObligationId: r.payment_obligation_id,
  }));
}
