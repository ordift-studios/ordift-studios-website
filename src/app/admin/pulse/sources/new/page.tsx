import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRole, isSuperAdmin } from "@/lib/portal/roles";
import { NewSourceForm } from "./NewSourceForm";

export const metadata: Metadata = { title: "Add Pulse Source — Ordift Studios Admin", robots: { index: false, follow: false } };

// Manual Source Addition, Part N (2026-09-08).
export default async function AdminPulseNewSourcePage() {
  const user = await getCurrentUser();
  if (!user || (!hasRole(user, "admin") && !isSuperAdmin(user))) redirect("/admin/overview");

  return (
    <div>
      <Link href="/admin/pulse/sources" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">
        ← Back to Pulse Sources
      </Link>
      <div className="mt-4 mb-6">
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">Add a Pulse Source</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-1 max-w-xl">
          Register a new source for future discovery — this does not fetch or discover anything by itself.
        </p>
      </div>
      <NewSourceForm />
    </div>
  );
}
