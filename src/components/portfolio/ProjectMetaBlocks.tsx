import type { PortfolioProject, Testimonial } from "@/lib/content/types";
import TestimonialCard from "@/components/TestimonialCard";

// Shared field blocks used by every discipline-specific project view
// (Photography/Videography/Graphic Design) and the generic fallback.
// Deliberately excludes Objective/Strategy/Challenges/Solution/Process —
// those stay Workshop/case-study-only per the Portfolio redesign. Nothing
// here is discipline-specific; the data itself (deliverables, awards,
// testimonials, downloads) reads as credibility/reference info, not
// process explanation, so it stays visible across all views.

export function CollaboratorsBlock({ project }: { project: PortfolioProject }) {
  if (project.collaborators.length === 0) return null;
  return (
    <div className="mb-8">
      <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">Collaborators</h2>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {project.collaborators.map((c) => (
          <li key={c.id} className="font-sans text-body-small text-ordift-ink">
            <span className="font-medium">{c.name}</span>{" "}
            <span className="text-ordift-ink-muted">— {c.role}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DeliverablesBlock({ project }: { project: PortfolioProject }) {
  if (project.deliverables.length === 0) return null;
  return (
    <div className="mb-8">
      <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">Deliverables</h2>
      <ul className="flex flex-col gap-2">
        {project.deliverables.map((item, i) => (
          <li key={i} className="font-sans text-body-small text-ordift-ink flex gap-2">
            <span className="text-ordift-gold-pressed">—</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ResultsBlock({ project }: { project: PortfolioProject }) {
  if (!project.results) return null;
  return (
    <div className="mb-8 rounded-lg bg-ordift-offwhite p-5">
      <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-2">Results &amp; Impact</h2>
      <p className="font-sans text-body-small text-ordift-ink-muted">{project.results}</p>
    </div>
  );
}

export function AwardsPublicationsBlock({ project }: { project: PortfolioProject }) {
  if (project.awards.length === 0 && project.publications.length === 0) return null;
  return (
    <div className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
      {project.awards.length > 0 && (
        <div>
          <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">Awards</h2>
          <ul className="flex flex-col gap-2">
            {project.awards.map((a) => (
              <li key={a.id} className="font-sans text-body-small text-ordift-ink">
                {a.title} <span className="text-ordift-ink-muted">— {a.issuer}{a.year ? `, ${a.year}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {project.publications.length > 0 && (
        <div>
          <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">Publications</h2>
          <ul className="flex flex-col gap-2">
            {project.publications.map((p) =>
              p.url ? (
                <li key={p.id}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4"
                  >
                    {p.name}
                  </a>
                </li>
              ) : (
                <li key={p.id} className="font-sans text-body-small text-ordift-ink">
                  {p.name}
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DownloadsBlock({ project }: { project: PortfolioProject }) {
  if (project.downloadableAssets.length === 0) return null;
  return (
    <div className="mb-8">
      <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">Downloads</h2>
      <ul className="flex flex-col gap-2">
        {project.downloadableAssets.map((asset) => (
          <li key={asset.id}>
            <a
              href={asset.url}
              className="font-sans text-body-small text-ordift-gold-pressed underline underline-offset-4"
            >
              {asset.label} ({asset.fileType})
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TestimonialsBlock({ testimonials }: { testimonials: Testimonial[] }) {
  if (testimonials.length === 0) return null;
  return (
    <div className="mb-8">
      <h2 className="font-serif font-medium text-card-title text-ordift-ink mb-3">What the client says</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {testimonials.map((t) => (
          <TestimonialCard key={t.id} testimonial={t} />
        ))}
      </div>
    </div>
  );
}
