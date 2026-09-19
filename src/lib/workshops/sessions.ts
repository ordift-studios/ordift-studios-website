import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";
import { getWorkshopByIdAdmin } from "@/lib/content/sanity/workshopAdmin";

// Workshop Learning Infrastructure V1 (2026-09-19) — against
// public.workshop_sessions (migration 0138). This is the real, dated,
// timed operational schedule — separate from Sanity workshop.agenda
// (flat, undated marketing copy, Studio-edited, untouched). A simple
// one-day workshop is never required to have any rows here.

export type WorkshopSession = {
  id: string;
  workshopId: string;
  sessionDate: string;
  startTime: string;
  endTime: string | null;
  title: string;
  description: string | null;
  sessionType: string;
  instructorProfileId: string | null;
  locationOverride: string | null;
  internalNotes: string | null;
  participantNotes: string | null;
  sortOrder: number;
  createdAt: string;
};

const SELECT =
  "id, workshop_id, session_date, start_time, end_time, title, description, session_type, instructor_profile_id, location_override, internal_notes, participant_notes, sort_order, created_at";

function mapRow(r: {
  id: string;
  workshop_id: string;
  session_date: string;
  start_time: string;
  end_time: string | null;
  title: string;
  description: string | null;
  session_type: string;
  instructor_profile_id: string | null;
  location_override: string | null;
  internal_notes: string | null;
  participant_notes: string | null;
  sort_order: number;
  created_at: string;
}): WorkshopSession {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    sessionDate: r.session_date,
    startTime: r.start_time,
    endTime: r.end_time,
    title: r.title,
    description: r.description,
    sessionType: r.session_type,
    instructorProfileId: r.instructor_profile_id,
    locationOverride: r.location_override,
    internalNotes: r.internal_notes,
    participantNotes: r.participant_notes,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

export async function listSessionsForWorkshop(workshopId: string): Promise<WorkshopSession[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workshop_sessions")
    .select(SELECT)
    .eq("workshop_id", workshopId)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[workshops] failed to load sessions", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

// A registrant is anyone with a non-cancelled registration for this
// workshop under this profile — the same ownership concept the
// participant portal's "My Workshops" already uses.
async function isRegisteredOnWorkshop(profileId: string, workshopId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("workshop_registrations")
    .select("id", { count: "exact", head: true })
    .eq("workshop_id", workshopId)
    .eq("user_id", profileId)
    .neq("registration_status", "Cancelled");
  return (count ?? 0) > 0;
}

// Participant-safe view — never internal_notes, matching the same
// admin/instructor/participant field-narrowing precedent as
// listRegistrationsForInstructorWorkshop() (registrant email/phone
// stay Admin-only there; internal scheduling notes stay Admin/
// instructor-only here).
export type ParticipantVisibleSession = Omit<WorkshopSession, "internalNotes">;

function toParticipantVisible(s: WorkshopSession): ParticipantVisibleSession {
  return {
    id: s.id,
    workshopId: s.workshopId,
    sessionDate: s.sessionDate,
    startTime: s.startTime,
    endTime: s.endTime,
    title: s.title,
    description: s.description,
    sessionType: s.sessionType,
    instructorProfileId: s.instructorProfileId,
    locationOverride: s.locationOverride,
    participantNotes: s.participantNotes,
    sortOrder: s.sortOrder,
    createdAt: s.createdAt,
  };
}

export async function listSessionsForParticipant(workshopId: string, actorProfileId: string): Promise<ParticipantVisibleSession[]> {
  if (!(await isRegisteredOnWorkshop(actorProfileId, workshopId))) return [];
  return (await listSessionsForWorkshop(workshopId)).map(toParticipantVisible);
}

// Public-facing schedule (2026-09-20) — the real dated/timed session
// list shown on the public /workshops/[slug] page, alongside the
// existing Sanity workshop.agenda (unchanged). No registration gate:
// the workshop itself is already public marketing content at this
// point on the same page (title/dates/venue/capacity), so a genuine
// session's date/time/title/description is the same trust tier, not a
// step up. Narrower than ParticipantVisibleSession — additionally
// drops instructorProfileId (an internal profile id, never surfaced
// to an anonymous visitor) since the page already lists instructors
// by name via Sanity's workshop.instructors.
export type PublicVisibleSession = Omit<ParticipantVisibleSession, "instructorProfileId">;

export async function listSessionsForPublicDisplay(workshopId: string): Promise<PublicVisibleSession[]> {
  const sessions = await listSessionsForWorkshop(workshopId);
  return sessions.map((s) => ({
    id: s.id,
    workshopId: s.workshopId,
    sessionDate: s.sessionDate,
    startTime: s.startTime,
    endTime: s.endTime,
    title: s.title,
    description: s.description,
    sessionType: s.sessionType,
    locationOverride: s.locationOverride,
    participantNotes: s.participantNotes,
    sortOrder: s.sortOrder,
    createdAt: s.createdAt,
  }));
}

export type MyInstructorSession = WorkshopSession & { workshopTitle: string };

// Instructor Calendar (Section G) — every session across every
// workshop this profile is genuinely engaged on, OR any session
// explicitly assigned to them as the per-block instructor (a workshop
// may have several instructors each teaching only some sessions).
// Bounded fan-out — one profile's own sessions only, never the
// company-wide schedule.
export async function listUpcomingSessionsForInstructor(profileId: string, fromDate: string): Promise<MyInstructorSession[]> {
  const admin = createAdminClient();
  const { data: engagements } = await admin.from("workshop_instructor_engagements").select("workshop_id").eq("profile_id", profileId);
  const engagedWorkshopIds = new Set((engagements ?? []).map((e) => e.workshop_id));

  const { data, error } = await admin
    .from("workshop_sessions")
    .select(SELECT)
    .or(`instructor_profile_id.eq.${profileId}${engagedWorkshopIds.size > 0 ? "," + [...engagedWorkshopIds].map((id) => `workshop_id.eq.${id}`).join(",") : ""}`)
    .gte("session_date", fromDate)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) {
    console.error("[workshops] failed to load instructor sessions", error.message);
    return [];
  }

  const sessions = (data ?? []).map(mapRow);
  const withTitles = await Promise.all(
    sessions.map(async (s) => {
      const workshop = await getWorkshopByIdAdmin(s.workshopId);
      return { ...s, workshopTitle: workshop?.title ?? "Unknown workshop" };
    })
  );
  return withTitles;
}

export type SessionConflict = { sessionId: string; sessionTitle: string; workshopId: string; workshopTitle: string; sessionDate: string; startTime: string; endTime: string | null };

// Section E — "same instructor assigned to overlapping sessions."
// Deliberately simple, date+time overlap only (no venue/resource
// architecture invented, per the explicit instruction not to build
// one that doesn't already exist) — two sessions on the same date for
// the same instructor whose [start,end) ranges intersect. A null
// end_time is treated as a zero-length point-in-time check only
// (never assumed to run until midnight), so it can only conflict with
// another session that starts at exactly that same instant.
export async function findInstructorSessionConflicts(
  instructorProfileId: string,
  sessionDate: string,
  startTime: string,
  endTime: string | null,
  excludeSessionId?: string
): Promise<SessionConflict[]> {
  if (!instructorProfileId) return [];
  const admin = createAdminClient();
  let query = admin
    .from("workshop_sessions")
    .select(SELECT)
    .eq("instructor_profile_id", instructorProfileId)
    .eq("session_date", sessionDate);
  if (excludeSessionId) query = query.neq("id", excludeSessionId);
  const { data, error } = await query;
  if (error || !data) return [];

  const newEnd = endTime ?? startTime;
  const overlapping = data.filter((r) => {
    const existingEnd = r.end_time ?? r.start_time;
    return r.start_time < newEnd && startTime < existingEnd;
  });
  if (overlapping.length === 0) return [];

  const withTitles = await Promise.all(
    overlapping.map(async (r) => {
      const workshop = await getWorkshopByIdAdmin(r.workshop_id);
      return {
        sessionId: r.id,
        sessionTitle: r.title,
        workshopId: r.workshop_id,
        workshopTitle: workshop?.title ?? "Unknown workshop",
        sessionDate: r.session_date,
        startTime: r.start_time,
        endTime: r.end_time,
      };
    })
  );
  return withTitles;
}

export type CreateSessionParams = {
  workshopId: string;
  sessionDate: string;
  startTime: string;
  endTime?: string | null;
  title: string;
  description?: string | null;
  sessionType?: string;
  instructorProfileId?: string | null;
  locationOverride?: string | null;
  internalNotes?: string | null;
  participantNotes?: string | null;
  actorUserId: string;
};

export async function createWorkshopSession(params: CreateSessionParams): Promise<{ ok: true; id: string; conflicts: SessionConflict[] } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(params.actorUserId, OPERATIONS_CAPABILITIES.workshopAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage this workshop's schedule." };
  if (!params.title.trim()) return { ok: false, error: "Title is required." };

  const conflicts = params.instructorProfileId
    ? await findInstructorSessionConflicts(params.instructorProfileId, params.sessionDate, params.startTime, params.endTime ?? null)
    : [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workshop_sessions")
    .insert({
      workshop_id: params.workshopId,
      session_date: params.sessionDate,
      start_time: params.startTime,
      end_time: params.endTime ?? null,
      title: params.title.trim(),
      description: params.description ?? null,
      session_type: params.sessionType ?? "session",
      instructor_profile_id: params.instructorProfileId ?? null,
      location_override: params.locationOverride ?? null,
      internal_notes: params.internalNotes ?? null,
      participant_notes: params.participantNotes ?? null,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[workshops] failed to create session", error?.message);
    return { ok: false, error: "Failed to create the session." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "workshop.session.created",
    entityType: "workshop_session",
    entityId: data.id,
    metadata: { workshopId: params.workshopId, actedAsSuperAdminOverride: auth.actedAsOverride },
  });

  return { ok: true, id: data.id, conflicts };
}

export async function deleteWorkshopSession(sessionId: string, workshopId: string, actorUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await authorizeWithSuperAdminOverride(actorUserId, OPERATIONS_CAPABILITIES.workshopAdminister);
  if (!auth.ok) return { ok: false, error: "Not authorized to manage this workshop's schedule." };

  const admin = createAdminClient();
  const { error } = await admin.from("workshop_sessions").delete().eq("id", sessionId).eq("workshop_id", workshopId);
  if (error) return { ok: false, error: "Failed to delete the session." };

  await logActivity({ actorUserId, action: "workshop.session.deleted", entityType: "workshop_session", entityId: sessionId, metadata: { workshopId } });
  return { ok: true };
}
