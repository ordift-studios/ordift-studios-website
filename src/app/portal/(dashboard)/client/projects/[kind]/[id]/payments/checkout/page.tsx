import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { getWorkspacePaymentSummary, isProjectKind } from "@/lib/portal/workspace";
import { getCurrentRate } from "@/lib/payments/currency";
import { getActiveBankAccount } from "@/lib/payments/bankAccounts";
import { getEntityPaymentCountry, PAYMENT_MARKETS } from "@/lib/payments/paymentMarket";
import { getActiveCountryConfig } from "@/lib/payments/providerRegistry";
import CheckoutForm from "./CheckoutForm";
import BankTransferCheckout from "./BankTransferCheckout";

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

  const summary = await getWorkspacePaymentSummary(kind, id, user.id);
  if (!summary || summary.balanceUsd <= 0) redirect(`/portal/client/projects/${kind}/${id}/payments`);

  // Direct Bank Transfer markets (Qatar) are resolved from the record's own payment market and
  // never touch the Ghana Paystack path below, which is unchanged.
  const market = await getEntityPaymentCountry(kind === "enquiry" ? "enquiry" : "workshop_registration", id);
  if (PAYMENT_MARKETS[market].bankTransferOnly) {
    const [config, rate, account] = await Promise.all([getActiveCountryConfig(market), getCurrentRate(PAYMENT_MARKETS[market].currency), getActiveBankAccount(market)]);
    const available = Boolean(config) && Boolean(account) && rate != null && account?.currencyCode === PAYMENT_MARKETS[market].currency;
    return (
      <div className="max-w-xl mx-auto">
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mb-2">Pay Now</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mb-8">
          Pay by Direct Bank Transfer. Your quotation is in USD; we show the exact {PAYMENT_MARKETS[market].currency} amount to send before you transfer.
        </p>
        {available ? (
          <BankTransferCheckout kind={kind} id={id} balanceUsd={summary.balanceUsd} hasExistingPayment={summary.amountPaidUsd > 0} currencyCode={PAYMENT_MARKETS[market].currency} rateToUsd={rate} />
        ) : (
          <p className="rounded-lg bg-amber-50 px-4 py-3 font-sans text-body-small text-amber-800">
            Bank transfer isn&apos;t available for your account yet. Please contact us and we&apos;ll arrange payment with you.
          </p>
        )}
      </div>
    );
  }

  const [rateToGhs, bankAccount] = await Promise.all([getCurrentRate(ACTIVE_CURRENCY), getActiveBankAccount(ACTIVE_COUNTRY)]);

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
