import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import Footer from "@/components/Footer";
import LoginForm from "./LoginForm";

export const metadata: Metadata = {
  title: "Sign In — Ordift Studios Portal",
  robots: { index: false, follow: false },
};

export default async function PortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; passwordReset?: string; confirmEmail?: string }>;
}) {
  const { next, passwordReset, confirmEmail } = await searchParams;

  return (
    <main>
      <NavBar />
      <section className="bg-ordift-navy-950 text-white px-4 sm:px-8 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow lg:text-eyebrow-desktop text-ordift-gold mb-4">
            Client Portal
          </p>
          <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop max-w-2xl">
            Sign in to your account.
          </h1>
        </div>
      </section>
      <section className="bg-white px-4 sm:px-8 py-14 sm:py-20">
        <LoginForm next={next ?? ""} passwordReset={passwordReset === "1"} confirmEmail={confirmEmail === "1"} />
      </section>
      <Footer />
    </main>
  );
}
