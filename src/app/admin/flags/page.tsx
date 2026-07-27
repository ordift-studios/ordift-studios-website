import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole } from "@/lib/portal/roles";
import { getFeatureFlags } from "@/lib/admin/flags";
import { toggleFlagAction, createFlagAction } from "./actions";

export const metadata: Metadata = {
  title: "Feature Flags — Ordift Studios Admin",
  robots: { index: false, follow: false },
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminFlagsPage() {
  const user = await getCurrentUser();
  if (!user || !hasRole(user, "admin")) redirect("/admin/overview");

  const flags = await getFeatureFlags();

  return (
    <div className="space-y-10">
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
          Admin
        </p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
          Feature Flags
        </h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2 max-w-2xl">
          Business-level toggles, changeable instantly without a deploy. Infrastructure-critical
          flags (legal approval, production email sending) stay in Vercel by design — see Settings.
        </p>
      </div>

      {flags.length === 0 ? (
        <p className="font-sans text-body-small text-ordift-ink-muted">No feature flags yet.</p>
      ) : (
        <div className="rounded-xl border border-black/10 bg-white divide-y divide-black/5">
          {flags.map((flag) => (
            <div key={flag.id} className="px-5 py-4 flex items-center justify-between gap-4">
              <div>
                <p className="font-sans text-body-small text-ordift-ink font-medium">{flag.key}</p>
                {flag.description && (
                  <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">{flag.description}</p>
                )}
                <p className="font-sans text-caption text-ordift-ink-muted mt-0.5">
                  Updated {formatDateTime(flag.updatedAt)}
                </p>
              </div>
              <form action={toggleFlagAction}>
                <input type="hidden" name="flagId" value={flag.id} />
                <input type="hidden" name="nextEnabled" value={(!flag.enabled).toString()} />
                <button
                  type="submit"
                  className={`min-h-9 px-4 rounded-full font-sans text-caption font-semibold whitespace-nowrap ${
                    flag.enabled ? "bg-ordift-gold text-ordift-navy-950" : "bg-black/10 text-ordift-ink-muted"
                  }`}
                >
                  {flag.enabled ? "Enabled" : "Disabled"}
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-black/10 bg-white p-6">
        <h2 className="font-serif font-medium text-body text-ordift-ink mb-4">New Flag</h2>
        <form action={createFlagAction} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="flag-key" className="font-sans text-caption text-ordift-ink-muted block mb-1">
              Key
            </label>
            <input
              id="flag-key"
              type="text"
              name="key"
              required
              placeholder="e.g. show_maintenance_banner"
              className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
            />
          </div>
          <div className="flex-1 min-w-[240px]">
            <label htmlFor="flag-description" className="font-sans text-caption text-ordift-ink-muted block mb-1">
              Description (optional)
            </label>
            <input
              id="flag-description"
              type="text"
              name="description"
              className="w-full min-h-11 rounded-lg border border-black/15 bg-white px-3 font-sans text-body-small text-ordift-ink"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 px-5 rounded-full bg-ordift-navy-950 text-white font-sans text-body-small"
          >
            Create
          </button>
        </form>
      </div>
    </div>
  );
}
