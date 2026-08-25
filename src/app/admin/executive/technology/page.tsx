import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { authorizeWithSuperAdminOverride, IDENTITY_CAPABILITIES } from "@/lib/organization/authority";
import { listCorporateIdentities } from "@/lib/organization/reserveCorporateIdentity";

export const metadata: Metadata = {
  title: "Technology — Executive — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// GEEK's jurisdiction hub. Reuses public.corporate_identities (Workshop
// Management V1 shares nothing with this — it's the Phase 3.3 corporate
// email identity system). Reservation/status actions live on
// /admin/operations (unchanged) — this page is a read-only,
// jurisdiction-framed view over the same real data.
export default async function ExecutiveTechnologyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/overview");
  const auth = await authorizeWithSuperAdminOverride(user.id, IDENTITY_CAPABILITIES.view);
  if (!auth.ok) redirect("/admin/executive");

  const identities = await listCorporateIdentities();

  return (
    <div className="space-y-8">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · Executive</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">GEEK · Technology</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Corporate digital identity administration and technology-system capabilities. No general technical-
          infrastructure/integration-administration surface exists yet beyond corporate identity — reported here
          honestly rather than fabricated.{" "}
          {auth.actedAsOverride && "Viewing via Super Admin override — this Position is currently unoccupied."}
        </p>
      </div>

      <section className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-3">Corporate Identities</h2>
        <p className="font-sans text-caption text-ordift-ink-muted mb-3">
          Reserved internally only — no external mailbox provider is connected yet. Manage from{" "}
          <a href="/admin/operations" className="underline underline-offset-4">Operations (utility view)</a>.
        </p>
        <ul className="divide-y divide-black/5 rounded-lg border border-black/5">
          {identities.map((i) => (
            <li key={i.id} className="px-4 py-2.5 font-sans text-body-small text-ordift-ink">
              {i.email} · {i.status}
            </li>
          ))}
          {identities.length === 0 && <li className="px-4 py-3 font-sans text-body-small text-ordift-ink-muted">None reserved yet.</li>}
        </ul>
      </section>
    </div>
  );
}
