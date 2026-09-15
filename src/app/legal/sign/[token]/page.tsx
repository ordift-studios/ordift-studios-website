import type { Metadata } from "next";
import { getIssuedAgreementTextForSignatory } from "@/lib/legal/agreementIssuance";
import { SignatoryWorkspace } from "./SignatoryWorkspace";

export const metadata: Metadata = {
  title: "Review & Sign — Ordift Studios",
  robots: { index: false, follow: false },
};

// Public, session-less signatory review/sign page (Workforce/Employee
// Self-Service Phase, agreement-issuance bridge, 2026-09-15). No
// Supabase session — access is entirely by possession of the token in
// the URL, verified server-side inside getIssuedAgreementTextForSignatory()
// (agreementIssuance.ts) / verifySignatoryToken() (signatureEngine.ts).
// Renders the EXACT stored bytes of the issued artifact — never a live
// re-render — so what a signatory reviews here is provably the same
// content whose hash was recorded at issuance.
export default async function SignatoryReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await getIssuedAgreementTextForSignatory(token);

  if (!result.ok) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 py-16">
        <div className="max-w-md text-center space-y-2">
          <h1 className="font-serif font-medium text-body-large text-ordift-ink">This link is invalid or has expired</h1>
          <p className="font-sans text-body-small text-ordift-ink-muted">
            If you were expecting to review and sign a document, please contact Ordift Studios to request a new link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-6 py-12 lg:py-16">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">
            Ordift Studios · Document for Signature
          </p>
          <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">
            {result.agreementReference}
          </h1>
          <p className="font-sans text-body-small text-ordift-ink-muted mt-1">
            You are reviewing this document as the <span className="font-medium">{result.role}</span>.
          </p>
        </div>

        <section className="rounded-xl border border-black/10 bg-white">
          <pre className="whitespace-pre-wrap font-sans text-body-small text-ordift-ink p-6 max-h-[60vh] overflow-y-auto">{result.text}</pre>
        </section>

        <section className="rounded-xl border border-black/10 p-6">
          <SignatoryWorkspace token={token} status={result.status} />
        </section>
      </div>
    </div>
  );
}
