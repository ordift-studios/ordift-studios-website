import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { getOwnPayeeProfile } from "@/lib/payables/payeeProfiles";
import { listPaymentInstructionsForProfile } from "@/lib/payments/payeeInstructions";
import { listActiveCurrencies } from "@/lib/payments/currency";
import { countryName, verificationStatusLabel } from "@/lib/payables/paymentDestinationShared";
import PaymentDestinationForm from "@/components/payables/PaymentDestinationForm";
import SubmitButton from "@/components/admin/SubmitButton";
import { createOwnPaymentInstructionAction, deactivateOwnPaymentInstructionAction } from "./actions";

export const metadata: Metadata = {
  title: "Payment Details — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

// Payee self-service (2026-09-04) — visible/reachable to anyone signed
// in with an existing payee_profiles row (checked via
// getOwnPayeeProfile(), the same function the admin side already used
// for read access), independent of the legacy roles table — a payee
// might hold any role (client, staff, ...) and still be classified as
// vendor/contractor/instructor/etc. via payee_profiles, so this can't
// be gated by hasRole() the way the rest of the portal dashboard is.
export default async function PaymentDetailsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login");

  const payeeProfile = await getOwnPayeeProfile(user.id);

  if (!payeeProfile) {
    return (
      <div>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">Payment Details</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-4 max-w-2xl">
          You are not currently classified as an Ordift payee, so there is nothing to configure here yet. If you
          are expecting to be paid for work with Ordift, an administrator will need to set this up on their end
          first.
        </p>
      </div>
    );
  }

  const [instructions, currencies] = await Promise.all([listPaymentInstructionsForProfile(user.id), listActiveCurrencies()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">Payment Details</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Add the bank account or mobile money details Ordift should pay you through. A new or edited destination
          starts as <strong>unverified</strong> — an authorized Ordift administrator reviews and verifies it before
          it can be used for a real payment. Full account numbers are never shown again after saving, here or to
          anyone else — only the last 4 characters.
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Your Payment Destinations</h2>
        {instructions.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg border border-dashed border-black/15 px-4 py-6 text-center">
            You haven&apos;t added a payment destination yet — use the form below.
          </p>
        ) : (
          <ul className="divide-y divide-black/5 rounded-lg border border-black/5 mb-6">
            {instructions.map((i) => (
              <li key={i.id} className="px-4 py-3">
                <p className="font-sans text-body-small text-ordift-ink">
                  {i.institutionName ?? "—"} · {i.accountHolderName} · {i.maskedAccountIdentifier ?? "—"}
                </p>
                <p className="font-sans text-caption text-ordift-ink-muted mb-2">
                  {countryName(i.country)} · {i.currency} · {verificationStatusLabel(i.verificationStatus)} · {i.active ? "active" : "deactivated"}{" "}
                  {i.isDefault ? "· default" : ""}
                </p>
                {i.active && (
                  <form action={deactivateOwnPaymentInstructionAction}>
                    <input type="hidden" name="instructionId" value={i.id} />
                    <SubmitButton pendingLabel="Deactivating…" className="rounded border border-black/15 px-2 py-1 font-sans text-caption hover:border-black/30">
                      Deactivate
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        <details className="rounded-lg border border-black/10 p-4" open={instructions.length === 0}>
          <summary className="font-sans text-body-small text-ordift-ink cursor-pointer">Add a payment destination</summary>
          <div className="mt-4">
            <PaymentDestinationForm
              targetProfileId={user.id}
              currencies={currencies}
              createAction={createOwnPaymentInstructionAction}
              onSuccessMessage="Payment destination saved — it now shows as unverified until an Ordift administrator reviews it."
            />
          </div>
        </details>
      </section>
    </div>
  );
}
