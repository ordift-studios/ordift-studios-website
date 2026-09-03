"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { createPayeeProfile, setPayeeProfileStatus, validateCreatePayeeProfileInput } from "@/lib/payables/payeeProfiles";
import { createEngagement, setEngagementStatus, createEngagementPayable } from "@/lib/payables/engagements";
import { addPayableItem } from "@/lib/payables/payableItems";
import { addPaymentEvidenceReference, addPaymentEvidenceFile } from "@/lib/payables/paymentEvidence";
import { approvePaymentObligation, recordManualPayment, createPaymentObligation } from "@/lib/payments/payoutObligations";
import { createPaymentInstruction, updatePaymentInstruction, verifyPaymentInstruction, setPaymentInstructionActive } from "@/lib/payments/payeeInstructions";

// Universal Payables System (2026-09-03) — plain FormData server
// actions, matching the established convention already used by
// src/app/admin/workshops/actions.ts. Every function below resolves
// the current user itself (no shared middleware) and delegates all
// authorization to the underlying lib function
// (authorizeWithSuperAdminOverride + the relevant FINANCE_CAPABILITIES
// entry) — this file performs no authorization decision of its own,
// only "is there a session at all".

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
function optStr(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v || null;
}
function num(formData: FormData, key: string): number {
  return Number(formData.get(key) ?? 0) || 0;
}

// Mutation feedback fix (2026-09-04) — root-caused after a real
// Production Add Payee submission (which actually succeeded) gave the
// administrator zero visible signal either way. Previously this was a
// bare void-returning action with only revalidatePath() — no
// navigation, no returned state, nothing for the browser to show.
// Every comparable "create" action elsewhere in this codebase (e.g.
// createWorkshopAction) redirects to the newly created record's own
// page on success; this now does the same — redirect() forces a
// guaranteed fresh render (the new payee genuinely appears in the
// Payees list on any subsequent visit) and IS the success confirmation
// (landing on her own detail page is unambiguous). On failure, no
// redirect happens — the client component (AddPayeeForm.tsx) keeps the
// form mounted with whatever the administrator entered, and displays
// the returned error text via useActionState.
export type CreatePayeeProfileState = { ok: boolean; error?: string } | null;

