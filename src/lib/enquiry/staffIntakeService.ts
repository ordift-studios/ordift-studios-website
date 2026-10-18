import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { logActivity } from "@/lib/admin/activityLog";
import { generateRecordId } from "@/lib/shared/recordId";
import { placeholderEmailFor } from "@/lib/shared/email/placeholder";
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
