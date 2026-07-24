import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import SignupForm from "./SignupForm";

export const metadata: Metadata = {
  title: "Create Account — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

export default function PortalSignupPage() {
  return (
    <main>
      <NavBar />
      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            Client Portal
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-2xl">
            Create your account.
          </h1>
          <p className="font-sans text-body text-white/70 max-w-xl mt-4">
            For clients tracking a booking and workshop participants
            managing their registrations. Model, Vendor, and Staff access
            is granted by Ordift Studios directly.
          </p>
        </div>
      </section>
      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <SignupForm />
      </section>
      <Footer />
    </main>
  );
}
