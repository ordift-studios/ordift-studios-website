import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { ONBOARDING_CLASSIFICATIONS } from "@/lib/organization/onboardingPlaybook";

export const metadata: Metadata = {
  title: "Onboarding Playbooks — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

// Onboarding Guides / Playbook System (2026-09-16) — every classification
// listed here is GENERATED from the real onboarding stage sequence and
// requirement catalog (onboardingPlaybook.ts), never a separately
// hand-authored document. Visible to Super Admin (and Admin) so the
// correct step-by-step procedure is available even when the person who
// usually runs onboarding is unavailable.
export default async function OnboardingPlaybooksPage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  return (
    <div>
      <div className="mb-8">
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Admin · HR / People</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">Onboarding Playbooks</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          The real, current onboarding procedure for each relationship type — generated directly from the live stage
          sequence and requirement definitions that already gate onboarding, never a separate document that can drift
          out of date. Each has an Internal (Staff/Admin) view and an External (Participant) view, and can be printed
          or saved as a controlled PDF using the approved Ordift letterhead.
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted mt-2">
          Consultant reuses the Contractor / Freelancer guide — no separate engagement type exists for Consultant in
          the approved architecture.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ONBOARDING_CLASSIFICATIONS.map((c) => (
          <Link key={c.key} href={`/admin/hr/playbooks/${c.key}`} className="rounded-xl border border-black/10 bg-white p-6 hover:border-ordift-gold/60 transition-colors">
            <h2 className="font-serif font-medium text-body text-ordift-ink">{c.label}</h2>
            <p className="font-sans text-caption text-ordift-ink-muted mt-1">Internal + External guide →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