export async function createPayeeProfileAction(_prevState: CreatePayeeProfileState, formData: FormData): Promise<CreatePayeeProfileState> {
  const profileId = str(formData, "profileId");
  const category = str(formData, "category");
  const inputCheck = validateCreatePayeeProfileInput({ profileId, category });
  if (!inputCheck.ok) return inputCheck;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await createPayeeProfile({
    profileId,
    category,
    operationalTitleId: optStr(formData, "operationalTitleId"),
    companyName: optStr(formData, "companyName"),
    notes: optStr(formData, "notes"),
    actorUserId: user.id,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/admin/payables/payees");
  redirect(`/admin/payables/payees/${profileId}`);
}

export async function setPayeeProfileStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const payeeProfileId = str(formData, "payeeProfileId");
  const status = str(formData, "status") as "active" | "inactive" | "suspended";
  if (!payeeProfileId || !status) return;

  const result = await setPayeeProfileStatus({ payeeProfileId, status, actorUserId: user.id });
  if (!result.ok) console.error("[admin payables] setPayeeProfileStatus failed", result.error);

  revalidatePath(`/admin/payables/payees/${payeeProfileId}`);
}

// Mutation feedback (2026-09-04) — same useActionState pattern as
// createPayeeProfileAction/AddPayeeForm.tsx: typed return state instead
// of void, so PaymentDestinationForm.tsx (shared between this admin
// context and the self-service portal) can show a real success
// confirmation or an inline error with the entered values preserved,
// instead of the silent no-op the original Add Payee action had.
export type PaymentDestinationState = { ok: boolean; error?: string } | null;

export async function createPaymentInstructionAction(_prevState: PaymentDestinationState, formData: FormData): Promise<PaymentDestinationState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const profileId = str(formData, "profileId");
  const method = str(formData, "method");
  const country = str(formData, "country");
  const currency = str(formData, "currency");
  const accountHolderName = str(formData, "accountHolderName");
  if (!profileId) return { ok: false, error: "Missing account — please reload the page." };

  const result = await createPaymentInstruction({
    profileId,
    method,
    country,
    currency,
    accountHolderName,
    institutionName: optStr(formData, "institutionName"),
    accountIdentifier: optStr(formData, "accountIdentifier"),
    routingIdentifier: optStr(formData, "routingIdentifier"),
    makeDefault: formData.get("makeDefault") === "on",
    actorUserId: user.id,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/admin/payables/payees/${profileId}`);
  revalidatePath("/portal/payment-details");
  return { ok: true };
}

export async function updatePaymentInstructionAction(_prevState: PaymentDestinationState, formData: FormData): Promise<PaymentDestinationState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const instructionId = str(formData, "instructionId");
  const profileId = str(formData, "profileId");
  if (!instructionId) return { ok: false, error: "Missing destination — please reload the page." };

  const result = await updatePaymentInstruction({
    instructionId,
    accountHolderName: optStr(formData, "accountHolderName") ?? undefined,
    institutionName: optStr(formData, "institutionName"),
    accountIdentifier: optStr(formData, "accountIdentifier"),
    routingIdentifier: optStr(formData, "routingIdentifier"),
    actorUserId: user.id,
  });
  if (!result.ok) return { ok: false, error: result.error };

  if (profileId) revalidatePath(`/admin/payables/payees/${profileId}`);
  revalidatePath("/portal/payment-details");
  return { ok: true };
}

export async function verifyPaymentInstructionAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const instructionId = str(formData, "instructionId");
  const profileId = str(formData, "profileId");
  const verified = formData.get("verified") === "true";
  if (!instructionId) return;

  const result = await verifyPaymentInstruction({ instructionId, verified, actorUserId: user.id });
  if (!result.ok) console.error("[admin payables] verifyPaymentInstruction failed", result.error);

  if (profileId) revalidatePath(`/admin/payables/payees/${profileId}`);
}

export async function setPaymentInstructionActiveAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const instructionId = str(formData, "instructionId");
  const profileId = str(formData, "profileId");
  const active = formData.get("active") === "true";
  if (!instructionId) return;

  const result = await setPaymentInstructionActive({ instructionId, active, actorUserId: user.id });
  if (!result.ok) console.error("[admin payables] setPaymentInstructionActive failed", result.error);

  if (profileId) revalidatePath(`/admin/payables/payees/${profileId}`);
}

export async function createEngagementAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const payeeProfileId = optStr(formData, "payeeProfileId");
  const externalPayeeName = optStr(formData, "externalPayeeName");
  if (!payeeProfileId && !externalPayeeName) return;

  const result = await createEngagement({
    payeeProfileId,
    externalPayeeName,
    engagementTypeId: optStr(formData, "engagementTypeId"),
    operationalTitleId: optStr(formData, "operationalTitleId"),
    roleNote: optStr(formData, "roleNote"),
    currency: optStr(formData, "currency"),
    agreedAmount: formData.get("agreedAmount") ? num(formData, "agreedAmount") : null,
    startsAt: optStr(formData, "startsAt"),
    endsAt: optStr(formData, "endsAt"),
    dueDate: optStr(formData, "dueDate"),
    notes: optStr(formData, "notes"),
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin payables] createEngagement failed", result.error);

  if (payeeProfileId) revalidatePath(`/admin/payables/payees/${payeeProfileId}`);
  revalidatePath("/admin/payables");
}

export async function setEngagementStatusAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const engagementId = str(formData, "engagementId");
  const status = str(formData, "status") as Parameters<typeof setEngagementStatus>[0]["status"];
  const payeeProfileId = optStr(formData, "payeeProfileId");
  if (!engagementId || !status) return;

  const result = await setEngagementStatus({ engagementId, status, actorUserId: user.id });
  if (!result.ok) console.error("[admin payables] setEngagementStatus failed", result.error);

  if (payeeProfileId) revalidatePath(`/admin/payables/payees/${payeeProfileId}`);
}

export async function createEngagementPayableAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const engagementId = str(formData, "engagementId");
  const description = str(formData, "description");
  const payeeProfileId = optStr(formData, "payeeProfileId");
  if (!engagementId || !description) return;

  const result = await createEngagementPayable({ engagementId, description, actorUserId: user.id });
  if (!result.ok) console.error("[admin payables] createEngagementPayable failed", result.error);

  if (payeeProfileId) revalidatePath(`/admin/payables/payees/${payeeProfileId}`);
  revalidatePath("/admin/payables");
}

// Standalone Payable creation (no linked engagement) — e.g. a one-off
// payment not tied to a tracked engagement. Reuses createPaymentObligation()
// directly, exactly as createEngagementPayable() does.
export async function createStandalonePayableAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const payeeProfileId = str(formData, "payeeProfileId");
  const description = str(formData, "description");
  const currency = str(formData, "currency");
  const amount = num(formData, "amount");
  if (!payeeProfileId || !description || !currency || amount <= 0) return;

  const result = await createPaymentObligation({
    payeeProfileId,
    sourceType: "manual",
    description,
    currency,
    amount,
    actorUserId: user.id,
  });
  if (!result.ok) console.error("[admin payables] createStandalonePayable failed", result.error);

  revalidatePath(`/admin/payables/payees/${payeeProfileId}`);
  revalidatePath("/admin/payables");
}

export async function addPayableItemAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const paymentObligationId = str(formData, "paymentObligationId");
  const kind = str(formData, "kind");
  const description = str(formData, "description");
  const amount = num(formData, "amount");
  if (!paymentObligationId || !kind || !description || amount <= 0) return;

  const result = await addPayableItem({ paymentObligationId, kind, description, amount, actorUserId: user.id });
  if (!result.ok) console.error("[admin payables] addPayableItem failed", result.error);

  revalidatePath(`/admin/payables/${paymentObligationId}`);
}

export async function approvePayableAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const obligationId = str(formData, "obligationId");
  if (!obligationId) return;

  const result = await approvePaymentObligation({ obligationId, actorUserId: user.id });
  if (!result.ok) console.error("[admin payables] approvePaymentObligation failed", result.error);

  revalidatePath(`/admin/payables/${obligationId}`);
  revalidatePath("/admin/payables");
}

export async function recordManualPaymentAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const obligationId = str(formData, "obligationId");
  const method = str(formData, "method");
  const amount = num(formData, "amount");
  const currency = str(formData, "currency");
  const paidAt = str(formData, "paidAt");
  const reference = str(formData, "reference");
  if (!obligationId || !method || amount <= 0 || !currency || !paidAt || !reference) return;

  const result = await recordManualPayment({ obligationId, method, amount, currency, paidAt, reference, actorUserId: user.id });
  if (!result.ok) console.error("[admin payables] recordManualPayment failed", result.error);

  revalidatePath(`/admin/payables/${obligationId}`);
  revalidatePath("/admin/payables");
}

export async function addPaymentEvidenceAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;

  const paymentObligationId = str(formData, "paymentObligationId");
  const evidenceType = str(formData, "evidenceType");
  const reference = optStr(formData, "reference");
  const notes = optStr(formData, "notes");
  const file = formData.get("file");
  if (!paymentObligationId || !evidenceType) return;

  const result =
    file instanceof File && file.size > 0
      ? await addPaymentEvidenceFile({ paymentObligationId, evidenceType, file, reference, notes, actorUserId: user.id })
      : await addPaymentEvidenceReference({ paymentObligationId, evidenceType, reference, notes, actorUserId: user.id });
  if (!result.ok) console.error("[admin payables] addPaymentEvidence failed", result.error);

  revalidatePath(`/admin/payables/${paymentObligationId}`);
}
