import type { AcknowledgementState } from "@/lib/instructors/standards";
import { ACKNOWLEDGEMENT_CONSENT } from "@/lib/instructors/rules";
import { AcknowledgeStandardsForm } from "./AcknowledgeStandardsForm";

// Independent Instructor Standards: shown only when management has ADOPTED a version. Employee HR policies are never shown here. Acknowledgement is required before the first workshop assignment;
// it does not affect the framework agreement or its signing link.
export function InstructorStandardsCard({ state }: { state: AcknowledgementState }) {
  if (state.state === "not_available") return null;
  const v = state.version;
  return (
    <section aria-labelledby="instructor-standards-heading" className="rounded-xl border border-black/10 bg-white p-6 space-y-3">
      <h2 id="instructor-standards-heading" className="font-serif font-medium text-body text-ordift-ink">{v.title} (version {v.versionLabel})</h2>
      <p className="font-sans text-caption text-ordift-ink-muted">These standards apply to independent instructors. You acknowledge them once per version, before your first workshop assignment. Signing your framework agreement does not depend on this.</p>
      {state.state === "acknowledged" ? (
        <p className="font-sans text-body-small text-green-800">You acknowledged this version on {new Date(state.acknowledgedAt).toUTCString()} (document SHA-256 <span className="font-mono break-all">{state.sha256}</span>).</p>
      ) : null}
      <details open={state.state === "pending"} className="rounded-lg border border-black/10 bg-ordift-offwhite p-3">
        <summary className="cursor-pointer font-sans text-body-small font-medium text-ordift-ink">Read the standards</summary>
        <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap font-sans text-body-small text-ordift-ink">{v.bodyText}</pre>
        <dl className="mt-3 space-y-1 font-sans text-caption text-ordift-ink-muted">
          <div><dt className="inline font-medium text-ordift-ink">Designated Ordift contact: </dt><dd className="inline">{v.designatedContact}</dd></div>
          <div><dt className="inline font-medium text-ordift-ink">Safeguarding contact: </dt><dd className="inline">{v.safeguardingContact}</dd></div>
          <div><dt className="inline font-medium text-ordift-ink">Escalation: </dt><dd className="inline">{v.escalationContact}</dd></div>
          <div><dt className="inline font-medium text-ordift-ink">In an emergency: </dt><dd className="inline">{v.emergencyInstructions}</dd></div>
        </dl>
        <p className="mt-2 font-sans text-caption text-ordift-ink-muted">Document SHA-256 <span className="font-mono break-all">{v.bodySha256}</span></p>
      </details>
      {state.state === "pending" ? <AcknowledgeStandardsForm versionId={v.id} sha256={v.bodySha256} consentText={ACKNOWLEDGEMENT_CONSENT} /> : null}
    </section>
  );
}
