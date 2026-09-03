import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId, hasAuthority, FINANCE_CAPABILITIES } from "@/lib/organization/authority";

// Ordift Organizational & Administrative Architecture V1, Phase 3.3,
// Part G (2026-08-25) — payee payment-instruction foundation, against
// public.payment_instructions. Distinct from public.bank_accounts
// (the business's OWN receiving accounts for inbound collection) —
// this is a real person's OUTBOUND payout details. HIGHLY SENSITIVE:
// account_identifier/routing_identifier are never included in any
// activity_log metadata anywhere in this file, and every read/list
// function here returns the MASKED form by default — callers must
// explicitly ask for the unmasked form via a separate, narrowly-used
// function, never as a side effect of a general list/view.

export type MaskedPaymentInstruction = {
  id: string;
  profileId: string;
  method: string;
  country: string;
  currency: string;
  accountHolderName: string;
  institutionName: string | null;
  maskedAccountIdentifier: string | null;
  verificationStatus: string;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
};

// Exported for unit testing (Phase 3.3, Part M, Test K) — the actual
// masking behavior is what protects unauthorized viewers from seeing
// full account numbers, so it's worth verifying directly rather than
// only through the (DB-dependent, not locally runnable) list function.
export function maskIdentifier(identifier: string | null): string | null {
  if (!identifier) return null;
  const visible = identifier.slice(-4);
  return `${"*".repeat(Math.max(identifier.length - 4, 4))}${visible}`;
}

const MASKED_SELECT =
  "id, profile_id, method, country, currency, account_holder_name, institution_name, account_identifier, verification_status, is_default, active, created_at";

// Always masked — the correct function for any list/browse surface.
export async function listPaymentInstructionsForProfile(profileId: string): Promise<MaskedPaymentInstruction[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("payment_instructions")
    .select(MASKED_SELECT)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[payments] failed to load payment_instructions", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    profileId: r.profile_id,
    method: r.method,
    country: r.country,
    currency: r.currency,
    accountHolderName: r.account_holder_name,
    institutionName: r.institution_name,
    maskedAccountIdentifier: maskIdentifier(r.account_identifier),
    verificationStatus: r.verification_status,
    isDefault: r.is_default,
    active: r.active,
    createdAt: r.created_at,
  }));
}

export type CreatePaymentInstructionParams = {
  profileId: string;
  method: string;
  country: string;
  currency: string;
  accountHolderName: string;
  institutionName?: string | null;
  accountIdentifier?: string | null;
  routingIdentifier?: string | null;
  makeDefault?: boolean;
  actorUserId: string;
};

// Never logs accountIdentifier/routingIdentifier — only that a payment
// instruction was added, for whom, and its method/institution (Part G:
// "Do not store secrets or sensitive financial information in activity
// logs").
export async function createPaymentInstruction(
  params: CreatePaymentInstructionParams
): Promise<{ ok: true; instructionId: string } | { ok: false; error: string }> {
  const admin = createAdminClient();

  if (params.makeDefault) {
    await admin.from("payment_instructions").update({ is_default: false }).eq("profile_id", params.profileId);
  }

  const { data, error } = await admin
    .from("payment_instructions")
    .insert({
      profile_id: params.profileId,
      method: params.method,
      country: params.country,
      currency: params.currency,
      account_holder_name: params.accountHolderName,
      institution_name: params.institutionName ?? null,
      account_identifier: params.accountIdentifier ?? null,
      routing_identifier: params.routingIdentifier ?? null,
      is_default: params.makeDefault ?? false,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[payments] failed to create payment_instruction", error?.message);
    return { ok: false, error: "Failed to save payment instructions." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "payment_instruction.created",
    entityType: "user",
    entityId: params.profileId,
    metadata: { method: params.method, institutionName: params.institutionName ?? null, country: params.country },
  });

  return { ok: true, instructionId: data.id };
}

// Phase 3.4, Part 4 — the real enforcement point for
// finance.payment_instruction.verify (VAULT's capability). Never logs
// the identifier itself, only that a verification decision was made.
export async function verifyPaymentInstruction(params: {
  instructionId: string;
  verified: boolean;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const isSuperAdmin = await isSuperAdminId(params.actorUserId);
  if (!isSuperAdmin) {
    const authorized = await hasAuthority(params.actorUserId, FINANCE_CAPABILITIES.paymentInstructionVerify, null);
    if (!authorized) return { ok: false, error: "Not authorized to verify payment instructions." };
  }

  const admin = createAdminClient();
  const { data: existing } = await admin.from("payment_instructions").select("profile_id").eq("id", params.instructionId).maybeSingle();
  if (!existing) return { ok: false, error: "Payment instruction not found." };

  const { error } = await admin
    .from("payment_instructions")
    .update({ verification_status: params.verified ? "verified" : "rejected" })
    .eq("id", params.instructionId);
  if (error) {
    console.error("[payments] failed to update payment_instruction verification", error.message);
    return { ok: false, error: "Failed to update." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: params.verified ? "payment_instruction.verified" : "payment_instruction.verification_rejected",
    entityType: "user",
    entityId: existing.profile_id,
  });

  return { ok: true };
}

// Update — the missing piece of "add / view masked / update / verify /
// deactivate / replace" (Universal Payables System, 2026-09-03). Any
// material change (including to account_identifier/routing_identifier)
// resets verification_status back to 'unverified' — an edited
// destination has not been re-confirmed, so it must not silently keep
// a prior 'verified' status. Same never-log-the-identifier discipline
// as createPaymentInstruction() above.
export async function updatePaymentInstruction(params: {
  instructionId: string;
  accountHolderName?: string;
  institutionName?: string | null;
  accountIdentifier?: string | null;
  routingIdentifier?: string | null;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("payment_instructions").select("profile_id").eq("id", params.instructionId).maybeSingle();
  if (!existing) return { ok: false, error: "Payment instruction not found." };

  const update: Record<string, unknown> = { verification_status: "unverified" };
  if (params.accountHolderName !== undefined) update.account_holder_name = params.accountHolderName;
  if (params.institutionName !== undefined) update.institution_name = params.institutionName;
  if (params.accountIdentifier !== undefined) update.account_identifier = params.accountIdentifier;
  if (params.routingIdentifier !== undefined) update.routing_identifier = params.routingIdentifier;

  const { error } = await admin.from("payment_instructions").update(update).eq("id", params.instructionId);
  if (error) {
    console.error("[payments] failed to update payment_instruction", error.message);
    return { ok: false, error: "Failed to update." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "payment_instruction.updated",
    entityType: "user",
    entityId: existing.profile_id,
    metadata: { fieldsChanged: Object.keys(update).filter((k) => k !== "verification_status") },
  });

  return { ok: true };
}

export async function setPaymentInstructionActive(params: {
  instructionId: string;
  active: boolean;
  actorUserId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("payment_instructions").select("profile_id").eq("id", params.instructionId).maybeSingle();
  if (!existing) return { ok: false, error: "Payment instruction not found." };

  const { error } = await admin.from("payment_instructions").update({ active: params.active }).eq("id", params.instructionId);
  if (error) {
    console.error("[payments] failed to update payment_instruction status", error.message);
    return { ok: false, error: "Failed to update." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: params.active ? "payment_instruction.reactivated" : "payment_instruction.deactivated",
    entityType: "user",
    entityId: existing.profile_id,
  });

  return { ok: true };
}
