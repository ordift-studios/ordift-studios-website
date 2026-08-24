import type { Author, Category } from "@/lib/content/types";
import type { StoriesFeedItem } from "@/lib/content/storiesFeed";
import JournalPostCard from "@/components/journal/JournalPostCard";

// One topic-first section on the redesigned /journal (Phase E,
// 2026-08-24). Renders nothing at all when there's no content for this
// topic — no "coming soon" filler, matching the established empty-state
// rule elsewhere on this site (Homepage About Visuals, /team,
// /work/{discipline}). A topic simply disappears from the page on a
// quiet week rather than forcing weak content into view.
export default function TopicSection({
  label,
  items,
  categoryById,
  authorById,
}: {
  label: string;
  items: StoriesFeedItem[];
  categoryById: Map<string, Category>;
  authorById: Map<string, Author>;
}) {
  if (items.length === 0) return null;

  return (
    <div className="px-4 sm:px-8 py-10 sm:py-12 max-w-6xl mx-auto">
      <h2 className="font-serif font-medium text-section-heading text-ordift-ink mb-6">{label}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.slice(0, 6).map((item) => (
          <JournalPostCard
            key={item.id}
            post={item}
            categories={item.categoryIds.map((id) => categoryById.get(id)).filter((c): c is Category => Boolean(c))}
            author={item.authorId ? (authorById.get(item.authorId) ?? null) : null}
          />
        ))}
      </div>
    </div>
  );
}
