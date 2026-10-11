import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  VERIFICATION_ERRORS, assessReceived, bankTransferStatusLabel, buildReceivingSnapshot, canSubmitProof, describeVerificationError, isPlausibleIban,
  maskAccountIdentifier, transferInstructions, validateActivation, validateBankAccountInput, validateVerificationInput, type VerificationInput,
} from "./bankTransferRules";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const expected = { expectedAmount: 1000.1, expectedCurrency: "QAR", expectedReferenceUsd: 274.73, exchangeRate: 3.64 };

describe("assessReceived — what approving would credit", () => {
  it("an exact transfer credits the requested USD", () => {
    expect(assessReceived({ ...expected, receivedAmount: 1000.1, receivedCurrency: "QAR" })).toEqual({ kind: "exact", creditedUsd: 274.73, excess: 0 });
  });
  it("a part payment credits only what arrived, at the locked rate, and reports the shortfall", () => {
    const r = assessReceived({ ...expected, receivedAmount: 500, receivedCurrency: "QAR" });
    expect(r).toEqual({ kind: "partial", creditedUsd: 137.36, shortfall: 500.1 });
  });
  it("more than requested credits only the requested USD and surfaces the excess (never silently credited)", () => {
    expect(assessReceived({ ...expected, receivedAmount: 1100.1, receivedCurrency: "QAR" })).toEqual({ kind: "excess", creditedUsd: 274.73, excess: 100 });
  });
  it("a different currency can never be approved", () => {
    expect(assessReceived({ ...expected, receivedAmount: 274.73, receivedCurrency: "USD" })).toEqual({ kind: "currency_mismatch", expectedCurrency: "QAR", receivedCurrency: "USD" });
  });
  it("rounding noise below half a unit of the smallest denomination is still an exact match", () => {
    expect(assessReceived({ ...expected, receivedAmount: 1000.1004, receivedCurrency: "QAR" }).kind).toBe("exact");
  });
});

describe("validateVerificationInput — a receipt alone is never enough", () => {
  const ok: VerificationInput = { decision: "approved", receivedAmount: 1000.1, receivedCurrency: "QAR", bankReference: "CBQ-884213", receivedDate: "2026-10-12", independentCheck: true, internalNotes: "", clientMessage: "", acknowledgeExcess: false };
  const today = "2026-10-12";
  it("accepts a complete approval", () => expect(validateVerificationInput(ok, today)).toEqual({ ok: true, decision: "approved" }));
  it("requires the independent-bank-check confirmation", () => {
    const r = validateVerificationInput({ ...ok, independentCheck: false }, today);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/independently checked/);
  });
  it("requires an amount, currency, bank reference and a real, non-future receipt date", () => {
    expect(validateVerificationInput({ ...ok, receivedAmount: null }, today).ok).toBe(false);
    expect(validateVerificationInput({ ...ok, receivedAmount: 0 }, today).ok).toBe(false);
    expect(validateVerificationInput({ ...ok, receivedCurrency: "qar" }, today).ok).toBe(false);
    expect(validateVerificationInput({ ...ok, bankReference: "x" }, today).ok).toBe(false);
    expect(validateVerificationInput({ ...ok, receivedDate: "" }, today).ok).toBe(false);
    expect(validateVerificationInput({ ...ok, receivedDate: "2026-10-20" }, today).ok).toBe(false);
    expect(validateVerificationInput({ ...ok, receivedDate: "2026-10-13" }, today).ok).toBe(true); // Qatar is UTC+3
  });
  it("a rejection needs a reason; an information request needs a message", () => {
    expect(validateVerificationInput({ ...ok, decision: "rejected", internalNotes: "" }, today).ok).toBe(false);
    expect(validateVerificationInput({ ...ok, decision: "rejected", internalNotes: "No credit seen" }, today).ok).toBe(true);
    expect(validateVerificationInput({ ...ok, decision: "info_requested", clientMessage: "" }, today).ok).toBe(false);
    expect(validateVerificationInput({ ...ok, decision: "info_requested", clientMessage: "Please send the full statement line" }, today).ok).toBe(true);
    expect(validateVerificationInput({ ...ok, decision: "maybe" }, today).ok).toBe(false);
  });
});

describe("status vocabulary", () => {
  it("maps the stored statuses to the Founder's wording", () => {
    expect(bankTransferStatusLabel("pending")).toBe("Awaiting Transfer");
    expect(bankTransferStatusLabel("awaiting_verification")).toBe("Proof Submitted — Awaiting Verification");
    expect(bankTransferStatusLabel("additional_info_required")).toBe("Additional Information Required");
    expect(bankTransferStatusLabel("completed")).toBe("Verified");
    expect(bankTransferStatusLabel("rejected")).toBe("Rejected");
  });
  it("the client may (re)submit proof only while awaiting transfer, rejected or info is required", () => {
    for (const s of ["pending", "rejected", "additional_info_required"]) expect(canSubmitProof(s)).toBe(true);
    for (const s of ["awaiting_verification", "completed", "failed", "refunded"]) expect(canSubmitProof(s)).toBe(false);
  });
});

