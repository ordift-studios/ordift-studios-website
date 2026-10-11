import { createAdminClient } from "@/lib/supabase/admin";

// The receiving account a client is told to pay into. Read SERVER-SIDE ONLY (service role): since
// migration 0151 clients can no longer read bank_accounts directly, so a future account can never
// be discovered before it is activated, and only the default active account for the client's market
// is ever sent to the browser.
export type BankAccountDisplay = {
  id: string;
  bankName: string;
  accountName: string; // beneficiary legal name
  accountNumber: string;
  currencyCode: string;
  iban: string | null;
  swiftCode: string | null;
  country: string;
  classification: "personal" | "corporate";
};

type Row = {
  id: string; bank_name: string; account_name: string; account_number: string; currency_code: string; iban: string | null; swift_code: string | null;
  country: string; account_classification?: string | null; is_default?: boolean | null;
};

const COLUMNS = "id, bank_name, account_name, account_number, currency_code, iban, swift_code, country, account_classification, is_default";

export function toDisplay(row: Row): BankAccountDisplay {
  return {
    id: row.id,
    bankName: row.bank_name,
    accountName: row.account_name,
    accountNumber: row.account_number,
    currencyCode: row.currency_code,
    iban: row.iban,
    swiftCode: row.swift_code,
    country: row.country,
    classification: row.account_classification === "personal" ? "personal" : "corporate",
  };
}

// The default active account for a market (falls back to the single legacy active row, which is how
// the Ghana flow has always resolved it). More than one active account with no default is ambiguous,
// so nothing is offered rather than guessing where the client should pay.
export async function getActiveBankAccount(country: string): Promise<BankAccountDisplay | null> {
  const { data, error } = await createAdminClient().from("bank_accounts").select(COLUMNS).eq("country", country).eq("is_active", true);
  if (error || !data?.length) return null;
  const rows = data as Row[];
  const preferred = rows.find((r) => r.is_default) ?? (rows.length === 1 ? rows[0] : null);
  return preferred ? toDisplay(preferred) : null;
}
