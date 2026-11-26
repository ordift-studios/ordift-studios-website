import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/portal/roles";
import { loadStandardsStateFor } from "@/lib/instructors/standards";
import { ACKNOWLEDGEMENT_CONSENT } from "@/lib/instructors/rules";
import { AcknowledgeStandardsForm } from "../AcknowledgeStandardsForm";
import { RecordedConfirmation } from "./RecordedConfirmation";

export const metadata: Metadata = { title: "Independent Instructor Standards — Ordift Studios Portal", robots: { index: false, follow: false } };

// ONE page for the whole acknowledgement: read the complete approved text, type your full name, tick the confirmation, submit. The instructor is always the signed-in session user; the text, hash and
// consent wording come from the adopted version and the existing rules, unchanged. No engagement, payee profile or payment destination is needed to reach it.
const longDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function InstructorStandardsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/portal/login?next=/portal/instructor/standards");
  const state = await loadStandardsStateFor(user.id); // "not_available" unless this is an independent instructor and a version is adopted

  if (state.state === "not_available") {
    return (
      <div className="space-y-6 max-w-3xl">
        <p><Link href="/portal/instructor" className="inline-block py-2 font-sans text-body-small underline underline-offset-4">← Back to your instructor dashboard</Link></p>
        <h1 className="font-serif font-medium text-section-heading text-ordift-ink">Independent Instructor Standards</h1>
        <p className="font-sans text-body-small text-ordift-ink-muted">There is nothing for you to acknowledge here at the moment. If you were asked to acknowledge the standards, please reply to the email you received from ORDIFT STUDIOS.</p>
      </div>
    );
  }

  const v = state.version;
  return (
    <div className="space-y-6 max-w-3xl">
      <p><Link href="/portal/instructor" className="inline-block py-2 font-sans text-body-small underline underline-offset-4">← Back to your instructor dashboard</Link></p>
      <div>
        <p className="font-sans font-semibold uppercase tracking-[0.2em] text-eyebrow text-ordift-gold-pressed mb-2">Instructor</p>
        <h1 className="font-serif font-medium text-section-heading lg:text-section-heading-desktop text-ordift-ink">{v.title} (Version {v.versionLabel})</h1>
      </div>

      {state.state === "acknowledged" ? (
        <RecordedConfirmation>
          <h2 className="font-serif font-medium text-body text-green-950">Your acknowledgment has been recorded</h2>
          <p className="font-sans text-body-small text-green-950">Thank you. Your acknowledgment of the ORDIFT STUDIOS Independent Instructor Standards (Version {v.versionLabel}) has been successfully recorded on {longDate(state.acknowledgedAt)}.</p>
          <p className="font-sans text-body-small text-green-950">Our onboarding team will contact you regarding the next stage of your instructor onboarding and workshop programme. No further action is required at this time.</p>
          <Link href="/portal/instructor" className="flex min-h-11 w-full sm:w-auto sm:inline-flex items-center justify-center rounded-lg bg-ordift-gold px-5 py-2 font-sans text-body-small font-semibold text-ordift-navy-950 hover:bg-ordift-gold-hover">Return to your dashboard</Link>
        </RecordedConfirmation>
      ) : (
        <section className="rounded-xl border border-black/10 bg-white p-5 space-y-2">
          <h2 className="font-serif font-medium text-body text-ordift-ink">What to do</h2>
          <ol className="list-decimal pl-5 space-y-1 font-sans text-body-small text-ordift-ink">
            <li>Read the standards below in full.</li>
            <li>Type your full name.</li>
            <li>Tick the confirmation box.</li>
            <li>Press the acknowledge button.</li>
          </ol>
          <p className="font-sans text-caption text-ordift-ink-muted">This does not affect your signed agreement, and you do not need a workshop assignment, payee profile or payment details to complete it.</p>
        </section>
      )}

      <section aria-labelledby="standards-text-heading" className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
        <h2 id="standards-text-heading" className="font-serif font-medium text-body text-ordift-ink">The standards (Version {v.versionLabel})</h2>
        <div tabIndex={0} aria-label="Full text of the Independent Instructor Standards" className="max-h-[32rem] overflow-auto rounded-lg border border-black/10 bg-ordift-offwhite p-3 focus-visible:outline focus-visible:outline-2">
          <pre className="whitespace-pre-wrap break-words font-sans text-body-small text-ordift-ink">{v.bodyText}</pre>
        </div>
        <dl className="space-y-1 font-sans text-caption text-ordift-ink-muted">
          <div><dt className="inline font-medium text-ordift-ink">Designated Ordift contact: </dt><dd className="inline">{v.designatedContact}</dd></div>
          <div><dt className="inline font-medium text-ordift-ink">Safeguarding contact: </dt><dd className="inline">{v.safeguardingContact}</dd></div>
          <div><dt className="inline font-medium text-ordift-ink">Escalation: </dt><dd className="inline">{v.escalationContact}</dd></div>
          <div><dt className="inline font-medium text-ordift-ink">In an emergency: </dt><dd className="inline">{v.emergencyInstructions}</dd></div>
        </dl>
        <p className="font-sans text-caption text-ordift-ink-muted">Document SHA-256 <span className="font-mono break-all">{v.bodySha256}</span></p>
      </section>

      {state.state === "pending" && (
        <section className="rounded-xl border border-black/10 bg-white p-5 space-y-3">
          <h2 className="font-serif font-medium text-body text-ordift-ink">Acknowledge</h2>
          <AcknowledgeStandardsForm versionId={v.id} sha256={v.bodySha256} consentText={ACKNOWLEDGEMENT_CONSENT} />
        </section>
      )}
    </div>
  );
}
