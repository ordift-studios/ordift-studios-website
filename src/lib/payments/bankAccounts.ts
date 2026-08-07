import { createClient } from "@/lib/supabase/server";

// Small, focused query — the checkout UI's bank-transfer step needs to
// know whether a real account exists for a country before offering the
// flow at all (UX Spec §8: "the option simply doesn't appear until
// that flag flips," same pattern already used for Qatar). Reused
// nowhere else yet, so it lives here rather than in workspace.ts,
// which is specifically the Project Workspace's own data layer.

export type BankAccountDisplay = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  currencyCode: string;
  iban: string | null;
  swiftCode: string | null;
};

export async function getActiveBankAccount(country: string): Promise<BankAccountDisplay | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("bank_name, account_name, account_number, currency_code, iban, swift_code")
    .eq("country", country)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;

  return {
    bankName: data.bank_name,
    accountName: data.account_name,
    accountNumber: data.account_number,
    currencyCode: data.currency_code,
    iban: data.iban,
    swiftCode: data.swift_code,
  };
}
