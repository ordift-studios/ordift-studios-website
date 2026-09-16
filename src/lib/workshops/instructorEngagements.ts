import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, PEOPLE_CAPABILITIES } from "@/lib/organization/authority";
import { getWorkshopByIdAdmin } from "@/lib/content/sanity/workshopAdmin";

// Workshop Management V1, Phase B, Part 16 (2026-08-25) — against
// public.workshop_instructor_engagements. Links a workshop to a real
// internal payee (profile) or an external facilitator name, WITHOUT
// forcing every instructor to become staff, and WITHOUT ever touching
// Sanity's public-facing `instructor` document (no public route reads
// this table). Reuses Phase 3.3's payment_obligations for compensation
// — never a second compensation system.

export type WorkshopInstructorEngagement = {
  id: string;
  workshopId: string;
  profileId: string | null;
  externalPayeeName: string | null;
  role: string;
  agreedCompensationAmount: number | null;
  agreedCompensationCurrency: string | null;
  engagementStatus: string;
  paymentObligationId: string | null;
  notes: string | null;
  createdAt: string;
};

const SELECT =
  "id, workshop_id, profile_id, external_payee_name, role, agreed_compensation_amount, agreed_compensation_currency, engagement_status, payment_obligation_id, notes, created_at";

function mapEngagement(r: {
  id: string;
  workshop_id: string;
  profile_id: string | null;
  external_payee_name: string | null;
  role: string;
  agreed_compensation_amount: number | null;
  agreed_compensation_currency: string | null;
  engagement_status: string;
  payment_obligation_id: string | null;
  notes: string | null;
  created_at: string;
}): WorkshopInstructorEngagement {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    profileId: r.profile_id,
    externalPayeeName: r.external_payee_name,
    role: r.role,
    agreedCompensationAmount: r.agreed_compensation_amount,
    agreedCompensationCurrency: r.agreed_compensation_currency,
    engagementStatus: r.engagement_status,
    paymentObligationId: r.payment_obligation_id,
    notes: r.notes,
    createdAt: r.created_at,
  };
}

export async function listInstructorEngagementsForWorkshop(workshopId: string): Promise<WorkshopInstructorEngagement[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("workshop_instructor_engagements").select(SELECT).eq("workshop_id", workshopId).order("created_at");
  if (error) {
    console.error("[workshops] failed to load instructor engagements", error.message);
    return [];
  }
  return (data ?? []).map(mapEngagement);
}

export type CreateEngagementParams = {
  workshopId: string;
  profileId?: string | null;
  externalPayeeName?: string | null;
  role?: string;
  agreedCompensationAmount?: number | null;
  agreedCompensationCurrency?: string | null;
  notes?: string | null;
  actorUserId: string;
};

// PULSE's real enforcement point (people.workshop_engagement.administer)
// — the auditable Super Admin override pattern applies here: if CHIEF
// creates this without holding the capability, the log records that
// explicitly rather than implying PULSE acted.
export async function createInstructorEngagement(params: CreateEngagementParams): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, PEOPLE_CAPABILITIES.workshopEngagementAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage workshop instructor engagements." };
  if (!params.profileId && !params.externalPayeeName) {
    return { ok: false, error: "Provide either an internal profile or an external payee name." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workshop_instructor_engagements")
    .insert({
      workshop_id: params.workshopId,
      profile_id: params.profileId ?? null,
      external_payee_name: params.externalPayeeName ?? null,
      role: params.role ?? "instructor",
      agreed_compensation_amount: params.agreedCompensationAmount ?? null,
      agreed_compensation_currency: params.agreedCompensationCurrency ?? null,
      notes: params.notes ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[workshops] failed to create instructor engagement", error?.message);
    return { ok: false, error: "Failed to create the engagement." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "workshop.instructor_engagement.created",
    entityType: "workshop_instructor_engagement",
    entityId: data.id,
    metadata: {
      workshopId: params.workshopId,
      role: params.role ?? "instructor",
      actedAsSuperAdminOverride: auth.actedAsOverride,
      normalJurisdiction: PEOPLE_CAPABILITIES.workshopEngagementAdminister,
    },
  });

  return { ok: true, id: data.id };
}

// Creates the linked payment_obligations row (Phase 3.3, reused not
// duplicated) for an engagement's agreed compensation — VAULT's
// eventual approval authority over it is unchanged (approvePaymentObligation()
// still requires finance.payment_obligation.approve or Super Admin).
// Creating this obligation never executes a payout — no PayoutProvider
// exists (unchanged from Phase 3.3).
// Instructor/Facilitator Portal (2026-09-16) — the self-service
// counterpart to listInstructorEngagementsForWorkshop() above: every
// workshop a given profile is genuinely engaged on, joined to the
// real Sanity workshop record (title/status/startDate) for display.
// Bounded fan-out — one profile's own engagement count, never every
// engagement in the system.
export type MyWorkshopEngagement = WorkshopInstructorEngagement & {
  workshopTitle: string;
  workshopStatus: string;
  workshopStartDate: string | null;
};

export async function isWorkshopInstructor(profileId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("workshop_instructor_engagements")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);
  return (count ?? 0) > 0;
}

export async function listEngagementsForInstructor(profileId: string): Promise<MyWorkshopEngagement[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("workshop_instructor_engagements").select(SELECT).eq("profile_id", profileId).order("created_at", { ascending: false });
  if (error) {
    console.error("[workshops] failed to load instructor's own engagements", error.message);
    return [];
  }
  const engagements = (data ?? []).map(mapEngagement);
  const withWorkshops = await Promise.all(
    engagements.map(async (e) => {
      const workshop = await getWorkshopByIdAdmin(e.workshopId);
      return {
        ...e,
        workshopTitle: workshop?.title ?? "Unknown workshop",
        workshopStatus: workshop?.status ?? "unknown",
        workshopStartDate: workshop?.startDate ?? null,
      };
    })
  );
  return withWorkshops;
}

// Confirms the actor is genuinely engaged on this specific workshop
// before returning/mutating anything — the real authorization boundary
// for both listRegistrationsForInstructorWorkshop() and
// updateWorkshopAttendanceAsInstructor() below. Deliberately narrower
// than requireStaffOrAdmin() (the existing /admin/bookings gate): this
// never grants access to any OTHER workshop's registrations, only the
// caller's own assigned one.
async function isEngagedOnWorkshop(profileId: string, workshopId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("workshop_instructor_engagements")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("workshop_id", workshopId);
  return (count ?? 0) > 0;
}

export type InstructorVisibleRegistration = {
  id: string;
  fullName: string;
  registrationStatus: string;
  attendanceStatus: string | null;
};

// Deliberately a minimal field set — an instructor sees enough to take
// attendance (name, registration/attendance status), never a
// registrant's email/phone/payment details, which stay Admin-only
// (see /admin/bookings).
export async function listRegistrationsForInstructorWorkshop(workshopId: string, actorProfileId: string): Promise<InstructorVisibleRegistration[]> {
  if (!(await isEngagedOnWorkshop(actorProfileId, workshopId))) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workshop_registrations")
    .select("id, full_name, registration_status, attendance_status")
    .eq("workshop_id", workshopId)
    .order("full_name", { ascending: true });
  if (error) {
    console.error("[workshops] failed to load registrations for instructor view", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    registrationStatus: r.registration_status,
    attendanceStatus: r.attendance_status,
  }));
}

