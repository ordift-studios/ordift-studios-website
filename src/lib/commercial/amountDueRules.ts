// Enquiry-to-booking M2a — the PURE rules behind "establish the amount due from an accepted quotation" and the Super Admin override.
//
// Import-free of any database, email, notification or stage code, so it is safe in server and client code and fully testable. These rules give staff early,
// readable feedback in the screen. They are NOT the authority: migration 0166's functions (establish_enquiry_amount_due, override_enquiry_amount_due) re-check
// every one of them inside the transaction, and refuse with the same codes.

// Release safeguard (Founder, 2026-10-19): establishing an amount due from a NON-USD quotation stays disabled until the payment-page wording fix P1 is
// separately approved, deployed and verified (the client payment page still says "your quotation is in USD"). Flip this ONLY in the P1 release.
export const NON_USD_AMOUNT_DUE_ENABLED = false;

export const RATE_MAX_AGE_DAYS = 30;
export const RATE_MAX_JUMP = 0.1;

export const OVERRIDE_CATEGORIES = [
  { value: "quotation_corrected_as_agreed", label: "Quotation corrected as agreed with the client" },
  { value: "scope_or_price_change_agreed", label: "Scope or price change agreed in writing" },
  { value: "data_entry_correction", label: "Data-entry correction" },
  { value: "market_or_currency_correction", label: "Market or currency correction" },
  { value: "other", label: "Other (explain below)" },
] as const;
export type OverrideCategory = (typeof OVERRIDE_CATEGORIES)[number]["value"];
export const OVERRIDE_REASON_MIN_CHARS = 30;
export const OVERRIDE_REASON_MIN_DISTINCT_WORDS = 5;

export function roundHalfUp(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function distinctWordCount(text: string): number {
  return new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)).size;
}

export type OverrideInput = {
  newAmountUsd: number;
  currentAmountUsd: number | null;
  amountPaidUsd: number | null;
  category: string;
  reason: string;
  evidence: string;
  typedReference: string;
  enquiryReference: string;
};

export function validateOverrideInput(i: OverrideInput): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(i.newAmountUsd) || i.newAmountUsd <= 0 || i.newAmountUsd > 1_000_000) return { ok: false, error: "Enter a valid amount in USD." };
  if (!OVERRIDE_CATEGORIES.some((c) => c.value === i.category)) return { ok: false, error: "Choose the reason category." };
  const reason = i.reason.trim();
  if (reason.length < OVERRIDE_REASON_MIN_CHARS) return { ok: false, error: `Write a reason of at least ${OVERRIDE_REASON_MIN_CHARS} characters that says what was agreed and why.` };
  if (distinctWordCount(reason) < OVERRIDE_REASON_MIN_DISTINCT_WORDS) return { ok: false, error: "The reason must say something specific (at least five different words)." };
  if (i.category !== "data_entry_correction" && i.evidence.trim().length < 3) return { ok: false, error: "Record where the agreement is documented (for example an email date or a message reference)." };
  if (i.amountPaidUsd != null && i.amountPaidUsd > roundHalfUp(i.newAmountUsd)) return { ok: false, error: "The amount due cannot be set below what has already been paid." };
  if (i.currentAmountUsd != null && roundHalfUp(i.currentAmountUsd) === roundHalfUp(i.newAmountUsd)) return { ok: false, error: "That is already the amount due." };
  if (i.typedReference.trim().toUpperCase() !== i.enquiryReference.trim().toUpperCase()) return { ok: false, error: "Type the enquiry reference exactly to confirm the override." };
  return { ok: true };
}

export type Blocker = { code: string; message: string };

export type EstablishInput = {
  now: Date;
  enquiry: {
    commercialIntent: string | null;
    paymentCountry: "GH" | "QA" | null;
    amountDue: number | null;
    amountDueSource: string | null;
    amountDueQuotationId: string | null;
    amountPaid: number | null;
    id: string;
  };
  quotation: null | {
    id: string;
    enquiryId: string | null;
    crewSupportRequestId: string | null;
    status: string;
    currency: string;
    total: number;
    acceptedAt: string | null;
    acceptedVia: string | null;
    fxLockedAt: string | null;
    usdTotal: number | null;
    fxRateToUsd: number | null;
    itemsTotal: number;
    itemCount: number;
  };
  entityRecorded: boolean;
  marketCurrency: string | null;
  rates: { current: { rateToUsd: number; effectiveFrom: string; note: string | null } | null; previousRateToUsd: number | null };
  nonUsdEnabled?: boolean;
};

