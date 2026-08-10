"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/portal/roles";
import { isProjectKind, type ProjectKind } from "@/lib/portal/workspace";
import {
  getEnquiryByIdForUser,
  getWorkshopRegistrationByIdForUser,
  type PortalEnquiry,
  type PortalWorkshopRegistration,
} from "@/lib/portal/data";
import { generateRecordId } from "@/lib/shared/recordId";
import { syncProjectRequestToSheets, type ProjectRequestRecord } from "@/lib/projectRequests/sheetsSync";
import {
  sendProjectRequestAcknowledgementEmail,
  sendProjectRequestAdminNotificationEmail,
} from "@/lib/projectRequests/email";
import { checkRateLimit } from "@/lib/shared/rateLimit";

// Client-facing submission only — never touches status/staff_decision
// beyond the column defaults, so nothing a client submits can ever
// auto-apply or self-approve. RLS backs this up (project_requests:
// client insert own) but the app layer never trusts client input for
// anything beyond request_type_id and client_notes regardless.

export async function submitProjectRequestAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const rateLimit = await checkRateLimit(`project-request:${user.id}`);
  if (!rateLimit.allowed) return;

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const requestTypeId = String(formData.get("requestTypeId") ?? "");
  const clientNotes = String(formData.get("clientNotes") ?? "").trim();
  if (!isProjectKind(kind) || !id || !requestTypeId) return;

  const owner = await verifyOwnership(kind, id, user.id);
  if (!owner) return;

  const entityType = kind === "enquiry" ? "enquiry" : "workshop_registration";

  // Best-effort, not required to succeed for the request itself to go
  // through — unlike the public Enquiry/Workshop Registration forms,
  // this is a low-stakes internal action with no user-facing
  // confirmation that quotes the reference number back, so a sequence
  // hiccup shouldn't block a client from submitting a request.
  let referenceNumber: string | null = null;
  try {
    referenceNumber = await generateRecordId("PRJ");
  } catch (err) {
    console.error("[portal] failed to generate project request record id", err);
  }

  const supabase = await createClient();
  const { data: requestType } = await supabase
    .from("request_types")
    .select("label")
    .eq("id", requestTypeId)
    .maybeSingle();

  const { error } = await supabase.from("project_requests").insert({
    entity_type: entityType,
    entity_id: id,
    request_type_id: requestTypeId,
    client_notes: clientNotes || null,
    created_by: user.id,
    reference_number: referenceNumber,
  });
  if (error) {
    console.error("[portal] project request submit failed", error.message);
    return;
  }

  revalidatePath(`/portal/client/projects/${kind}/${id}/requests`);

  const record: ProjectRequestRecord = {
    referenceNumber,
    requestTypeLabel: requestType?.label ?? "Request",
    relatedProjectReference:
      kind === "enquiry"
        ? (owner as PortalEnquiry).referenceNumber
        : (owner as PortalWorkshopRegistration).registrationReference,
    relatedProjectType: kind === "enquiry" ? "Enquiry" : "Workshop Registration",
    clientName: owner.fullName,
    email: owner.email,
    phone: owner.phone,
    clientNotes: clientNotes || null,
    createdAt: new Date().toISOString(),
  };

  // Secondary Sheets copy — fire-and-forget, never blocks the response
  // above (revalidatePath has already run by the time this settles).
  void syncProjectRequestToSheets(record).catch((err) => {
    // syncProjectRequestToSheets already catches its own errors and
    // never rejects — this is a defensive backstop only, mirroring the
    // same pattern used everywhere else best-effort Sheets syncs are
    // fired without awaiting (see src/app/api/enquiry/route.ts).
    console.error("[portal] project request Sheets sync threw unexpectedly", err);
  });

  // Same fire-and-forget reasoning as the Sheets sync above — a client
  // submitting a request from their own authenticated workspace should
  // never wait on (or be blocked by) an email round-trip. Both sends
  // use the shared retry-with-backoff dispatcher
  // (src/lib/shared/email/dispatch.ts), same as Contact Enquiry and
  // Workshop Registration.
  void sendProjectRequestAcknowledgementEmail(record).then((result) => {
    if (!result.ok) {
      console.error("[portal] project request acknowledgement email failed", record.referenceNumber, result.error);
    }
  });
  void sendProjectRequestAdminNotificationEmail(record).then((result) => {
    if (!result.ok) {
      console.error("[portal] project request admin notification failed", record.referenceNumber, result.error);
    }
  });
}

async function verifyOwnership(
  kind: ProjectKind,
  id: string,
  userId: string
): Promise<PortalEnquiry | PortalWorkshopRegistration | null> {
  if (kind === "enquiry") {
    return getEnquiryByIdForUser(id, userId);
  }
  return getWorkshopRegistrationByIdForUser(id, userId);
}
