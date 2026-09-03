import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { listPayeeProfiles, PAYEE_CATEGORIES } from "@/lib/payables/payeeProfiles";
import { listUsersWithRoles, listOperationalTitles } from "@/lib/portal/adminData";
import { createPayeeProfileAction } from "../actions";

export const metadata: Metadata = {
  title: "Payees — Payables — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPayeesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, FINANCE_CAPABILITIES.payeeAdminister);
  if (!auth.ok) redirect("/admin/payables");

  const [payees, accountsResult, operationalTitles] = await Promise.all([listPayeeProfiles(user.id), listUsersWithRoles(), listOperationalTitles()]);
  const accounts = accountsResult.ok ? accountsResult.users : [];
  const payeeIds = new Set(payees.map((p) => p.id));
  const notYetPayees = accounts.filter((a) => !payeeIds.has(a.id));

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Finance · Payables</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Payees</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Classify an existing Ordift account as a payee — staff, vendor, contractor, freelancer, instructor,
          talent, or consultant — before recording their payment destination, engagement, or payable. The person
          must already have an Ordift account; this does not create one.
        </p>
        {!accountsResult.ok && (
          <p className="font-sans text-caption text-red-700 mt-2">Couldn&apos;t load accounts: {accountsResult.error}</p>
        )}
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">Onboard a Payee</h2>
        <form action={createPayeeProfileAction} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-sans text-caption text-ordift-ink-muted">Existing account</span>
            <select name="profileId" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
              <option value="">Select an account…</option>
              {notYetPayees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName ?? "(no name)"} — {a.email ?? "no email"}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-sans text-caption text-ordift-ink-muted">Category</span>
            <select name="category" required className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
              {PAYEE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-sans text-caption text-ordift-ink-muted">Service classification (optional)</span>
            <select name="operationalTitleId" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small">
              <option value="">—</option>
              {operationalTitles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-sans text-caption text-ordift-ink-muted">Company name (optional)</span>
            <input name="companyName" className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="font-sans text-caption text-ordift-ink-muted">Notes (optional)</span>
            <textarea name="notes" rows={2} className="rounded-lg border border-black/15 px-3 py-2 font-sans text-body-small" />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="rounded-lg bg-ordift-ink px-4 py-2 font-sans text-body-small text-white hover:opacity-90">
              Add Payee
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Existing Payees</h2>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {payees.map((p) => (
            <li key={p.id} className="px-4 py-3">
              <Link href={`/admin/payables/payees/${p.id}`} className="block hover:opacity-70">
                <p className="font-sans text-body-small text-ordift-ink">{p.fullName ?? "(no name)"}</p>
                <p className="font-sans text-caption text-ordift-ink-muted">
                  {p.category} {p.operationalTitleName ? `· ${p.operationalTitleName}` : ""} · {p.status}
                </p>
              </Link>
            </li>
          ))}
          {payees.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None yet.</li>}
        </ul>
      </section>
    </div>
  );
}
