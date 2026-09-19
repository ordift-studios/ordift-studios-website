import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { authorizeWithSuperAdminOverride, OPERATIONS_CAPABILITIES } from "@/lib/organization/authority";

// Workshop Learning Infrastructure V1 (2026-09-19) — against
// public.workshop_announcements (migration 0138). A lightweight,
// workshop-scoped, persistent read history — deliberately NOT a
// second general messaging system. The existing "Notify Registrants"
// email broadcast (sendWorkshopNoticeAction) remains the email
// delivery mechanism for urgent notices; this table is what
// participants/instructors see inside their own portals.

export type WorkshopAnnouncement = {
  id: string;
  workshopId: string;
  sessionId: string | null;
  title: string;
  message: string;
  createdBy: string;
  createdAt: string;
};

const SELECT = "id, workshop_id, session_id, title, message, created_by, created_at";

function mapRow(r: { id: string; workshop_id: string; session_id: string | null; title: string; message: string; created_by: string; created_at: string }): WorkshopAnnouncement {
  return { id: r.id, workshopId: r.workshop_id, sessionId: r.session_id, title: r.title, message: r.message, createdBy: r.created_by, createdAt: r.created_at };
}

export async function listAnnouncementsForWorkshop(workshopId: string): Promise<WorkshopAnnouncement[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("workshop_announcements").select(SELECT).eq("workshop_id", workshopId).order("created_at", { ascending: false });
  if (error) {
    console.error("[workshops] failed to load announcements", error.message);
    return [];
  }
  return (data ?? []).map(mapRow);
}

async function isEngagedOnWorkshop(profileId: string, workshopId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("workshop_instructor_engagements")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("workshop_id", workshopId);
  return (count ?? 0) > 0;
}

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

export async function listAnnouncementsForInstructor(workshopId: string, actorProfileId: string): Promise<WorkshopAnnouncement[]> {
  if (!(await isEngagedOnWorkshop(actorProfileId, workshopId))) return [];
  return listAnnouncementsForWorkshop(workshopId);
}

export async function listAnnouncementsForParticipant(workshopId: string, actorProfileId: string): Promise<WorkshopAnnouncement[]> {
  if (!(await isRegisteredOnWorkshop(actorProfileId, workshopId))) return [];
  return listAnnouncementsForWorkshop(workshopId);
}

export type CreateAnnouncementParams = {
  workshopId: string;
  sessionId?: string | null;
  title: string;
  message: string;
  actorUserId: string;
};

// Admin OR any instructor genuinely engaged on this workshop may post
// — an instructor announcing a venue change for their own session is
// a legitimate delivery-day need, never a company-wide broadcast
// capability (still scoped to this one workshop_id).
export async function createAnnouncement(params: CreateAnnouncementParams): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const staffAuth = await authorizeWithSuperAdminOverride(params.actorUserId, OPERATIONS_CAPABILITIES.workshopAdminister);
  const authorized = staffAuth.ok || (await isEngagedOnWorkshop(params.actorUserId, params.workshopId));
  if (!authorized) return { ok: false, error: "Not authorized to post announcements for this workshop." };
  if (!params.title.trim() || !params.message.trim()) return { ok: false, error: "Title and message are required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workshop_announcements")
    .insert({
      workshop_id: params.workshopId,
      session_id: params.sessionId ?? null,
      title: params.title.trim(),
      message: params.message.trim(),
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[workshops] failed to create announcement", error?.message);
    return { ok: false, error: "Failed to post the announcement." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "workshop.announcement.created",
    entityType: "workshop_announcement",
    entityId: data.id,
    metadata: { workshopId: params.workshopId, actedAsSuperAdminOverride: staffAuth.ok ? staffAuth.actedAsOverride : false },
  });
  return { ok: true, id: data.id };
}
