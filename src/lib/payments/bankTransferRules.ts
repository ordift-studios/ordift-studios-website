// Direct Bank Transfer — pure rules. No database access.
//
// Extends the existing payments foundation (payments.payment_method = 'bank_transfer'). A receipt
// upload NEVER completes a payment: the only path to 'completed' is a verifier recording what
// actually arrived in the receiving account (verify_bank_transfer_payment(), migration 0151).
// The functions here mirror the database function's arithmetic so the review screen can show the
// verifier exactly what approving would post, before they approve.

export type BankTransferStatus = "pending" | "awaiting_verification" | "additional_info_required" | "completed" | "rejected" | "failed" | "refunded";

// One label set for the client portal and admin queue. Maps the stored status to the vocabulary the
// Founder specified; the stored values stay the existing payments conventions.
export const BANK_TRANSFER_STATUS_LABELS: Record<string, { label: string; client: string }> = {
  pending: { label: "Awaiting transfer", client: "Awaiting Transfer" },
  awaiting_verification: { label: "Proof submitted — awaiting verification", client: "Proof Submitted — Awaiting Verification" },
  additional_info_required: { label: "Additional information required", client: "Additional Information Required" },
  completed: { label: "Verified", client: "Verified" },
  rejected: { label: "Rejected", client: "Rejected" },
  failed: { label: "Failed", client: "Failed" },
  refunded: { label: "Refunded", client: "Refunded" },
};

export function bankTransferStatusLabel(status: string, audience: "admin" | "client" = "client"): string {
  const entry = BANK_TRANSFER_STATUS_LABELS[status];
  return entry ? (audience === "admin" ? entry.label : entry.client) : status;
}

