import type { Metadata } from "next";
import { redirect } from "next/navigation";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import { getCurrentUser, isStaffOrAdmin } from "@/lib/portal/roles";
import { isPlausibleToken } from "@/lib/portal/claims";
import ClaimForm from "./ClaimForm";

export const metadata: Metadata = { title: "Link your project — Ordift Studios Portal", robots: { index: false, follow: false } };

// Nothing about the project is shown here: the page cannot tell a real link from a made-up one without using a try, and it must not reveal either way. The proxy has already sent a signed-out visitor to
// sign in (and back here afterwards).
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/portal/login?next=${encodeURIComponent(`/portal/claim/${token}`)}`);
  const staff = isStaffOrAdmin(user);
  return (
    <main>
      <NavBar />
      <section className="bg-ordift-navy-950 px-4 py-16 text-white sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="mb-4 font-sans text-eyebrow font-semibold uppercase tracking-[0.2em] text-ordift-gold">Client Portal</p>
          <h1 className="max-w-2xl font-serif text-page-title font-medium sm:text-page-title-tablet lg:text-page-title-desktop">Link your project to your account.</h1>
        </div>
      </section>
      <section className="bg-white px-4 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl space-y-6">
          {staff ? (
            <p role="alert" className="max-w-xl rounded-lg bg-amber-50 px-4 py-3 font-sans text-body-small text-amber-900">You are signed in with a staff account. A client&apos;s project can only be linked from the client&apos;s own account: sign out, then sign in (or create an account) as the client, and open this link again.</p>
          ) : !isPlausibleToken(token) ? (
            <p className="max-w-xl rounded-lg bg-red-50 px-4 py-3 font-sans text-body-small text-red-700">This link is no longer valid. Ask ORDIFT STUDIOS for a new one.</p>
          ) : (
            <>
              <p className="max-w-xl font-sans text-body text-ordift-ink-muted">You are signed in as yourself. To protect your project and its payments, we check that this link was given to you: enter the 6-digit code you were given.</p>
              <ClaimForm token={token} />
            </>
          )}
        </div>
      </section>
      <Footer />
    </main>
  );
}
