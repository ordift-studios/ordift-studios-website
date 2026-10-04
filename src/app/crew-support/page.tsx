import type { Metadata } from "next";
import Link from "next/link";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import CrewSupportForm, { type RoleOption } from "./CrewSupportForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { visitorFormsOpen } from "@/lib/shared/env";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ordiftstudios.com";
const TITLE = "Creative Crew Support — Ordift Studios";
const DESCRIPTION = "Need an extra pair of hands on your production? Request experienced creative professionals to support your existing team.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/crew-support` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/crew-support`, type: "website" },
};

// Role options come from the existing operational_titles lookup — never a
// second, hard-coded role list. A failed read just means the form offers
// the free-text "Other role" option only.
async function loadRoleOptions(): Promise<RoleOption[]> {
  try {
    const { data, error } = await createAdminClient().from("operational_titles").select("id, name, slug").eq("active", true).order("sort_order");
    if (error) throw new Error(error.message);
    return (data ?? []).map((t) => ({ id: t.id as string, name: t.name as string, slug: t.slug as string }));
  } catch (error) {
    console.error("[crew-support] failed to load roles", error);
    return [];
  }
}

export default async function CrewSupportPage() {
  const roles = await loadRoleOptions();
  return (
    <main>
      <NavBar />
      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">Creative Crew Support</p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-2xl">Need an extra pair of hands on your production?</h1>
          <p className="font-sans text-body text-white/70 mt-4 max-w-2xl">
            Request experienced creative professionals to support your existing team. You stay the lead — Ordift supplies the crew.
          </p>
        </div>
      </section>

      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        {visitorFormsOpen() ? (
          <CrewSupportForm roles={roles} />
        ) : (
          <div className="max-w-2xl mx-auto text-center">
            <p className="font-serif font-medium text-card-title text-ordift-ink mb-3">Requests will open soon.</p>
            <p className="font-sans text-body text-ordift-ink-muted">We&apos;re not yet accepting requests through this form. In the meantime, please reach us through our contact details.</p>
          </div>
        )}
      </section>

      <section className="bg-ordift-offwhite px-4 sm:px-8 py-10 text-center">
        <p className="font-sans text-body-small text-ordift-ink-muted">
          Looking for Ordift to lead your photography, film or production instead?{" "}
          <Link href="/book" className="text-ordift-gold-pressed underline underline-offset-4">Book a service</Link>
        </p>
      </section>
      <Footer />
    </main>
  );
}
