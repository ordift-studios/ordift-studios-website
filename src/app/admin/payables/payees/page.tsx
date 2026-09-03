import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, FINANCE_CAPABILITIES } from "@/lib/organization/authority";
import { listPayeeProfiles } from "@/lib/payables/payeeProfiles";
import { listUsersWithRoles, listOperationalTitles } from "@/lib/portal/adminData";
import AddPayeeForm from "./AddPayeeForm";

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
  // Email isn't part of PayeeProfile itself (profiles carries no email
  // column — only auth.users does, via listUsersWithRoles()'s existing
  // Admin-API-backed lookup, already fetched above for the "existing
  // account" picker). Merged here for display only, not persisted.
  const emailByProfileId = new Map(accounts.map((a) => [a.id, a.email]));

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
        <AddPayeeForm notYetPayees={notYetPayees} operationalTitles={operationalTitles} />
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Existing Payees ({payees.length})</h2>
        {payees.length === 0 ? (
          <p className="font-sans text-body-small text-ordift-ink-muted rounded-lg border border-dashed border-black/15 px-4 py-6 text-center">
            No payees have been onboarded yet — use the form above to classify the first one.
          </p>
        ) : (
          <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
            {payees.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/payables/payees/${p.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-black/[0.02]">
                  <div>
                    <p className="font-sans text-body-small font-medium text-ordift-ink">{p.fullName ?? "(no name)"}</p>
                    <p className="font-sans text-caption text-ordift-ink-muted">{emailByProfileId.get(p.id) ?? "no email on file"}</p>
                    <p className="font-sans text-caption text-ordift-ink-muted mt-1">
                      {p.category}
                      {p.operationalTitleName ? ` · ${p.operationalTitleName}` : ""}
                      {p.companyName ? ` · ${p.companyName}` : ""} · {p.status}
                    </p>
                  </div>
                  <span className="font-sans text-caption text-ordift-ink underline underline-offset-4 shrink-0">View / Manage →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
