import type { DocumentControlMetadata } from "@/lib/legal/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

const STATUS_LABEL: Record<DocumentControlMetadata["status"], string> = {
  approved: "Approved",
  draft: "Draft",
  "under-review": "Under Review",
  superseded: "Superseded",
};

const CLASSIFICATION_LABEL: Record<DocumentControlMetadata["classification"], string> = {
  public: "Public",
  internal: "Internal",
  confidential: "Confidential",
};

export default function DocumentControlCard({ control }: { control: DocumentControlMetadata }) {
  const rows: [string, string][] = [
    ["Document Title", control.documentTitle],
    ["Document Code", control.documentCode],
    ["Publication Series", control.publicationSeries],
    ["Version", control.version],
    ["Status", STATUS_LABEL[control.status]],
    ["Classification", CLASSIFICATION_LABEL[control.classification]],
    ["Effective Date", formatDate(control.effectiveDate)],
    ["Last Updated", formatDate(control.lastUpdated)],
    ["Review Cycle", control.reviewCycle],
    ["Document Owner", control.documentOwner],
    ["Prepared By", control.preparedBy],
    ["Approved By", control.approvedBy],
  ];

  return (
    <section aria-labelledby="document-control-heading" className="rounded-xl border border-black/10 bg-white">
      <h2 id="document-control-heading" className="sr-only">
        Document Control
      </h2>
      <dl className="divide-y divide-black/5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5">
            <dt className="font-sans text-caption text-ordift-ink-muted w-40 shrink-0">{label}</dt>
            <dd className="font-sans text-body-small text-ordift-ink">{value}</dd>
          </div>
        ))}
        {control.relatedDocuments.length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5">
            <dt className="font-sans text-caption text-ordift-ink-muted w-40 shrink-0">Related Documents</dt>
            <dd className="font-sans text-body-small text-ordift-ink">
              <ul className="space-y-0.5">
                {control.relatedDocuments.map((doc) => (
                  <li key={doc.title}>
                    {doc.code ? `${doc.code} ` : ""}
                    {doc.title}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>

      {control.changeLog.length > 0 && (
        <div className="border-t border-black/5 px-5 py-3">
          <p className="font-sans text-caption font-semibold text-ordift-ink-muted mb-2">Change Log</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans text-caption">
              <thead>
                <tr className="text-ordift-ink-muted">
                  <th scope="col" className="pr-4 py-1 font-semibold">Version</th>
                  <th scope="col" className="pr-4 py-1 font-semibold">Date</th>
                  <th scope="col" className="py-1 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {control.changeLog.map((entry) => (
                  <tr key={entry.version}>
                    <td className="pr-4 py-1.5 align-top text-ordift-ink whitespace-nowrap">{entry.version}</td>
                    <td className="pr-4 py-1.5 align-top text-ordift-ink-muted whitespace-nowrap">{formatDate(entry.date)}</td>
                    <td className="py-1.5 align-top text-ordift-ink-muted">{entry.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="font-sans text-caption text-ordift-ink-muted px-5 py-3 border-t border-black/5 bg-ordift-offwhite rounded-b-xl">
        {control.controlledDocumentNotice}
      </p>
    </section>
  );
}
