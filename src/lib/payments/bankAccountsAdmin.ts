import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";
import { isSuperAdminId } from "@/lib/organization/authority";
import { maskAccountIdentifier, SENSITIVE_ACCOUNT_FIELDS, validateActivation, validateBankAccountInput, type BankAccountInput } from "@/lib/payments/bankTransferRules";

// Governed management of receiving bank accounts. Super Admin only (checked here, not just in the
// UI), every change audited, and the identity fields of a LIVE account can't be edited in place:
// to change them, deactivate and add a new account — historical payments keep the immutable
// snapshot of the account they were told to pay (payments.receiving_account_snapshot) either way.

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

export type BankAccountRecord = {
  id: string;
  country: string;
  currencyCode: string;
  bankName: string;
  beneficiaryName: string;
  accountNumber: string;
  iban: string | null;
  swiftCode: string | null;
  classification: "personal" | "corporate";
  isActive: boolean;
  isDefault: boolean;
  activationConfirmedAt: string | null;
  activationConfirmedBy: string | null;
  activationBasis: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const COLUMNS = "id, country, currency_code, bank_name, account_name, account_number, iban, swift_code, account_classification, is_active, is_default, activation_confirmed_at, activation_confirmed_by, activation_basis, deactivated_at, created_at, updated_at";

type Row = Record<string, unknown>;
function toRecord(r: Row): BankAccountRecord {
  return {
    id: r.id as string, country: r.country as string, currencyCode: r.currency_code as string, bankName: r.bank_name as string, beneficiaryName: r.account_name as string,
    accountNumber: r.account_number as string, iban: (r.iban as string | null) ?? null, swiftCode: (r.swift_code as string | null) ?? null,
    classification: r.account_classification === "personal" ? "personal" : "corporate", isActive: Boolean(r.is_active), isDefault: Boolean(r.is_default),
    activationConfirmedAt: (r.activation_confirmed_at as string | null) ?? null, activationConfirmedBy: (r.activation_confirmed_by as string | null) ?? null,
    activationBasis: (r.activation_basis as string | null) ?? null, deactivatedAt: (r.deactivated_at as string | null) ?? null,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

// Masked copy for the audit log: identity is traceable (bank, beneficiary, last 4) without copying
// the full account number/IBAN into a second place.
function auditView(a: BankAccountRecord) {
  return { country: a.country, currency: a.currencyCode, bank: a.bankName, beneficiary: a.beneficiaryName, account: maskAccountIdentifier(a.accountNumber), iban: maskAccountIdentifier(a.iban), swift: a.swiftCode, classification: a.classification, active: a.isActive, default: a.isDefault };
}

async function requireSuperAdmin(actorUserId: string): Promise<{ ok: false; error: string } | null> {
  return (await isSuperAdminId(actorUserId)) ? null : { ok: false, error: "Only a Super Admin can manage receiving bank accounts." };
}

export async function listBankAccounts(): Promise<BankAccountRecord[]> {
  const { data } = await createAdminClient().from("bank_accounts").select(COLUMNS).order("country").order("created_at", { ascending: false });
  return (data ?? []).map((r) => toRecord(r as Row));
}

async function load(id: string): Promise<BankAccountRecord | null> {
  const { data } = await createAdminClient().from("bank_accounts").select(COLUMNS).eq("id", id).maybeSingle();
  return data ? toRecord(data as Row) : null;
}

export async function listMarketConfigs(): Promise<{ country: string; currency: string; provider: string; isActive: boolean }[]> {
  const { data } = await createAdminClient().from("payment_country_config").select("country, default_currency_code, gateway_provider, is_active").order("country");
  return (data ?? []).map((r) => ({ country: r.country as string, currency: r.default_currency_code as string, provider: r.gateway_provider as string, isActive: Boolean(r.is_active) }));
}

export async function createBankAccount(params: { input: BankAccountInput; actorUserId: string }): Promise<Result<{ id: string }>> {
  const denied = await requireSuperAdmin(params.actorUserId);
  if (denied) return denied;
  const i = normalise(params.input);
  const v = validateBankAccountInput(i);
  if (!v.ok) return v;
  const admin = createAdminClient();
  const { data: currency } = await admin.from("currencies").select("code").eq("code", i.currencyCode).eq("is_active", true).maybeSingle();
  if (!currency) return { ok: false, error: `${i.currencyCode} isn't a supported currency.` };
  const { data, error } = await admin.from("bank_accounts").insert({
    country: i.country, currency_code: i.currencyCode, bank_name: i.bankName, account_name: i.beneficiaryName, account_number: i.accountNumber || i.iban,
    iban: i.iban || null, swift_code: i.swiftCode || null, account_classification: i.classification, is_active: false, is_default: false,
    created_by: params.actorUserId, updated_by: params.actorUserId,
  }).select(COLUMNS).single();
  if (error || !data) return { ok: false, error: "Could not save the bank account. Please try again." };
  const rec = toRecord(data as Row);
  await logActivity({ actorUserId: params.actorUserId, action: "bank_account.created", entityType: "bank_account", entityId: rec.id, metadata: { after: auditView(rec), note: "Created inactive — it receives nothing until activated." } });
  return { ok: true, id: rec.id };
}

function normalise(i: BankAccountInput): BankAccountInput {
  return {
    bankName: i.bankName.trim(), beneficiaryName: i.beneficiaryName.trim(), accountNumber: i.accountNumber.trim(), iban: i.iban.replace(/\s+/g, "").toUpperCase(),
    swiftCode: i.swiftCode.trim().toUpperCase(), currencyCode: i.currencyCode.trim().toUpperCase(), country: i.country.trim().toUpperCase(), classification: i.classification.trim(),
  };
}

export async function updateBankAccount(params: { id: string; input: BankAccountInput; actorUserId: string }): Promise<Result> {
  const denied = await requireSuperAdmin(params.actorUserId);
  if (denied) return denied;
  const before = await load(params.id);
  if (!before) return { ok: false, error: "Bank account not found." };
  if (before.isActive) return { ok: false, error: "A live receiving account can't be edited in place. Deactivate it and add a new account instead — historical payments keep the details they were issued with." };
  const i = normalise(params.input);
  const v = validateBankAccountInput(i);
  if (!v.ok) return v;
  const { error } = await createAdminClient().from("bank_accounts").update({
    country: i.country, currency_code: i.currencyCode, bank_name: i.bankName, account_name: i.beneficiaryName, account_number: i.accountNumber || i.iban,
    iban: i.iban || null, swift_code: i.swiftCode || null, account_classification: i.classification, updated_by: params.actorUserId,
  }).eq("id", params.id).eq("is_active", false);
  if (error) return { ok: false, error: "Could not save the bank account. Please try again." };
  const after = await load(params.id);
  await logActivity({ actorUserId: params.actorUserId, action: "bank_account.updated", entityType: "bank_account", entityId: params.id, metadata: { before: auditView(before), after: after ? auditView(after) : null } });
  return { ok: true };
}

// Activation is the explicit, recorded decision that this account may receive business payments.
export async function activateBankAccount(params: { id: string; basis: string; confirmedPersonalUse: boolean; makeDefault: boolean; actorUserId: string }): Promise<Result> {
  const denied = await requireSuperAdmin(params.actorUserId);
  if (denied) return denied;
  const acct = await load(params.id);
  if (!acct) return { ok: false, error: "Bank account not found." };
  if (acct.isActive) return { ok: false, error: "This account is already active." };
  const admin = createAdminClient();
  const { data: config } = await admin.from("payment_country_config").select("country").eq("country", acct.country).maybeSingle();
  const check = validateActivation({ classification: acct.classification, basis: params.basis, hasIdentifier: Boolean(acct.accountNumber || acct.iban), hasMarketConfig: Boolean(config), confirmedPersonalUse: params.confirmedPersonalUse });
  if (!check.ok) return check;
  const now = new Date().toISOString();
  const { data: updated, error } = await admin.from("bank_accounts").update({
    is_active: true, activation_confirmed_by: params.actorUserId, activation_confirmed_at: now, activation_basis: params.basis.trim(), deactivated_at: null, updated_by: params.actorUserId,
  }).eq("id", params.id).eq("is_active", false).select("id");
  if (error || !updated?.length) return { ok: false, error: "Could not activate the account. Please try again." };
  await logActivity({ actorUserId: params.actorUserId, action: "bank_account.activated", entityType: "bank_account", entityId: params.id, metadata: { account: auditView({ ...acct, isActive: true }), classification: acct.classification, basis: params.basis.trim(), confirmedPersonalUse: acct.classification === "personal" ? params.confirmedPersonalUse : null } });
  if (params.makeDefault) return setDefaultBankAccount({ id: params.id, actorUserId: params.actorUserId });
  return { ok: true };
}

// One default per market+currency: the previous default is demoted first (the partial unique index
// is the backstop), so future Pay Now flows switch to the new account while every earlier payment
// keeps pointing at the account it was issued against.
export async function setDefaultBankAccount(params: { id: string; actorUserId: string }): Promise<Result> {
  const denied = await requireSuperAdmin(params.actorUserId);
  if (denied) return denied;
  const acct = await load(params.id);
  if (!acct) return { ok: false, error: "Bank account not found." };
  if (!acct.isActive) return { ok: false, error: "Only an active account can be the default." };
  if (acct.isDefault) return { ok: true };
  const admin = createAdminClient();
  const { data: previous } = await admin.from("bank_accounts").select("id").eq("country", acct.country).eq("currency_code", acct.currencyCode).eq("is_default", true);
  for (const p of previous ?? []) await admin.from("bank_accounts").update({ is_default: false, updated_by: params.actorUserId }).eq("id", p.id as string);
  const { error } = await admin.from("bank_accounts").update({ is_default: true, updated_by: params.actorUserId }).eq("id", params.id).eq("is_active", true);
  if (error) {
    for (const p of previous ?? []) await admin.from("bank_accounts").update({ is_default: true }).eq("id", p.id as string); // restore
    return { ok: false, error: "Could not change the default account. Nothing was changed." };
  }
  await logActivity({ actorUserId: params.actorUserId, action: "bank_account.default_set", entityType: "bank_account", entityId: params.id, metadata: { market: acct.country, currency: acct.currencyCode, previousDefaultIds: (previous ?? []).map((p) => p.id) } });
  return { ok: true };
}

export async function deactivateBankAccount(params: { id: string; reason: string; actorUserId: string }): Promise<Result<{ openTransfers: number }>> {
  const denied = await requireSuperAdmin(params.actorUserId);
  if (denied) return denied;
  if (params.reason.trim().length < 5) return { ok: false, error: "Record why this account is being deactivated." };
  const acct = await load(params.id);
  if (!acct) return { ok: false, error: "Bank account not found." };
  if (!acct.isActive) return { ok: false, error: "This account is already inactive." };
  const admin = createAdminClient();
  const { error } = await admin.from("bank_accounts").update({ is_active: false, is_default: false, deactivated_at: new Date().toISOString(), updated_by: params.actorUserId }).eq("id", params.id).eq("is_active", true);
  if (error) return { ok: false, error: "Could not deactivate the account. Please try again." };
  const { count } = await admin.from("payments").select("id", { count: "exact", head: true }).eq("receiving_bank_account_id", params.id).in("status", ["pending", "awaiting_verification", "additional_info_required"]);
  await logActivity({ actorUserId: params.actorUserId, action: "bank_account.deactivated", entityType: "bank_account", entityId: params.id, metadata: { account: auditView(acct), reason: params.reason.trim(), openTransfersStillPointingHere: count ?? 0, note: "Historical payments keep the account details they were issued with." } });
  return { ok: true, openTransfers: count ?? 0 };
}

// Whether a market offers Pay Now at all. Enabling a market is a separate, deliberate switch from
// activating an account (both must be on, plus a default account and an exchange rate).
export async function setMarketPaymentsEnabled(params: { country: string; enabled: boolean; actorUserId: string }): Promise<Result> {
  const denied = await requireSuperAdmin(params.actorUserId);
  if (denied) return denied;
  const admin = createAdminClient();
  const { data: cfg } = await admin.from("payment_country_config").select("country, is_active, gateway_provider").eq("country", params.country).maybeSingle();
  if (!cfg) return { ok: false, error: "That market isn't configured." };
  if (params.country === "GH") return { ok: false, error: "The Ghana market is managed with the Paystack configuration, not here." };
  if (Boolean(cfg.is_active) === params.enabled) return { ok: true };
  const { error } = await admin.from("payment_country_config").update({ is_active: params.enabled }).eq("country", params.country);
  if (error) return { ok: false, error: "Could not update the market. Please try again." };
  await logActivity({ actorUserId: params.actorUserId, action: params.enabled ? "payment_market.enabled" : "payment_market.disabled", entityType: "payment_country_config", entityId: params.country, metadata: { market: params.country, provider: cfg.gateway_provider } });
  return { ok: true };
}

// Used by the sensitive-field guard tests and the page copy.
export const LIVE_ACCOUNT_LOCKED_FIELDS = SENSITIVE_ACCOUNT_FIELDS;
