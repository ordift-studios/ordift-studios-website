import { CONCLUSION_LABELS, NOT_COUNSEL_APPROVAL_STATEMENT, TEXT_RELATION_LABELS, type Conclusion, type TextRelation } from "@/lib/legal/founderApproval";
import type { FounderApprovalView } from "@/lib/legal/founderApprovalActions";
import FounderApprovalForm from "./FounderApprovalForm";
import { RegisterMasterForm, StartReviewForm } from "./StepForms";

// FOUNDER APPROVAL screen body (server-renderable). Only the Founder sees the forms; everyone allowed here sees the facts. Nothing here activates, publishes or issues.
type Found = Extract<FounderApprovalView, { found: true }>;
const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (<section className="rounded-xl border border-black/10 bg-white p-6 space-y-3"><h2 className="font-serif font-medium text-body text-ordift-ink">{title}</h2>{children}</section>);
const Mono = ({ children }: { children: React.ReactNode }) => <span className="font-mono text-caption break-all text-ordift-ink">{children}</span>;
const ROLE_LABEL: Record<string, string> = { active_baseline: "Active baseline (comparison)", historical_placeholder: "Historical placeholder", target: "This version (under review)", other: "Other" };
const when = (iso: string | null) => (iso ? new Date(iso).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "—");
const get = (m: Record<string, unknown>, ...path: string[]): unknown => path.reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Record<string, unknown>)[k] : undefined), m);
const txt = (v: unknown) => (typeof v === "string" && v ? v : "—");