export type EstablishPreview = {
  usdAmount: number;
  rateToUsd: number;
  rateEffectiveFrom: string | null;
  rateAgeDays: number | null;
  rateNote: string | null;
  rateAlreadyLocked: boolean;
  rateJump: { previousRateToUsd: number; changePercent: number } | null;
  noop: boolean;
};

export type EstablishAssessment = { canEstablish: boolean; blockers: Blocker[]; preview: EstablishPreview | null };

const MESSAGES = {
  no_quotation: "There is no active quotation for this enquiry. Create or attach one first.",
  crew_support_excluded: "Creative Crew Support amounts are set from the Crew Support request, not here.",
  quotation_not_linked: "That quotation is not linked to this enquiry.",
  quotation_not_accepted: "The quotation has not been accepted. Record the client's acceptance with its evidence first.",
  contracting_entity_missing: "No contracting entity is recorded. A Super Admin must choose it explicitly first.",
  payment_market_not_set: "Set the payment market (Ghana or Qatar) on the enquiry first. It is never inferred.",
  currency_market_mismatch: "The quotation currency is neither USD nor the currency of the payment market.",
  non_usd_disabled: "Amounts from GHS or QAR quotations cannot be established yet: the payment-page wording update must be approved and deployed first.",
  total_not_consistent: "The quotation total does not match its lines. Revise the quotation.",
  rate_missing: "There is no exchange rate for this currency.",
  rate_source_missing: "The current exchange rate has no recorded source note. Re-save it with a source on the exchange-rates screen.",
  rate_stale: `The exchange rate is more than ${RATE_MAX_AGE_DAYS} days old. Review it on the exchange-rates screen (saving the unchanged rate with a source note counts as a review).`,
  rate_jump_unacknowledged: "The rate moved by more than 10% from the previous one. Tick the acknowledgement to continue.",
  amount_not_positive: "The amount would not be positive.",
  different_quotation_supplies_amount: "A different quotation already supplies this enquiry's amount due. It is never replaced silently.",
  amount_already_set_use_override: "An amount was already typed for this enquiry. Only a Super Admin override can change it.",
  payments_exist_amount_differs: "Payments exist and the amount would differ. Only a Super Admin override can change it.",
} as const;

