import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isSuperAdmin } from "@/lib/portal/roles";
import { bookingFlagOn } from "@/lib/bookings/rules";
import { listSettingsVersions } from "@/lib/bookings/panel";
import BookingSettingsForm from "./BookingSettingsForm";

export const metadata: Metadata = { title: "Booking rules — Ordift Studios Admin", robots: { index: false, follow: false } };

// Versioned booking rules and the agreement threshold. Super Admin only; hidden (redirect) for everyone else and while the booking flag is off.
export default async function BookingRulesPage() {
  const user = await getCurrentUser();
  if (!user || !isSuperAdmin(user)) redirect("/admin/overview");
  if (!bookingFlagOn()) return (
    <div className="space-y-4"><Link href="/admin/settings" className="font-sans text-body-small text-ordift-gold-pressed underline">← Settings</Link><h1 className="font-serif font-medium text-section-heading text-ordift-ink">Booking rules</h1><p className="font-sans text-body-small text-ordift-ink-muted">Booking confirmation is not switched on.</p></div>
  );
  const versions = await listSettingsVersions();
  const cur = versions[0];
  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/settings" className="font-sans text-body-small text-ordift-gold-pressed underline">← Settings</Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-2">Booking rules</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">Internal business rules that decide when a booking needs an executed agreement. They are not legal thresholds. A change is recorded as a new version; bookings already confirmed keep the version they were confirmed under.</p>
      </div>
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-4">
        <h2 className="font-serif font-medium text-body text-ordift-ink">Record a new version</h2>
        {cur ? <p className="font-sans text-caption text-ordift-ink-muted">The form starts from version {cur.version} ({cur.status}).</p> : <p className="font-sans text-body-small text-amber-900">No rules exist yet. Bookings cannot be confirmed until a version is recorded.</p>}
        <BookingSettingsForm initial={{ thresholds: Object.entries(cur?.thresholds ?? {}).map(([c, n]) => `${c}=${n}`).join("\n"), alwaysCategories: (cur?.alwaysCategories ?? []).join("\n"), escalators: (cur?.escalators ?? []).join("\n") }} />
      </section>
      <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
        <h2 className="font-serif font-medium text-body text-ordift-ink">History</h2>
        {versions.length === 0 ? <p className="font-sans text-body-small text-ordift-ink-muted">None yet.</p> : versions.map((v) => (
          <div key={v.version} className="border-t border-black/5 pt-3 font-sans text-body-small text-ordift-ink">
            <p className="font-medium">Version {v.version} · {v.status} · {new Date(v.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
            <p className="text-ordift-ink-muted">Thresholds: {Object.entries(v.thresholds).map(([c, n]) => `${c} ${n}`).join(", ") || "none"} · Always: {v.alwaysCategories.join(", ") || "none"} · Circumstances: {v.escalators.join(", ") || "none"}</p>
            {v.note ? <p className="text-ordift-ink-muted">Note: {v.note}</p> : null}
          </div>
        ))}
      </section>
    </div>
  );
}
