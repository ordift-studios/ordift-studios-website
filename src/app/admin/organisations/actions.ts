"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/portal/roles";
import { closeApplication, confirmApproval, discardApprovalEmail, recordApplication, submitApprovalEmail } from "@/lib/organisations/registry";
import { actionFail, actionOk, type ActionState } from "@/lib/shared/actionState";

// Organisation registry — thin Server Action wrappers (same pattern as the partnerships actions): resolve the actor, call the
// governed lib function, which re-checks authorisation itself and writes the audit log, then revalidate. Nothing here reads a
// mailbox, sends an email, or touches a booking, invoice, payable or payment.

async function actor() {
  const user = await getCurrentUser();
  return user ? { id: user.id } : null;
}

export async function recordApplicationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const result = await recordApplication({
    organisationName: String(formData.get("organisationName") ?? ""),
    contactDomain: (formData.get("contactDomain") as string) || null,
    reference: (formData.get("reference") as string) || null,
    submittedOn: String(formData.get("submittedOn") ?? ""),
    notes: (formData.get("notes") as string) || null,
    actorUserId: user.id,
  });
  if (!result.ok) return actionFail(result.error);
  revalidatePath("/admin/organisations/applications");
  return actionOk("Application recorded.");
}

export async function submitApprovalEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const applicationId = String(formData.get("applicationId") ?? "");
  if (!applicationId) return actionFail("Missing application.");
  const result = await submitApprovalEmail({
    applicationId,
    rawText: String(formData.get("rawText") ?? ""),
    senderAddress: (formData.get("senderAddress") as string) || null,
    actorUserId: user.id,
  });
  if (!result.ok) return actionFail(result.error);
  revalidatePath(`/admin/organisations/applications/${applicationId}`);
  revalidatePath("/admin/organisations/applications");
  return actionOk("Email attached. Review how it matches below, then confirm or set it aside. Nothing has been approved yet.");
}

export async function discardApprovalEmailAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const applicationId = String(formData.get("applicationId") ?? "");
  const result = await discardApprovalEmail({ applicationId, actorUserId: user.id });
  if (!result.ok) return actionFail(result.error);
  revalidatePath(`/admin/organisations/applications/${applicationId}`);
  revalidatePath("/admin/organisations/applications");
  return actionOk("Email set aside. The application is open again.");
}

export async function confirmApprovalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const applicationId = String(formData.get("applicationId") ?? "");
  const choice = String(formData.get("organisationChoice") ?? "");
  const organisationChoice =
    choice === "__new__"
      ? ({ kind: "new", name: String(formData.get("newName") ?? ""), domain: (formData.get("newDomain") as string) || null } as const)
      : ({ kind: "existing", organisationId: choice } as const);
  if (!applicationId || !choice) return actionFail("Choose the organisation.");
  const result = await confirmApproval({
    applicationId,
    organisationChoice,
    acknowledgedReview: formData.get("acknowledgedReview") === "on",
    confirmedDistinct: formData.get("confirmedDistinct") === "on",
    note: String(formData.get("note") ?? ""),
    actorUserId: user.id,
  });
  if (!result.ok) return actionFail(result.error);
  revalidatePath(`/admin/organisations/applications/${applicationId}`);
  revalidatePath("/admin/organisations/applications");
  revalidatePath("/admin/organisations");
  return actionOk(result.created ? "Approval confirmed. The organisation was registered as a client." : "Approval confirmed. The organisation's client record was updated.");
}

export async function closeApplicationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await actor();
  if (!user) return actionFail("You must be signed in.");
  const applicationId = String(formData.get("applicationId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  if (outcome !== "declined" && outcome !== "withdrawn") return actionFail("Unknown outcome.");
  const result = await closeApplication({ applicationId, outcome, actorUserId: user.id });
  if (!result.ok) return actionFail(result.error);
  revalidatePath(`/admin/organisations/applications/${applicationId}`);
  revalidatePath("/admin/organisations/applications");
  return actionOk(outcome === "declined" ? "Application marked declined." : "Application marked withdrawn.");
}