// Mirrors the order of the database function so the first blocker shown is the first one the database would raise. The database remains the authority.
export function assessEstablishment(input: EstablishInput): EstablishAssessment {
  const { enquiry: e, quotation: q } = input;
  const block = (code: keyof typeof MESSAGES): EstablishAssessment => ({ canEstablish: false, blockers: [{ code, message: MESSAGES[code] }], preview: null });
  if (!q) return block("no_quotation");
  if (e.commercialIntent === "creative_crew_support" || q.crewSupportRequestId) return block("crew_support_excluded");
  if (q.enquiryId !== e.id) return block("quotation_not_linked");
  if (q.status !== "accepted" || !q.acceptedAt || !q.acceptedVia) return block("quotation_not_accepted");
  if (!input.entityRecorded) return block("contracting_entity_missing");
  if (!e.paymentCountry) return block("payment_market_not_set");
  if (q.currency !== "USD" && q.currency !== input.marketCurrency) return block("currency_market_mismatch");
  if (q.currency !== "USD" && !(input.nonUsdEnabled ?? NON_USD_AMOUNT_DUE_ENABLED)) return block("non_usd_disabled");
  if (q.itemCount === 0 || q.total <= 0 || Math.abs(q.itemsTotal - q.total) > 0.01 * q.itemCount) return block("total_not_consistent");

  let rateToUsd: number;
  let usd: number;
  let effectiveFrom: string | null = null;
  let note: string | null = null;
  let ageDays: number | null = null;
  let locked = false;
  let jump: EstablishPreview["rateJump"] = null;
  if (q.fxLockedAt && q.usdTotal != null && q.fxRateToUsd != null) {
    locked = true;
    rateToUsd = q.fxRateToUsd;
    usd = q.usdTotal;
    note = "rate already locked on the quotation";
  } else if (q.currency === "USD") {
    rateToUsd = 1;
    usd = roundHalfUp(q.total);
    note = "USD";
  } else {
    const r = input.rates.current;
    if (!r || !(r.rateToUsd > 0)) return block("rate_missing");
    if (!r.note || r.note.trim() === "") return block("rate_source_missing");
    ageDays = Math.floor((input.now.getTime() - new Date(r.effectiveFrom).getTime()) / 86_400_000);
    if (input.now.getTime() - new Date(r.effectiveFrom).getTime() > RATE_MAX_AGE_DAYS * 86_400_000) return block("rate_stale");
    rateToUsd = r.rateToUsd;
    effectiveFrom = r.effectiveFrom;
    note = r.note;
    const prev = input.rates.previousRateToUsd;
    if (prev != null && prev > 0 && Math.abs(rateToUsd - prev) / prev > RATE_MAX_JUMP) {
      jump = { previousRateToUsd: prev, changePercent: roundHalfUp(((rateToUsd - prev) / prev) * 100, 1) };
    }
    usd = roundHalfUp(q.total / rateToUsd);
  }
  if (usd <= 0) return block("amount_not_positive");

  const noop = e.amountDueQuotationId === q.id && e.amountDue === usd;
  if (!noop) {
    if (e.amountDueQuotationId && e.amountDueQuotationId !== q.id) return block("different_quotation_supplies_amount");
    if (e.amountDue != null && !e.amountDueQuotationId) return block("amount_already_set_use_override");
    if ((e.amountPaid ?? 0) > 0 && e.amountDue !== usd) return block("payments_exist_amount_differs");
  }
  const blockers: Blocker[] = [];
  return { canEstablish: true, blockers, preview: { usdAmount: usd, rateToUsd, rateEffectiveFrom: effectiveFrom, rateAgeDays: ageDays, rateNote: note, rateAlreadyLocked: locked, rateJump: jump, noop } };
}

// Every code the database functions can raise, with the sentence staff see. A test keeps this list in step with the migration.
export const AMOUNT_DUE_ERROR_MESSAGES: Record<string, string> = {
  not_authorised: "You are not authorised to do that.",
  quotation_not_found: "That quotation was not found.",
  enquiry_not_found: "That enquiry was not found.",
  changed_concurrently: "The quotation changed while you were working. Reload and try again.",
  crew_managed: "This quotation belongs to a Crew Support request. Manage it from that request.",
  draft_edit_directly: "A draft quotation can be edited directly. No revision is needed.",
  not_revisable: "Only a sent quotation that is still current can be revised. It may already have been revised, accepted or closed. Reload and check.",
  ...Object.fromEntries(Object.entries(MESSAGES).map(([k, v]) => [k, v])),
  quotation_not_accepted: MESSAGES.quotation_not_accepted,
  rate_changed_since_preview: "The exchange rate changed after you opened the preview. Reload to see the current rate and confirm again.",
  category_invalid: "Choose the reason category.",
  reason_too_short: `Write a reason of at least ${OVERRIDE_REASON_MIN_CHARS} characters.`,
  reason_not_meaningful: "The reason must say something specific (at least five different words).",
  evidence_required: "Record where the agreement is documented.",
  amount_below_paid: "The amount due cannot be set below what has already been paid.",
  amount_unchanged: "That is already the amount due.",
};

export function messageForAmountDueError(raw: string | null | undefined): string {
  const m = /ordift:([a-z_]+)/.exec(raw ?? "");
  if (m && AMOUNT_DUE_ERROR_MESSAGES[m[1]]) return AMOUNT_DUE_ERROR_MESSAGES[m[1]];
  if (/client_quotations_one_live_per_enquiry/.test(raw ?? "")) return "This enquiry already has an active quotation. Revise or close it instead of creating another.";
  return "Something went wrong and nothing was saved. Please reload and try again.";
}
