import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, hasRole, isStaffOrAdmin, isSuperAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { generateRecordId } from "@/lib/shared/recordId";
import { isPlaceholderEmail, placeholderEmailFor } from "@/lib/shared/email/placeholder";
import { linkRecord } from "@/lib/directory/directory";
import { validateStaffEnquiry, type StaffEnquiryInput } from "./staffIntake";

// Staff-recorded enquiries (M1). Server-only.
//
// Records an enquiry a staff member received through WhatsApp, a call, an email or in person. It is the ordinary enquiry row at the ordinary first stage
// (new_lead) and nothing else:
//   * NO email is sent (no acknowledgement, no admin notification, no spreadsheet row), and automatic client emails are switched off for the enquiry unless
//     the staff member explicitly allows them.
//   * NO quotation, amount due, payment, obligation, stage change or booking is created.
//   * Linking to the Client Directory is optional, needs the directory's own authority (Super Admin), and is a separate, logged, human-chosen link.
// The public website form and its notifications are untouched.

type Fail = { ok: false; error: string };

export async function createStaffEnquiry(params: {
  actorUserId: string;
  input: Omit<StaffEnquiryInput, "now">;
  contactId?: string | null;
  organisationId?: string | null;
}): Promise<{ ok: true; id: string; reference: string; linkNote: string | null } | Fail> {
  const user = await getCurrentUser();
  if (!user || user.id !== params.actorUserId || !isStaffOrAdmin(user)) return { ok: false, error: "Not authorised to record enquiries." };

  // Allowing automatic client emails is an explicit decision for an admin: plain staff record the enquiry with emails off, and an admin can switch them on.
  if (params.input.allowStatusEmails && !(hasRole(user, "admin") || isSuperAdmin(user))) {
    return { ok: false, error: "Only an admin can allow automatic status emails. Leave the box unticked; an admin can switch them on later." };
  }

  const checked = validateStaffEnquiry({ ...params.input, now: new Date() });
  if (!checked.ok) return checked;
  const v = checked.value;

  const admin = createAdminClient();
  let reference = "";
  let id: string | null = null;
  for (let attempt = 0; attempt < 2 && !id; attempt++) {
    reference = await generateRecordId("ENQ");
    const { data, error } = await admin
      .from("enquiries")
      .insert({
        reference_number: reference,
        email: v.email ?? placeholderEmailFor(reference),
        full_name: v.fullName,
        service: v.service,
        phone: v.phone,
        crm_stage: "new_lead",
        source_channel: v.channel,
        received_at: v.receivedAtIso,
        created_by: params.actorUserId,
        email_notifications_suppressed: v.suppressEmails,
      })
      .select("id")
      .maybeSingle();
    if (data) id = data.id;
    else if (error && error.code !== "23505") {
      console.error("[enquiry] failed to record a staff enquiry", error.message);
      return { ok: false, error: "Failed to record the enquiry." };
    }
  }
  if (!id) return { ok: false, error: "Failed to allocate an enquiry reference. Please try again." };

  if (v.details) {
    const { error: noteError } = await admin.from("enquiry_notes").insert({ enquiry_id: id, author_user_id: params.actorUserId, note: `Recorded by staff (${v.channel.replace(/_/g, " ")}): ${v.details}`, audience: "internal" });
    if (noteError) console.error("[enquiry] failed to save the intake details note", noteError.message);
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "enquiry.staff_recorded",
    entityType: "enquiry",
    entityId: id,
    metadata: { channel: v.channel, hasEmail: v.email !== null, hasPhone: v.phone !== null, automaticClientEmails: !v.suppressEmails, service: v.service },
  });

  let linkNote: string | null = null;
  if (params.contactId || params.organisationId) {
    const linked = await linkRecord({ subject: { type: "enquiry", id }, contactId: params.contactId ?? null, organisationId: params.organisationId ?? null, actorUserId: params.actorUserId });
    linkNote = linked.ok ? null : `The enquiry was recorded, but it was not linked to the directory: ${linked.error}`;
  }
  return { ok: true, id, reference, linkNote };
}

// Switches automatic client emails on or off for a STAFF-RECORDED enquiry. Admin or Super Admin only, with a reason, audited. It never applies to a website
// enquiry (those keep their established behaviour), and it cannot be switched on for an enquiry with no real email address.
export async function setStaffEnquiryEmailNotifications(params: { enquiryId: string; allow: boolean; reason: string }): Promise<{ ok: true } | Fail> {
  const user = await getCurrentUser();
  if (!user || !(hasRole(user, "admin") || isSuperAdmin(user))) return { ok: false, error: "Only an admin can change automatic client emails." };
  const reason = params.reason.trim();
  if (reason.length < 5) return { ok: false, error: "Say why (at least 5 characters)." };
  const admin = createAdminClient();
  const { data: e } = await admin.from("enquiries").select("created_by, email, email_notifications_suppressed").eq("id", params.enquiryId).maybeSingle();
  if (!e) return { ok: false, error: "Enquiry not found." };
  if (e.created_by === null) return { ok: false, error: "Only an enquiry recorded by staff has this setting. Website enquiries keep their established behaviour." };
  if (params.allow && isPlaceholderEmail(e.email)) return { ok: false, error: "This enquiry has no email address on file, so automatic emails cannot be switched on." };
  const suppress = !params.allow;
  if (e.email_notifications_suppressed === suppress) return { ok: true };
  const { data, error } = await admin.from("enquiries").update({ email_notifications_suppressed: suppress }).eq("id", params.enquiryId).not("created_by", "is", null).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: "Could not change the setting." };
  await logActivity({ actorUserId: user.id, action: params.allow ? "enquiry.client_emails_enabled" : "enquiry.client_emails_disabled", entityType: "enquiry", entityId: params.enquiryId, metadata: { reason } });
  return { ok: true };
}
