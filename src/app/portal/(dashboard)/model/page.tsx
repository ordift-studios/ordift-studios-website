import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/portal/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My Profile — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending Review",
  active: "Active",
  inactive: "Inactive",
};

// Talent Management is still Phase 1B (see ARCHITECTURE.md / Plan Part
// D) — no application form, portfolio upload, or booking workflow
// exists yet. This page shows the one real thing that does exist (your
// account's status, set by an administrator) rather than a placeholder
// with fake features.
export default async function ModelPortalPage() {
  const user = await getCurrentUser();
  const supabase = await createClient();
  const { data: profile } = user
    ? await supabase.from("model_profiles").select("status").eq("id", user.id).maybeSingle()
    : { data: null };

  return (
    <div>
      <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
        Talent
      </p>
      <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink mb-8">
        My Profile
      </h1>

      <div className="bg-white border border-black/10 rounded-2xl p-8">
        <p className="font-sans text-caption uppercase tracking-wide text-ordift-ink-muted mb-2">
          Status
        </p>
        <p className="font-serif text-body text-ordift-ink mb-6">
          {profile ? STATUS_LABELS[profile.status] ?? profile.status : "Not yet set up"}
        </p>
        <p className="font-sans text-body-small text-ordift-ink-muted max-w-xl">
          The full Talent Management platform — portfolio, availability,
          bookings, and applications — is on the Ordift Studios roadmap
          and isn&apos;t built yet. For now, Ordift Studios manages your
          representation directly; reach out with any questions.
        </p>
      </div>
    </div>
  );
}
