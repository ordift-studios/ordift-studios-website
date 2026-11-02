import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { isManagementUser } from "@/lib/crewSupport/management";
import { MfaPanel } from "@/components/auth/MfaPanel";
import { TicketCheck } from "@/components/auth/TicketCheck";

export const metadata: Metadata = { title: "Two-step sign-in — Ordift Studios Admin", robots: { index: false, follow: false } };

// For the Founder and executive administrators: set up the authenticator app that confirms irreversible actions. Signing in is unchanged: this does not make anyone use a code to sign in.
export default async function SecurityPage() {
  const user = await getCurrentUser();
  if (!user || !(await isManagementUser(user))) redirect("/admin/overview");
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/admin/me" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">← My Workspace</Link>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink mt-3">Two-step confirmation</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted mt-2">An authenticator app on your phone confirms the actions that cannot be undone. Your password still signs you in; the app is asked only when you erase permission details, purge a log or change the retention policy.</p>
      </div>
      <MfaPanel />
      <TicketCheck />
    </div>
  );
}