// A client may (re)submit proof only in these states.
export function canSubmitProof(status: string): boolean {
  return status === "pending" || status === "rejected" || status === "additional_info_required";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---- What approving would post -------------------------------------------------------------
export type ReceivedAssessment =
  | { kind: "currency_mismatch"; expectedCurrency: string; receivedCurrency: string }
  | { kind: "exact"; creditedUsd: number; excess: 0 }
  | { kind: "partial"; creditedUsd: number; shortfall: number }
  | { kind: "excess"; creditedUsd: number; excess: number };

// expected* come from the payment row (locked rate); received* from the verifier. Credit is always
// derived from what was actually received at the LOCKED rate, never from what was merely requested.
export function assessReceived(params: {
  expectedAmount: number;
  expectedCurrency: string;
  expectedReferenceUsd: number;
  exchangeRate: number; // units of local currency per 1 USD, as locked on the payment
  receivedAmount: number;
  receivedCurrency: string;
}): ReceivedAssessment {
  if (params.receivedCurrency !== params.expectedCurrency) {
    return { kind: "currency_mismatch", expectedCurrency: params.expectedCurrency, receivedCurrency: params.receivedCurrency };
  }
  const received = round2(params.receivedAmount);
  if (received < params.expectedAmount - 0.005) {
    return { kind: "partial", creditedUsd: round2(received / params.exchangeRate), shortfall: round2(params.expectedAmount - received) };
  }
  const excess = Math.max(round2(received - params.expectedAmount), 0);
  if (excess > 0.005) return { kind: "excess", creditedUsd: params.expectedReferenceUsd, excess };
  return { kind: "exact", creditedUsd: params.expectedReferenceUsd, excess: 0 };
}

// ---- Verification input ---------------------------------------------------------------------
export type VerificationDecision = "approved" | "rejected" | "info_requested";

export type VerificationInput = {
  decision: string;
  receivedAmount: number | null;
  receivedCurrency: string;
  bankReference: string;
  receivedDate: string; // YYYY-MM-DD
  independentCheck: boolean;
  internalNotes: string;
  clientMessage: string;
  acknowledgeExcess: boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Mirrors the database function so the verifier gets a clear message before the round trip.
export function validateVerificationInput(input: VerificationInput, today: string): { ok: true; decision: VerificationDecision } | { ok: false; error: string } {
  if (input.decision !== "approved" && input.decision !== "rejected" && input.decision !== "info_requested") return { ok: false, error: "Choose a decision." };
  if (input.decision === "rejected" && input.internalNotes.trim().length < 5) return { ok: false, error: "Record the reason for rejecting this payment." };
  if (input.decision === "info_requested" && input.clientMessage.trim().length < 5) return { ok: false, error: "Tell the client what additional information is needed." };
  if (input.decision !== "approved") return { ok: true, decision: input.decision };

  if (!input.independentCheck) return { ok: false, error: "Confirm that you independently checked the receiving bank account. A receipt alone is not proof of payment." };
  if (input.receivedAmount == null || !Number.isFinite(input.receivedAmount) || input.receivedAmount <= 0) return { ok: false, error: "Enter the amount that actually arrived in the account." };
  if (!/^[A-Z]{3}$/.test(input.receivedCurrency)) return { ok: false, error: "Enter the currency that actually arrived (e.g. QAR)." };
  if (input.bankReference.trim().length < 3) return { ok: false, error: "Enter the bank's transaction reference exactly as it appears on your statement." };
  if (!DATE_RE.test(input.receivedDate) || Number.isNaN(Date.parse(`${input.receivedDate}T00:00:00Z`))) return { ok: false, error: "Enter the date the money was received." };
  // Qatar is UTC+3: its "today" can be the UTC "tomorrow", so allow one day.
  const limit = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (input.receivedDate > limit) return { ok: false, error: "The receipt date can't be in the future." };
  return { ok: true, decision: "approved" };
}

// Database exception codes → plain explanations (the function raises these exact strings).
export const VERIFICATION_ERRORS: Record<string, string> = {
  verifier_not_authorized: "Only a Super Admin or authorised Finance personnel can verify bank transfers.",
  invalid_decision: "That decision isn't valid.",
  payment_not_found: "Payment not found.",
  not_bank_transfer: "This isn't a bank-transfer payment.",
  not_awaiting_verification: "This payment is no longer awaiting verification — refresh to see its current state. Nothing was changed.",
  verifier_is_submitter: "You can't verify a payment you submitted or are paying yourself. Another authorised person must verify it.",
  reason_required: "Record the reason for rejecting this payment.",
  message_required: "Tell the client what additional information is needed.",
  independent_check_required: "Confirm that you independently checked the receiving bank account.",
  received_amount_required: "Enter the amount that actually arrived in the account.",
  currency_mismatch: "The currency received differs from the currency the client was asked to transfer. Don't approve it — request more information or reject it so the difference is resolved properly.",
  bank_reference_required: "Enter the bank's transaction reference.",
  received_date_invalid: "Enter a valid receipt date that isn't in the future.",
  no_receiving_account: "This payment has no designated receiving account recorded, so it can't be verified.",
  excess_not_acknowledged: "More than the requested amount arrived. Tick the acknowledgement: only the requested amount is credited, and the excess is recorded for you to refund or credit manually.",
  credit_too_small: "The amount received is too small to credit.",
  no_receivable: "There is no amount due on this record, so nothing can be credited.",
  would_overpay_receivable: "Crediting this would exceed what the receivable still owes (another payment may have been recorded). Nothing was posted — request more information or reject it.",
  duplicate_bank_reference: "This bank transaction reference has already been used to approve a payment into this account. A bank credit can't be posted twice.",
};

export function describeVerificationError(message: string | undefined | null): string {
  const code = Object.keys(VERIFICATION_ERRORS).find((c) => message?.includes(c));
  return code ? VERIFICATION_ERRORS[code] : "The decision couldn't be saved. Nothing was changed — please try again.";
}

// ---- Receiving account ---------------------------------------------------------------------
export type ReceivingAccountSnapshot = {
  bankAccountId: string;
  bankName: string;
  beneficiaryName: string;
  accountNumber: string;
  iban: string | null;
  swiftCode: string | null;
  currencyCode: string;
  country: string;
  classification: "personal" | "corporate";
  capturedAt: string;
};

// What the client was shown, frozen on the payment so a later change to the bank account can never
// alter the record of where this transaction was to be received.
export function buildReceivingSnapshot(account: Omit<ReceivingAccountSnapshot, "capturedAt">, now: Date = new Date()): ReceivingAccountSnapshot {
  return { ...account, capturedAt: now.toISOString() };
}

export function maskAccountIdentifier(value: string | null | undefined): string {
  const v = (value ?? "").replace(/\s+/g, "");
  if (v.length <= 4) return v ? "••••" : "—";
  return `${"•".repeat(Math.min(v.length - 4, 12))}${v.slice(-4)}`;
}

// ---- Bank account governance -----------------------------------------------------------------
export const SENSITIVE_ACCOUNT_FIELDS = ["bankName", "beneficiaryName", "accountNumber", "iban", "swiftCode", "currencyCode", "country", "classification"] as const;

export type BankAccountInput = {
  bankName: string;
  beneficiaryName: string;
  accountNumber: string;
  iban: string;
  swiftCode: string;
  currencyCode: string;
  country: string;
  classification: string;
};

export function validateBankAccountInput(input: BankAccountInput): { ok: true } | { ok: false; error: string } {
  if (input.bankName.trim().length < 2) return { ok: false, error: "Enter the bank name." };
  if (input.beneficiaryName.trim().length < 2) return { ok: false, error: "Enter the beneficiary's legal name exactly as the bank holds it." };
  if (input.accountNumber.trim().length < 4 && input.iban.trim().length < 8) return { ok: false, error: "Enter the account number and/or the IBAN." };
  if (input.iban.trim() && !isPlausibleIban(input.iban)) return { ok: false, error: "That IBAN doesn't look valid. Check it against your bank's own details." };
  if (!/^[A-Z]{3}$/.test(input.currencyCode)) return { ok: false, error: "Choose the account currency." };
  if (!/^[A-Z]{2}$/.test(input.country)) return { ok: false, error: "Choose the market/country." };
  if (input.classification !== "personal" && input.classification !== "corporate") return { ok: false, error: "Say whether this is a personal or a corporate account." };
  return { ok: true };
}

// ISO 13616 mod-97 check. Catches typos; it does not prove the account exists or belongs to anyone.
export function isPlausibleIban(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

export const MIN_ACTIVATION_BASIS_LENGTH = 20;

// Activating an account makes it a live receiving account. It is a deliberate Super Admin decision
// that records WHY the account is permitted for this business use. A personal account needs an
// explicit written basis (bank/regulatory eligibility) — it can never be activated by default.
export function validateActivation(params: { classification: string; basis: string; hasIdentifier: boolean; hasMarketConfig: boolean; confirmedPersonalUse: boolean }): { ok: true } | { ok: false; error: string } {
  if (!params.hasIdentifier) return { ok: false, error: "The account has no account number or IBAN recorded." };
  if (!params.hasMarketConfig) return { ok: false, error: "This market isn't configured for payments yet." };
  const basis = params.basis.trim();
  if (basis.length < MIN_ACTIVATION_BASIS_LENGTH) return { ok: false, error: "Record the basis for activating this account (who confirmed it is permitted, and how) — at least a short sentence." };
  if (params.classification === "personal" && !params.confirmedPersonalUse) return { ok: false, error: "A personal account can only be activated after you confirm its use for business receipts is permitted by the bank and applicable regulation." };
  return { ok: true };
}

// ---- Client-facing transfer instructions ------------------------------------------------------
export function transferInstructions(params: { reference: string; amount: number; currency: string }): string[] {
  return [
    `Transfer exactly ${params.currency} ${params.amount.toFixed(2)} — not more, not less.`,
    `Put ${params.reference} in the transfer's reference/description so we can match it.`,
    "Pay in the currency shown. Don't send a different currency or let your bank convert it for you.",
    "Then upload your receipt or a screenshot and, if you have it, the bank's transaction reference. Your payment is only confirmed once we see the money in our account.",
  ];
}