describe("bank account governance rules", () => {
  const good = { bankName: "Commercial Bank of Qatar", beneficiaryName: "Test Beneficiary", accountNumber: "", iban: "QA58DOHB00001234567890ABCDEFG", swiftCode: "CBQAQAQA", currencyCode: "QAR", country: "QA", classification: "corporate" };
  it("validates a complete account and rejects an invalid IBAN", () => {
    expect(validateBankAccountInput(good).ok).toBe(true);
    expect(validateBankAccountInput({ ...good, iban: "QA00DOHB00001234567890ABCDEFG" }).ok).toBe(false);
    expect(validateBankAccountInput({ ...good, classification: "other" }).ok).toBe(false);
    expect(validateBankAccountInput({ ...good, iban: "", accountNumber: "" }).ok).toBe(false);
  });
  it("IBAN mod-97 check", () => {
    expect(isPlausibleIban("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(isPlausibleIban("QA58DOHB00001234567890ABCDEFG")).toBe(true);
    expect(isPlausibleIban("GB82WEST12345698765433")).toBe(false);
  });
  it("activation needs a recorded basis, and a personal account additionally needs the explicit eligibility confirmation", () => {
    const base = { classification: "personal", basis: "Bank confirmed in writing on 2026-10-14 that personal receipts for business are permitted", hasIdentifier: true, hasMarketConfig: true, confirmedPersonalUse: true };
    expect(validateActivation(base).ok).toBe(true);
    expect(validateActivation({ ...base, confirmedPersonalUse: false }).ok).toBe(false);
    expect(validateActivation({ ...base, basis: "ok" }).ok).toBe(false);
    expect(validateActivation({ ...base, hasMarketConfig: false }).ok).toBe(false);
    expect(validateActivation({ ...base, classification: "corporate", confirmedPersonalUse: false }).ok).toBe(true);
  });
  it("masks identifiers and freezes a snapshot with a capture time", () => {
    expect(maskAccountIdentifier("QA58DOHB00001234567890ABCDEFG")).toMatch(/DEFG$/);
    expect(maskAccountIdentifier(null)).toBe("—");
    const snap = buildReceivingSnapshot({ bankAccountId: "b", bankName: "CBQ", beneficiaryName: "X", accountNumber: "1", iban: null, swiftCode: null, currencyCode: "QAR", country: "QA", classification: "corporate" }, new Date("2026-10-12T00:00:00Z"));
    expect(snap.capturedAt).toBe("2026-10-12T00:00:00.000Z");
  });
  it("client instructions state the exact amount, the reference and the currency rule", () => {
    const lines = transferInstructions({ reference: "PAY-2026-000001", amount: 1000.1, currency: "QAR" }).join(" ");
    expect(lines).toContain("QAR 1000.10");
    expect(lines).toContain("PAY-2026-000001");
    expect(lines).toMatch(/only confirmed once we see the money/);
  });
});

describe("error mapping stays in step with the database function", () => {
  const sql = read("supabase/migrations/0151_direct_bank_transfer.sql");
  it("every exception code the function raises has a plain-language message", () => {
    const codes = [...sql.matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(10);
    for (const c of codes) expect(VERIFICATION_ERRORS[c], `missing message for ${c}`).toBeTruthy();
  });
  it("an unknown database error never leaks internals", () => {
    expect(describeVerificationError('relation "x" does not exist')).toMatch(/Nothing was changed/);
    expect(describeVerificationError("P0001: would_overpay_receivable")).toMatch(/exceed what the receivable/);
  });
});

describe("wiring and security (source assertions)", () => {
  const actions = read("src/app/admin/payments/verificationActions.ts");
  const verification = strip(read("src/lib/payments/bankTransferVerification.ts"));
  const route = read("src/app/api/payments/bank-transfer/proof/route.ts");
  const bankAdmin = strip(read("src/lib/payments/bankAccountsAdmin.ts"));
  const bankActions = read("src/app/admin/payments/bank-accounts/actions.ts");
  const adminActions = strip(read("src/app/admin/payments/actions.ts"));
  const sql = read("supabase/migrations/0151_direct_bank_transfer.sql");

  it("only Super Admin or the explicit finance grant can verify — never a role — in the action, the proof route, the review panel and the database function", () => {
    expect(actions).toContain("canVerifyBankTransfers(user.id)");
    expect(actions).not.toMatch(/hasCapability|canAccessPaymentsAdmin/);
    expect(read("src/app/admin/payments/[id]/proof/route.ts")).toContain("canVerifyBankTransfers(user.id)");
    expect(read("src/app/admin/payments/BankTransferReview.tsx")).toContain("if (!canVerify)");
    const access = read("src/lib/payments/bankTransferAccess.ts");
    expect(access).toContain("isSuperAdminId(profileId)");
    expect(access).toContain("FINANCE_CAPABILITIES.bankTransferVerify");
    expect(read("src/lib/organization/authority.ts")).toContain('bankTransferVerify: "finance.bank_transfer.verify"');
    expect(sql).toMatch(/if p_verifier is null or not private\.can_verify_bank_transfers\(p_verifier\) then raise exception 'verifier_not_authorized'/);
    expect(sql).toMatch(/revoke all on function private\.can_verify_bank_transfers\(uuid\) from public, anon, authenticated, service_role/);
    expect(sql).toMatch(/g\.authority = 'finance\.bank_transfer\.verify' and g\.scope_department_id is null\s+and g\.revoked_at is null/);
  });
  it("the database function is the only writer of verification outcomes", () => {
    expect(verification).toContain('admin.rpc("verify_bank_transfer_payment"');
    expect(verification).not.toMatch(/from\("payments"\)\s*\.update/); // status/amounts are never written from application code
  });
  it("the one-click approve/reject actions that credited the requested amount are gone", () => {
    expect(adminActions).not.toContain("export async function approveBankTransferAction");
    expect(adminActions).not.toContain("export async function rejectBankTransferAction");
  });
  it("uploading proof can only move a payment to awaiting_verification — never to completed", () => {
    expect(route).toContain('status: "awaiting_verification"');
    expect(route).not.toMatch(/status:\s*"completed"/);
    expect(route).toContain("canSubmitProof(payment.status");
  });
  it("the payment market and receiving account are resolved server-side, not from the request body", () => {
    expect(route).toContain("getEntityPaymentCountry(entityType, body.entityId)");
    expect(route).not.toMatch(/eq\("country", body\.country\)/);
    expect(route).toContain("getActiveBankAccount(country)");
    expect(route).toContain("receiving_account_snapshot: snapshot");
  });
  it("Qatar is never routed through the Ghana gateway", () => {
    expect(read("src/lib/payments/checkoutService.ts")).toContain("gateway-not-available-for-market");
    expect(sql).toMatch(/'QA', 'QAR', 'bank_transfer', false/);
  });
  it("bank accounts: Super Admin only in the action and again in the library, every change audited, live accounts not editable in place", () => {
    expect(bankActions).toContain("isSuperAdmin(user)");
    expect(bankAdmin.match(/requireSuperAdmin\(params\.actorUserId\)/g)?.length).toBeGreaterThanOrEqual(6);
    for (const a of ["bank_account.created", "bank_account.updated", "bank_account.activated", "bank_account.default_set", "bank_account.deactivated"]) expect(bankAdmin).toContain(a);
    expect(bankAdmin).toContain("A live receiving account can't be edited in place");
  });
  it("the database enforces what the UI promises", () => {
    expect(sql).toMatch(/bank_accounts_active_requires_confirmation check \(not is_active or activation_confirmed_at is not null\)/);
    expect(sql).toMatch(/alter column is_active set default false/);
    expect(sql).toMatch(/revoke all on public\.bank_accounts from anon/);
    expect(sql).toMatch(/unique index bank_transfer_verifications_one_approval/);
    expect(sql).toMatch(/unique index bank_transfer_verifications_bank_credit_once/);
    expect(sql).toMatch(/revoke all on function public\.verify_bank_transfer_payment[\s\S]*from public, anon, authenticated/);
    expect(sql).toMatch(/grant select, insert on public\.bank_transfer_verifications to service_role/); // append-only
    expect(sql).not.toMatch(/grant [^;]*update[^;]* on public\.bank_transfer_verifications/);
  });
  it("proof files are only reachable through an audited, signed, short-lived link", () => {
    expect(verification).toContain("createSignedUrl(");
    expect(verification).toContain("payment.proof_viewed");
    expect(read("src/app/admin/payments/[id]/proof/route.ts")).toContain("canVerifyBankTransfers(user.id)");
  });
  it("client-facing pages never show the internal review notes", () => {
    const status = read("src/app/portal/(dashboard)/client/projects/[kind]/[id]/payments/[paymentId]/status/page.tsx");
    const bankBlock = status.slice(status.indexOf("{isBank && payment.status === \"rejected\""), status.indexOf("{payment.status === \"completed\""));
    expect(status).toContain("payment.clientVisibleNote");
    expect(bankBlock).not.toContain("reviewNotes");
  });
});

describe("migration 0151 is additive and reversible", () => {
  const sql = read("supabase/migrations/0151_direct_bank_transfer.sql");
  it("rewrites no existing payment/enquiry/quotation row at migration time (the function body is only run later, per decision)", () => {
    const outsideFunctions = sql.replace(/create or replace function[\s\S]*?\$\$;/g, "");
    expect(outsideFunctions).not.toMatch(/\bupdate\s+public\.(payments|enquiries|client_quotations|crew_support_requests)\b/i);
    expect(outsideFunctions).not.toMatch(/\bdelete\s+from\b/i);
  });
  it("the rollback refuses to destroy real bank-transfer data", () => {
    const down = read("supabase/rollbacks/down_0151.sql");
    expect(down).toContain("Refusing: bank_transfer_verifications has rows");
    expect(down).toContain("Refusing: payments carry bank-transfer data");
  });
});