const INSTRUCTOR_ATTENDANCE_STATUSES = ["checked_in", "no_show"] as const;

export async function updateWorkshopAttendanceAsInstructor(params: {
  registrationId: string;
  workshopId: string;
  attendanceStatus: (typeof INSTRUCTOR_ATTENDANCE_STATUSES)[number];
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isEngagedOnWorkshop(params.actorUserId, params.workshopId))) {
    return { ok: false, error: "You are not engaged as an instructor on this workshop." };
  }
  if (!INSTRUCTOR_ATTENDANCE_STATUSES.includes(params.attendanceStatus)) {
    return { ok: false, error: "Invalid attendance status." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workshop_registrations")
    .update({ attendance_status: params.attendanceStatus })
    .eq("id", params.registrationId)
    .eq("workshop_id", params.workshopId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: "Failed to record attendance." };
  if (!data) return { ok: false, error: "Registration not found for this workshop." };

  await logActivity({
    actorUserId: params.actorUserId,
    action: "workshop.attendance_status.changed",
    entityType: "workshop_registration",
    entityId: params.registrationId,
    metadata: { attendanceStatus: params.attendanceStatus, recordedByInstructor: true },
  });
  return { ok: true };
}

export async function linkEngagementToPaymentObligation(params: {
  engagementId: string;
  actorUserId: string;
}): Promise<{ ok: true; obligationId: string } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, PEOPLE_CAPABILITIES.workshopEngagementAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage workshop instructor engagements." };

  const admin = createAdminClient();
  const { data: engagement } = await admin
    .from("workshop_instructor_engagements")
    .select("profile_id, external_payee_name, role, agreed_compensation_amount, agreed_compensation_currency, workshop_id")
    .eq("id", params.engagementId)
    .maybeSingle();
  if (!engagement) return { ok: false, error: "Engagement not found." };
  if (!engagement.profile_id) {
    return { ok: false, error: "A payment obligation requires a real internal profile — this engagement is with an external payee not yet in the system." };
  }
  if (!engagement.agreed_compensation_amount) {
    return { ok: false, error: "Set an agreed compensation amount first." };
  }

  const { createPaymentObligation } = await import("@/lib/payments/payoutObligations");
  const result = await createPaymentObligation({
    payeeProfileId: engagement.profile_id,
    sourceType: "workshop_instructor",
    sourceReference: engagement.workshop_id,
    description: `Workshop instructor compensation — ${engagement.role}`,
    currency: engagement.agreed_compensation_currency ?? "USD",
    amount: engagement.agreed_compensation_amount,
    actorUserId: params.actorUserId,
  });
  if (!result.ok) return result;

  await admin.from("workshop_instructor_engagements").update({ payment_obligation_id: result.obligationId }).eq("id", params.engagementId);

  return { ok: true, obligationId: result.obligationId };
}
