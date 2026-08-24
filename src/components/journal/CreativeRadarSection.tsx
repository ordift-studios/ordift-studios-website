import type { Author, Category } from "@/lib/content/types";
import type { StoriesFeedItem } from "@/lib/content/storiesFeed";
import JournalPostCard from "@/components/journal/JournalPostCard";

// "From Around the Creative World" — the curated/external Creative Radar
// surface (Phase E, 2026-08-24). Deliberately visually secondary to
// everything above it (muted background, smaller heading, more/denser
// columns) — Ordift's own Originals/Featured Work/Lead Story dominate
// the page; this is a supporting discovery layer, never the first thing
// a visitor sees. Trust badges (already rendered by JournalPostCard)
// keep every item's provenance visible at a glance. Renders nothing
// while nothing is published — this is expected on a young feed, not an
// error state.
export default function CreativeRadarSection({
  items,
  categoryById,
  authorById,
}: {
  items: StoriesFeedItem[];
  categoryById: Map<string, Category>;
  authorById: Map<string, Author>;
}) {
  if (items.length === 0) return null;

  return (
    <div className="bg-ordift-offwhite px-4 sm:px-8 py-10 sm:py-12">
      <div className="max-w-6xl mx-auto">
        <h2 className="font-sans font-semibold uppercase tracking-[0.15em] text-caption text-ordift-ink-muted mb-4">
          From Around the Creative World
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.slice(0, 8).map((item) => (
            <JournalPostCard
              key={item.id}
              post={item}
              categories={item.categoryIds.map((id) => categoryById.get(id)).filter((c): c is Category => Boolean(c))}
              author={item.authorId ? (authorById.get(item.authorId) ?? null) : null}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
