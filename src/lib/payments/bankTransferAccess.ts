import { FINANCE_CAPABILITIES, hasAuthority, isSuperAdminId } from "@/lib/organization/authority";

// Who may verify bank transfers and open payment evidence: Super Admin, or a person holding the
// explicit global authority grant `finance.bank_transfer.verify`. A general admin or staff role
// confers nothing. This mirrors private.can_verify_bank_transfers() in the database, which
// verify_bank_transfer_payment() calls itself — so the rule holds even if application code is wrong.
export async function canVerifyBankTransfers(profileId: string | null | undefined): Promise<boolean> {
  if (!profileId) return false;
  if (await isSuperAdminId(profileId)) return true;
  return hasAuthority(profileId, FINANCE_CAPABILITIES.bankTransferVerify, null);
}
