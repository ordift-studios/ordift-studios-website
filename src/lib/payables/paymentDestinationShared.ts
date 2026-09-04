// Payment Destination UX (2026-09-04) — client-safe constants and pure
// logic for the method-aware payment-destination form and its
// validation. Zero imports, by design: this is used directly by a
// "use client" form component (PaymentDestinationForm.tsx), and this
// codebase already learned, live against Production, that anything a
// client component imports from a module with server-only imports
// (createAdminClient/next-headers) breaks the Turbopack build — see
// payeeProfileShared.ts's own header for the incident this repeats the
// same fix for.

export const PAYMENT_METHODS = ["bank_account", "mobile_money", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_account: "Bank account",
  mobile_money: "Mobile money",
  other: "Other",
};

// Human-readable, method-aware field labels — never the raw database
// column names (account_identifier/routing_identifier) an ordinary
// user would have no context for. institutionLabel doubles as "Bank /
// Financial Institution" (bank) and "Mobile Money Provider" (mobile
// money) — same underlying column (institution_name), different UI
// meaning by method, so no schema change was needed for this.
export const METHOD_FIELD_LABELS: Record<
  PaymentMethod,
  { institutionLabel: string; accountIdentifierLabel: string; routingLabel: string | null; institutionIsFreeText: boolean }
> = {
  bank_account: {
    institutionLabel: "Bank / Financial Institution",
    accountIdentifierLabel: "Account Number",
    routingLabel: "Branch / Routing / Sort / SWIFT Code (optional)",
    institutionIsFreeText: true,
  },
  mobile_money: {
    institutionLabel: "Mobile Money Provider",
    accountIdentifierLabel: "Mobile Money Number",
    routingLabel: null,
    institutionIsFreeText: true,
  },
  other: {
    institutionLabel: "Provider / Method Name",
    accountIdentifierLabel: "Payment Identifier",
    routingLabel: null,
    institutionIsFreeText: true,
  },
};

// A reasonably complete, professional country list (ISO 3166-1,
// alpha-2 code -> name) — not exhaustive to the last territory, but
// covers Ghana, Qatar, and every country Ordift is realistically
// likely to onboard a payee from. This is plain reference data in
// application code, the same precedent as PAYEE_CATEGORIES/
// PAYABLE_ITEM_KINDS elsewhere in this module — deliberately NOT a new
// database table, since no migration is needed for something this
// static, and it keeps this feature fully migration-free. Extending it
// later is a one-line array addition, never a schema change.
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "GH", name: "Ghana" },
  { code: "QA", name: "Qatar" },
  { code: "NG", name: "Nigeria" },
  { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "IN", name: "India" },
  { code: "EG", name: "Egypt" },
  { code: "CI", name: "Côte d'Ivoire" },
  { code: "SN", name: "Senegal" },
  { code: "TG", name: "Togo" },
  { code: "BJ", name: "Benin" },
  { code: "BF", name: "Burkina Faso" },
  { code: "OTHER", name: "Other / Not Listed" },
].sort((a, b) => a.name.localeCompare(b.name));

export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

// Suggested providers only (rendered as a <datalist>, never a closed
// <select>) — the field itself stays free text everywhere, so a
// country with no entry here (i.e. every country except the one
// deliberately seeded below) works identically, unsuggested but
// unrestricted. Extending this for another country later is the same
// one-line addition as COUNTRIES above, never an architecture change —
// directly answering "design this so providers can eventually include
// appropriate providers without hard-coding an architecture that only
// works for Ghana."
export const MOBILE_MONEY_PROVIDERS_BY_COUNTRY: Record<string, string[]> = {
  GH: ["MTN Mobile Money", "Vodafone Cash", "AirtelTigo Money", "Telecel Cash"],
};

export function suggestedMobileMoneyProviders(countryCode: string): string[] {
  return MOBILE_MONEY_PROVIDERS_BY_COUNTRY[countryCode] ?? [];
}

export type PaymentDestinationInput = {
  method: string;
  country: string;
  currency: string;
  accountHolderName: string;
  institutionName: string | null;
  accountIdentifier: string | null;
  routingIdentifier: string | null;
};

// Method-specific validation — pure, directly unit-testable. Every
// method requires country/currency/account-holder-name plus its own
// institution + identifier field (bank: institution=bank name,
// identifier=account number; mobile money: institution=provider,
// identifier=phone number; other: institution=provider/method name,
// identifier=payment identifier). Routing is always optional.
export function validatePaymentDestinationInput(input: PaymentDestinationInput): { ok: true } | { ok: false; error: string } {
  if (!PAYMENT_METHODS.includes(input.method as PaymentMethod)) return { ok: false, error: "Select a payment method." };
  if (!input.country.trim()) return { ok: false, error: "Select a country." };
  if (!input.currency.trim()) return { ok: false, error: "Select a currency." };
  if (!input.accountHolderName.trim()) return { ok: false, error: "Enter the account holder name." };

  const labels = METHOD_FIELD_LABELS[input.method as PaymentMethod];
  if (!input.institutionName?.trim()) return { ok: false, error: `Enter the ${labels.institutionLabel.toLowerCase()}.` };
  if (!input.accountIdentifier?.trim()) return { ok: false, error: `Enter the ${labels.accountIdentifierLabel.toLowerCase()}.` };

  return { ok: true };
}

// Payable Safety Hardening (2026-09-04), Part I — display-only wording
// clarification. "Verified" on its own reads to a first-time viewer as
// "the bank/mobile-money provider confirmed this account is real,"
// which is NOT what this status means (confirmed during Phase D: no
// external provider API is ever called anywhere near this path). The
// underlying stored value (payment_instructions.verification_status:
// "unverified" | "verified" | "rejected") and every activity_log
// action name that references it are completely unchanged — this map
// only controls what label renders in the UI.
export const VERIFICATION_STATUS_LABELS: Record<string, string> = {
  unverified: "Not Yet Reviewed",
  verified: "Admin Verified",
  rejected: "Verification Rejected",
};

export function verificationStatusLabel(status: string): string {
  return VERIFICATION_STATUS_LABELS[status] ?? status;
}

// Self-service ownership boundary — pure, directly unit-testable. The
// one fact every payment-instruction mutation's authorization check
// ultimately reduces to for the self-service path: an actor may always
// manage their own destination; anyone else needs the admin capability
// (checked separately, DB-dependent, in payeeInstructions.ts).
export function isOwnPaymentDestination(actorUserId: string, targetProfileId: string): boolean {
  return actorUserId === targetProfileId;
}
