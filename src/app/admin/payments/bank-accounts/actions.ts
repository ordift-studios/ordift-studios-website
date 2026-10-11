"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { activateBankAccount, createBankAccount, deactivateBankAccount, setDefaultBankAccount, setMarketPaymentsEnabled, updateBankAccount } from "@/lib/payments/bankAccountsAdmin";
import { actionFail, actionOk, runAction, type ActionState } from "@/lib/shared/actionState";

// Receiving bank accounts: Super Admin only, re-checked here AND inside the library functions.
async function superAdmin() {
  const user = await getCurrentUser();
  return user && isSuperAdmin(user) && hasCapability(user, PAYMENT_CAPABILITIES, "manage_bank_accounts") ? user : null;
}
const DENIED = "Only a Super Admin can manage receiving bank accounts.";
const t = (f: FormData, k: string) => String(f.get(k) ?? "");
const refresh = () => revalidatePath("/admin/payments/bank-accounts");
const accountInput = (f: FormData) => ({
  bankName: t(f, "bankName"), beneficiaryName: t(f, "beneficiaryName"), accountNumber: t(f, "accountNumber"), iban: t(f, "iban"),
  swiftCode: t(f, "swiftCode"), currencyCode: t(f, "currencyCode"), country: t(f, "country"), classification: t(f, "classification"),
});

export async function createBankAccountAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await superAdmin();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await createBankAccount({ input: accountInput(f), actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh();
    return actionOk("Bank account saved as INACTIVE. It receives nothing until you activate it.");
  }, "save bank account");
}

export async function updateBankAccountAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await superAdmin();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await updateBankAccount({ id: t(f, "id"), input: accountInput(f), actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh();
    return actionOk("Bank account updated.");
  }, "update bank account");
}

export async function activateBankAccountAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await superAdmin();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await activateBankAccount({ id: t(f, "id"), basis: t(f, "basis"), confirmedPersonalUse: f.get("confirmedPersonalUse") === "on", makeDefault: f.get("makeDefault") === "on", actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh();
    return actionOk("Account activated. Clients in this market are only offered it once the market is also enabled and an exchange rate exists.");
  }, "activate bank account");
}

export async function setDefaultBankAccountAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await superAdmin();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await setDefaultBankAccount({ id: t(f, "id"), actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh();
    return actionOk("Default receiving account changed for new payments. Earlier payments keep the account they were issued with.");
  }, "set default bank account");
}

export async function deactivateBankAccountAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await superAdmin();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const r = await deactivateBankAccount({ id: t(f, "id"), reason: t(f, "reason"), actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh();
    return actionOk(r.openTransfers > 0 ? `Account deactivated. ${r.openTransfers} open transfer(s) still point at it and can still be verified against it.` : "Account deactivated. Historical payments keep the details they were issued with.");
  }, "deactivate bank account");
}

export async function setMarketPaymentsAction(_p: ActionState, f: FormData): Promise<ActionState> {
  const user = await superAdmin();
  if (!user) return actionFail(DENIED);
  return runAction(async () => {
    const enabled = t(f, "enabled") === "true";
    const r = await setMarketPaymentsEnabled({ country: t(f, "country"), enabled, actorUserId: user.id });
    if (!r.ok) return actionFail(r.error);
    refresh();
    return actionOk(enabled ? "Market enabled." : "Market disabled — clients there are no longer offered Pay Now by bank transfer.");
  }, "update market");
}
