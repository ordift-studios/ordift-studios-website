import type { Layer } from "@/lib/organization/contributorStatusLayers";

const BADGE: Record<Layer["state"], { label: string; cls: string }> = {
  done: { label: "Done", cls: "bg-green-100 text-green-800" },
  in_progress: { label: "In progress", cls: "bg-amber-100 text-amber-800" },
  not_started: { label: "Not yet", cls: "bg-black/5 text-ordift-ink-muted" },
  on_hold: { label: "On hold", cls: "bg-black/5 text-ordift-ink" },
  not_applicable: { label: "Not needed yet", cls: "bg-black/5 text-ordift-ink-muted" },
};

// Read-only. Five separate questions - finishing one never means another is done.
export default function ContributorStatusLayers({ layers }: { layers: Layer[] }) {
  return (
    <section className="rounded-xl border border-black/10 bg-white p-6 space-y-3" aria-labelledby="status-layers-heading">
      <div>
        <h2 id="status-layers-heading" className="font-serif font-medium text-body text-ordift-ink">Where things stand</h2>
        <p className="font-sans text-caption text-ordift-ink-muted">Five separate steps. Finishing one does not mean the next is done.</p>
      </div>
      <ul className="divide-y divide-black/5">
        {layers.map((l) => (
          <li key={l.key} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <p className="font-sans text-body-small font-medium text-ordift-ink">{l.title}</p>
              <p className="font-sans text-caption text-ordift-ink-muted">{l.summary}</p>
            </div>
            <span className={`inline-flex self-start rounded-full px-2.5 py-0.5 font-sans text-caption font-medium ${BADGE[l.state].cls}`}>{BADGE[l.state].label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
