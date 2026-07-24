import type { Testimonial } from "@/lib/content/types";

export default function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-5 sm:p-6">
      {testimonial.isPlaceholder && (
        <p className="font-sans text-caption font-semibold uppercase tracking-[0.1em] text-ordift-gold-pressed mb-3">
          Placeholder — not a real testimonial
        </p>
      )}
      <p className="font-serif text-body text-ordift-ink mb-4 leading-relaxed">
        &ldquo;{testimonial.quote}&rdquo;
      </p>
      <p className="font-sans text-body-small font-medium text-ordift-ink">
        {testimonial.authorName}
      </p>
      {testimonial.authorRole && (
        <p className="font-sans text-caption text-ordift-ink-muted">{testimonial.authorRole}</p>
      )}
    </div>
  );
}
