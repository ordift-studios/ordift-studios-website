const FORMAT_LABEL: Record<string, string> = {
  pdf: "PDF",
  docx: "Word (.docx)",
  html: "HTML",
  md: "Markdown",
};

export default function PublicationDownloads({ basePath }: { basePath: string }) {
  const formats = ["pdf", "docx", "html", "md"];
  return (
    <div className="rounded-xl border border-black/10 bg-ordift-offwhite px-5 py-4">
      <p className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-ordift-ink-muted mb-2">
        Download this document
      </p>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {formats.map((fmt) => (
          <li key={fmt}>
            <a
              href={`${basePath}.${fmt}`}
              download
              className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4 hover:text-ordift-ink"
            >
              {FORMAT_LABEL[fmt]}
            </a>
          </li>
        ))}
      </ul>
      <p className="font-sans text-caption text-ordift-ink-muted mt-2">
        Downloaded or printed copies are uncontrolled — the version on this page is always the current
        approved publication.
      </p>
    </div>
  );
}
