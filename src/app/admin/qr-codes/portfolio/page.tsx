import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { canManageConnectPortfolio } from "@/lib/connectPortfolio/permissions";
import type { ManagerView } from "@/lib/connectPortfolio/view";
import { loadView } from "./loadView";
import PortfolioManager from "./PortfolioManager";

export const metadata: Metadata = { title: "QR portfolio — Ordift Studios Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";                      // always the current state; never a copy built earlier

// Super Admin only. The page, each action it calls and the upload route all check the signed-in user themselves; the menu link is only a convenience and is never the security boundary.
export default async function QrPortfolioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login?next=/admin/qr-codes/portfolio");
  if (!canManageConnectPortfolio(user)) notFound();

  // A failure to reach the content service is shown as exactly that. It must never look like "nothing is published", because that would invite someone to publish over a list they cannot see.
  let view: ManagerView | null = null;
  try { view = await loadView(); } catch (e) { console.error("[qr-portfolio] could not load the manager", e instanceof Error ? e.message : e); }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href="/admin/qr-codes" className="font-sans text-caption text-ordift-ink-muted hover:text-ordift-ink">&larr; Digital Business Card (QR code)</Link>
        <h1 className="mt-2 font-serif font-medium text-section-heading text-ordift-ink">QR portfolio</h1>
        <p className="mt-2 max-w-3xl font-sans text-body-small text-ordift-ink-muted">
          The photographs visitors see when they scan the QR code. Add, replace, reorder, hide or remove photographs, check them in the preview, then publish. Nothing changes on the card page until you publish,
          and the QR code itself never changes.
        </p>
      </div>
      {view ? (
        <PortfolioManager initialView={view} />
      ) : (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-5">
          <h2 className="font-sans text-body font-medium text-red-900">The content service is not responding</h2>
          <p className="mt-2 font-sans text-body-small text-red-900">
            The list of photographs could not be loaded, so editing is switched off. This does not mean nothing is published: the card page keeps showing what it showed before. Try again in a moment.
          </p>
          <Link href="/admin/qr-codes/portfolio" className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-red-900/30 px-4 font-sans text-body-small font-medium text-red-900 hover:bg-red-100">Try again</Link>
        </div>
      )}
    </div>
  );
}
