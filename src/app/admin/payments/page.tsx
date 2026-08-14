import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canAccessPaymentsAdmin, PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { hasCapability } from "@/lib/workflow/engine";
import { createClient } from "@/lib/supabase/server";
import { approveBankTransferAction, rejectBankTransferAction } from "./actions";

export const metadata: Metadata = {
  title: "Payments — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Minimal Phase 2 sandbox review surface — a Pending Verification
// queue (the bank-transfer approve/reject workflow, UX Spec §9) plus a
// recent-payments ledger. Deliberately not the full filterable/
// exportable UI the other admin modules have (that's a follow-up once
// the Ghana Paystack sandbox flow itself is proven end-to-end) — see
// the delivery summary for what's intentionally minimal-viable here.

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function AdminPaymentsPage() {
  const user = await getCurrentUser();
  if (!user || !canAccessPaymentsAdmin(user)) redirect("/portal");
  const canManageCurrencies = hasCapability(user, PAYMENT_CAPABILITIES, "manage_currencies");

  const supabase = await createClient();

  const [{ data: pending }, { data: recent }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, record_id, entity_type, entity_id, reference_amount_usd, payment_currency, converted_amount, submitted_at, review_notes")
      .eq("status", "awaiting_verification")
      .order("submitted_at", { ascending: true }),
    supabase
      .from("payments")
      .select("id, record_id, entity_type, payment_type, payment_method, status, provider, reference_amount_usd, payment_currency, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
            Admin
          </p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
            Payments
          </h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
            Sandbox / test mode — no live gateway credentials connected.
          </p>
        </div>
        {canManageCurrencies && (
          <Link
            href="/admin/payments/exchange-rates"
            className="font-sans text-body-small font-medium px-4 py-2 rounded-md border border-black/15 text-ordift-ink hover:border-black/30"
          >
            Exchange Rate Management
          </Link>
        )}
      </div>

      <section className="mb-10">
        <h2 className="font-serif font-medium text-lg text-ordift-ink mb-4">
          Pending Verification ({(pending ?? []).length})
        </h2>
        {(pending ?? []).length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No bank transfers awaiting review.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/10">
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Reference</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Entity</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Amount</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Submitted</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Decision</th>
                </tr>
              </thead>
              <tbody>
                {(pending ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-black/5 last:border-0 hover:bg-ordift-offwhite">
                    <td className="py-3 px-4 font-sans text-body-small text-ordift-ink">{p.record_id}</td>
                    <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">
                      {p.entity_type} · {p.entity_id.slice(0, 8)}
                    </td>
                    <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">
                      {p.payment_currency} {Number(p.converted_amount).toFixed(2)} (USD {Number(p.reference_amount_usd).toFixed(2)})
                    </td>
                    <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted whitespace-nowrap">
                      {p.submitted_at ? formatDate(p.submitted_at) : "—"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-2">
                        <form action={approveBankTransferAction}>
                          <input type="hidden" name="paymentId" value={p.id} />
                          <button
                            type="submit"
                            className="min-h-9 rounded-lg bg-ordift-gold px-3 font-sans text-body-small text-ordift-navy-950 hover:bg-ordift-gold-hover"
                          >
                            Approve
                          </button>
                        </form>
                        <form action={rejectBankTransferAction} className="flex items-center gap-2">
                          <input type="hidden" name="paymentId" value={p.id} />
                          <input
                            type="text"
                            name="reason"
                            required
                            placeholder="Rejection reason"
                            className="min-h-9 rounded-lg border border-black/15 bg-white px-2 font-sans text-body-small text-ordift-ink"
                          />
                          <button
                            type="submit"
                            className="min-h-9 rounded-lg border border-black/20 px-3 font-sans text-body-small text-ordift-ink hover:bg-black/5"
                          >
                            Reject
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="font-serif font-medium text-lg text-ordift-ink mb-4">Recent Payments</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-black/10">
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Reference</th>
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Type</th>
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Method</th>
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Status</th>
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Amount (USD)</th>
                <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {(recent ?? []).map((p) => (
                <tr key={p.id} className="border-b border-black/5 last:border-0 hover:bg-ordift-offwhite">
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink">{p.record_id}</td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">{p.payment_type}</td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">
                    {p.payment_method === "gateway" ? p.provider : "Bank Transfer"}
                  </td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">{p.status}</td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">
                    {Number(p.reference_amount_usd).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted whitespace-nowrap">
                    {formatDate(p.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
