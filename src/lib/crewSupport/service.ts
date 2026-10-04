import { createAdminClient } from "@/lib/supabase/admin";
import { generateRecordId } from "@/lib/shared/recordId";
import { productionSendingEnabled } from "@/lib/shared/env";
import { sendEmail } from "@/lib/shared/email/dispatch";
import { buildCrewSupportAcknowledgementEmail, buildCrewSupportAdminNotificationEmail } from "./emails";
import type { CrewSupportDeps, CrewSupportRecord } from "./submit";

// Real dependencies for submitCrewSupportRequest — server-only.
export function realCrewSupportDeps(): CrewSupportDeps {
  return {
    generateReference: () => generateRecordId("CSR"),
    findUserId: async (email) => {
      const { data, error } = await createAdminClient().rpc("find_user_id_by_email", { p_email: email });
      if (error) {
        console.error("[crew-support] find_user_id_by_email failed", error.message);
        return null;
      }
      return (data as string | null) ?? null;
    },
    resolveTitleLabels: async (ids) => {
      const { data, error } = await createAdminClient().from("operational_titles").select("id, name").in("id", ids).eq("active", true);
      if (error) throw new Error(error.message);
      return Object.fromEntries((data ?? []).map((t) => [t.id as string, t.name as string]));
    },
    create: async (request, requirements) => {
      const { data, error } = await createAdminClient().rpc("create_crew_support_request", { p_request: request, p_requirements: requirements });
      if (error || !data) return { ok: false, error: error?.message ?? "insert-failed" };
      return { ok: true, requestId: (data as { request_id: string }).request_id };
    },
  };
}

// Best-effort: the request is already saved, so an email failure is
// logged and never turned into a failed submission (a retry would risk a
// duplicate).
export async function sendCrewSupportNotifications(record: CrewSupportRecord): Promise<void> {
  const ack = buildCrewSupportAcknowledgementEmail(record);
  const ackResult = await sendEmail({ to: record.requesterEmail, ...ack, logPrefix: "[crew-support]", emailType: "crew-support-acknowledgement", referenceNumber: record.referenceNumber });
  if (!ackResult.ok) console.error("[crew-support] acknowledgement email failed", record.referenceNumber, ackResult.error);

  const adminTo = process.env.EMAIL_ADMIN_NOTIFICATION_TO;
  if (!adminTo && productionSendingEnabled()) {
    console.error("[crew-support] EMAIL_ADMIN_NOTIFICATION_TO is not set — cannot notify admin");
    return;
  }
  const internal = buildCrewSupportAdminNotificationEmail(record);
  const adminResult = await sendEmail({ to: adminTo ?? "admin-notification-recipient-not-yet-configured@ordiftstudios.test", ...internal, logPrefix: "[crew-support]", emailType: "crew-support-admin-notification", referenceNumber: record.referenceNumber });
  if (!adminResult.ok) console.error("[crew-support] admin notification failed", record.referenceNumber, adminResult.error);
}