export default function FounderApprovalPanel({ view }: { view: Found }) {
  const t = view.target;
  const open = view.preconditions.filter((p) => !p.ok);
  const stepOneOpen = t.status === "draft";
  const registerOpen = !view.registered && t.status === "legal_review";
  const readyForApproval = !view.record && open.every((p) => p.key === "integrity") && t.status === "legal_review" && view.registered;
  const m = view.record?.metadata ?? null;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 font-sans text-body-small text-amber-950" role="note">
        <p className="font-semibold">What this screen records</p>
        <p className="mt-1">{NOT_COUNSEL_APPROVAL_STATEMENT} It does not activate, publish or issue {view.code} {t.version}, and it does not change the active version.</p>
      </div>

      <Card title={`${view.code} · ${view.title}`}>
        <div className="overflow-x-auto"><table className="w-full text-left font-sans text-body-small">
          <thead><tr className="border-b border-black/10 text-caption uppercase tracking-wide text-ordift-ink-muted"><th className="py-2 pr-3">Version</th><th className="pr-3">Status</th><th className="pr-3">Role in this review</th><th className="pr-3">Approver label</th><th>Approval stamp</th></tr></thead>
          <tbody>{view.versions.map((v) => (
            <tr key={v.id} className="border-b border-black/5 align-top">
              <td className="py-2 pr-3 text-ordift-ink">{v.version}</td><td className="pr-3">{v.status}</td>
              <td className="pr-3"><span className="font-semibold">{ROLE_LABEL[v.role]}</span><br /><span className="text-caption text-ordift-ink-muted">{v.note}</span></td>
              <td className="pr-3">{v.approvedBy ?? "—"}</td><td>{v.approvedAt ? when(v.approvedAt) : "none"}</td>
            </tr>))}</tbody></table></div>
        <p className="font-sans text-caption text-ordift-ink-muted">The comparison baseline is the active version (the live Master Booking Terms). The historical placeholder is a status label with no text, date or evidence; it is not an approval and is not used. A separate counsel-approved version, if one is provided, is a decision for you, not assumed here.</p>
      </Card>

      <Card title={`The version under review: ${view.code} ${t.version}`}>
        <dl className="grid grid-cols-1 sm:grid-cols-[14rem_1fr] gap-x-4 gap-y-1 font-sans text-body-small">
          <dt className="text-ordift-ink-muted">Status</dt><dd>{t.status}</dd>
          <dt className="text-ordift-ink-muted">Registered master (Word) SHA-256</dt><dd><Mono>{t.docxSha256 ?? "not recorded"}</Mono></dd>
          <dt className="text-ordift-ink-muted">Registered master (PDF) SHA-256</dt><dd><Mono>{t.pdfSha256 ?? "not recorded"}</Mono></dd>
          <dt className="text-ordift-ink-muted">Content reference</dt><dd><Mono>{t.contentReference ?? "not registered yet"}</Mono></dd>
          <dt className="text-ordift-ink-muted">Approval stamp</dt><dd>{t.approvedAt ? `${when(t.approvedAt)} · ${t.approvedBy ?? ""}` : "none"}</dd>
        </dl>
      </Card>

      <Card title="What must be true before the approval can be recorded">
        <ul className="space-y-1 font-sans text-body-small">
          {view.preconditions.map((p) => (<li key={p.key} className="flex gap-2"><span aria-hidden>{p.ok ? "✓" : "○"}</span><span><span className="text-ordift-ink">{p.label}.</span> <span className="text-ordift-ink-muted">{p.detail}</span></span></li>))}
        </ul>
      </Card>

      {view.record && m && (
        <Card title="The recorded Founder approval">
          <p className="font-sans text-body-small text-ordift-ink">Recorded {when(view.record.recordedAt)} by {view.record.actorLabel ?? "the Founder"}. {NOT_COUNSEL_APPROVAL_STATEMENT}</p>
          <dl className="grid grid-cols-1 sm:grid-cols-[14rem_1fr] gap-x-4 gap-y-2 font-sans text-body-small">
            <dt className="text-ordift-ink-muted">Consultation</dt><dd>Telephone, {txt(get(m, "consultation", "date"))}, {txt(get(m, "consultation", "startTime"))}–{txt(get(m, "consultation", "endTime"))} ({txt(get(m, "consultation", "timezone"))}). Counsel: {txt(get(m, "consultation", "counselName"))}, {txt(get(m, "consultation", "counselFirm"))}.</dd>
            <dt className="text-ordift-ink-muted">How identity was checked</dt><dd className="whitespace-pre-wrap">{txt(get(m, "consultation", "identityCheckNote"))}</dd>
            <dt className="text-ordift-ink-muted">Counsel&apos;s recommendations</dt><dd className="whitespace-pre-wrap">{txt(get(m, "advice", "recommendations"))}</dd>
            <dt className="text-ordift-ink-muted">Amendments requested</dt><dd className="whitespace-pre-wrap">{txt(get(m, "advice", "amendmentsRequested"))}</dd>
            <dt className="text-ordift-ink-muted">Counsel&apos;s conclusion</dt><dd>{CONCLUSION_LABELS[get(m, "advice", "conclusion") as Conclusion] ?? "—"}: <span className="whitespace-pre-wrap">{txt(get(m, "advice", "conclusionNote"))}</span></dd>
            <dt className="text-ordift-ink-muted">Final text approved</dt><dd>Version {txt(get(m, "document", "version"))}; Word SHA-256 <Mono>{txt(get(m, "document", "docxSha256"))}</Mono>; PDF SHA-256 <Mono>{txt(get(m, "document", "pdfSha256"))}</Mono></dd>
            <dt className="text-ordift-ink-muted">Draft counsel heard</dt><dd><Mono>{txt(get(m, "document", "reviewedDraftSha256"))}</Mono><br />{TEXT_RELATION_LABELS[get(m, "document", "textRelation") as TextRelation] ?? "—"}</dd>
            <dt className="text-ordift-ink-muted">Your confirmation</dt><dd>Statement accepted; hash prefix <Mono>{txt(get(m, "confirmation", "typedHashPrefix"))}</Mono>; typed “{txt(get(m, "confirmation", "typedSentence"))}”.</dd>
            <dt className="text-ordift-ink-muted">Still not done</dt><dd>Not activated, not published, not issued.</dd>
          </dl>
        </Card>
      )}

      {!view.founder.hasActiveFounder && !view.record && <Card title="No active Founder identity"><p className="font-sans text-body-small text-ordift-ink">No Founder identity is on record, so no Founder approval can be recorded.</p></Card>}
      {view.founder.hasActiveFounder && !view.founder.viewerIsFounder && !view.record && <Card title="Founder only"><p className="font-sans text-body-small text-ordift-ink">Only the Founder can start the review, register the master or record the approval. You can read everything on this screen.</p></Card>}

      {view.founder.viewerIsFounder && !view.record && (
        <>
          <Card title="Step 1 · Start the legal review"><p className="font-sans text-body-small text-ordift-ink-muted">Moves the draft into legal review by the registry&apos;s own transition. It approves nothing.</p>{stepOneOpen ? <StartReviewForm versionId={t.id} /> : <p className="font-sans text-body-small text-ordift-ink">{t.status === "draft" ? "" : "Done: the version is past draft."}</p>}</Card>
          <Card title="Step 2 · Verify and register the stored master"><p className="font-sans text-body-small text-ordift-ink-muted">The existing registry control: the stored Word and PDF files are re-hashed against the checksums recorded at import, the Word text is checked for unresolved counsel-review clauses, and only then is the content reference written.</p>{registerOpen ? <RegisterMasterForm versionId={t.id} /> : <p className="font-sans text-body-small text-ordift-ink">{view.registered ? "Done: registered." : "Available once the review has started."}</p>}</Card>
          <Card title="Step 3 · Record your Founder approval after the call">
            {readyForApproval ? <FounderApprovalForm versionId={t.id} code={view.code} version={t.version} docxSha256={t.docxSha256 ?? ""} /> : <p className="font-sans text-body-small text-ordift-ink-muted">Not available yet: complete the open items listed above.</p>}
          </Card>
        </>
      )}
    </div>
  );
}
