import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { hasCapability } from "@/lib/workflow/engine";
import { PAYMENT_CAPABILITIES } from "@/lib/payments/paymentPermissions";
import { getCurrentRate, getExchangeRateHistory } from "@/lib/payments/currency";
import { resolveActorIdentities, formatActorLabel } from "@/lib/portal/actorIdentity";
import AddExchangeRateForm from "./AddExchangeRateForm";

export const metadata: Metadata = {
  title: "Exchange Rate Management — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Ghana-only today — same ACTIVE_CURRENCY pattern already used across
// the payments module (checkout/actions.ts, checkout/page.tsx). A
// second currency (Qatar/QAR) gets its own row here the same way, once
// that market is live — no schema or UI rework needed.
const ACTIVE_CURRENCY = "GHS";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ExchangeRateManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await getCurrentUser();
  if (!user || !hasCapability(user, PAYMENT_CAPABILITIES, "manage_currencies")) {
    redirect("/admin/payments");
  }

  const [currentRate, history] = await Promise.all([
    getCurrentRate(ACTIVE_CURRENCY),
    getExchangeRateHistory(ACTIVE_CURRENCY),
  ]);

  const current = history[0] ?? null;
  const actorIds = history.map((row) => row.updatedBy).filter((id): id is string => Boolean(id));
  const actors = await resolveActorIdentities(actorIds);

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <Link href="/admin/payments" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
          ← Payments
        </Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-3">Exchange Rate Management</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">
          Every rate change adds a new entry — nothing here is ever edited or deleted. A payment that already
          locked a rate keeps using that exact rate permanently, even after a newer one is added.
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-3">
          Current Active Rate — USD → {ACTIVE_CURRENCY}
        </p>
        {current ? (
          <div className="space-y-1">
            <p className="font-serif font-medium text-3xl text-ordift-ink">1 USD = {current.rateToUsd.toFixed(4)} {ACTIVE_CURRENCY}</p>
            <p className="font-sans text-body-small text-ordift-ink-muted">
              Effective from {formatDateTime(current.effectiveFrom)}
            </p>
            <p className="font-sans text-body-small text-ordift-ink-muted">
              Set by {formatActorLabel(current.updatedBy ? actors.get(current.updatedBy) : null)}
            </p>
            {current.reason && (
              <p className="font-sans text-body-small text-ordift-ink-muted italic mt-1">&ldquo;{current.reason}&rdquo;</p>
            )}
          </div>
        ) : (
          <p className="font-sans text-body-small text-amber-800 bg-amber-50 rounded-lg px-4 py-3">
            No rate has been set yet — Card, Mobile Money, and Bank Transfer checkout in {ACTIVE_CURRENCY} cannot
            proceed until a rate is added below.
          </p>
        )}
      </section>

      <AddExchangeRateForm currencyCode={ACTIVE_CURRENCY} currentRate={currentRate} initialError={error ?? null} />

      <section>
        <h2 className="font-serif font-medium text-lg text-ordift-ink mb-4">Rate History</h2>
        {history.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted">No rates recorded yet.</p>
        ) : (
          <div className="rounded-xl border border-black/10 bg-white overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/10">
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Rate</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Effective From</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Set By</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4">Reason</th>
                  <th className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((row, index) => (
                  <tr key={row.id} className="border-b border-black/5 last:border-0">
                    <td className="py-3 px-4 font-sans text-body-small text-ordift-ink">
                      1 USD = {row.rateToUsd.toFixed(4)} {ACTIVE_CURRENCY}
                    </td>
                    <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted whitespace-nowrap">
                      {formatDateTime(row.effectiveFrom)}
                    </td>
                    <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">
                      {formatActorLabel(row.updatedBy ? actors.get(row.updatedBy) : null)}
                    </td>
                    <td className="py-3 px-4 font-sans text-body-small text-ordift-ink-muted">{row.reason ?? "—"}</td>
                    <td className="py-3 px-4">
                      {index === 0 && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full font-sans text-caption font-medium bg-green-50 text-green-800">
                          Current
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
