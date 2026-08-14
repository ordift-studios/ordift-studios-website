import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { getWorkspacePaymentSummary, isProjectKind } from "@/lib/portal/workspace";
import { getCurrentRate } from "@/lib/payments/currency";
import { getActiveBankAccount } from "@/lib/payments/bankAccounts";
import CheckoutForm from "./CheckoutForm";

// Ghana-first — see actions.ts's ACTIVE_COUNTRY comment for the same
// reasoning restated once, not duplicated per-file.
const ACTIVE_COUNTRY = "GH";
const ACTIVE_CURRENCY = "GHS";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { kind, id } = await params;
  const { error } = await searchParams;
  if (!isProjectKind(kind)) return null;
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");

  const [summary, rateToGhs, bankAccount] = await Promise.all([
    getWorkspacePaymentSummary(kind, id, user.id),
    getCurrentRate(ACTIVE_CURRENCY),
    getActiveBankAccount(ACTIVE_COUNTRY),
  ]);

  if (!summary || summary.balanceUsd <= 0) redirect(`/portal/client/projects/${kind}/${id}/payments`);

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="font-serif font-medium text-section-heading text-ordift-ink mb-2">Pay Now</h1>
      <p className="font-sans text-body-small text-ordift-ink-muted mb-8">
        Choose how you&apos;d like to pay. All amounts are referenced in USD — your local-currency amount is shown before you confirm.
      </p>
      <CheckoutForm
        kind={kind}
        id={id}
        balanceUsd={summary.balanceUsd}
        hasExistingPayment={summary.amountPaidUsd > 0}
        currencyCode={ACTIVE_CURRENCY}
        rateToUsd={rateToGhs}
        bankAccount={bankAccount}
        initialError={error ?? null}
      />
    </div>
  );
}
