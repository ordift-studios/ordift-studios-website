import Link from "next/link";
import type { Author, Category } from "@/lib/content/types";
import { formatDate } from "@/lib/content/journalHelpers";
import { TRUST_BADGE_LABEL, type StoriesFeedItem } from "@/lib/content/storiesFeed";
import MediaAsset from "@/components/media/MediaAsset";

// Renders one normalized Stories item — a Studio Story (JournalPost) or
// an Ordift Pulse article/opportunity, indistinguishably as far as this
// component is concerned. See storiesFeed.ts for the normalization and
// STORIES_PULSE_INTEGRATION.md for why Pulse content renders inside the
// existing Journal card rather than a parallel component.
const TRUST_BADGE_CLASS: Record<StoriesFeedItem["trustBadge"], string> = {
  verified: "bg-ordift-gold text-ordift-navy-950",
  official: "bg-ordift-navy-950/70 text-white",
  community: "bg-white/90 text-ordift-ink",
  archived: "bg-black/50 text-white",
};

export default function JournalPostCard({
  post,
  categories,
  author,
}: {
  post: StoriesFeedItem;
  categories: Category[];
  author: Author | null;
}) {
  return (
    <Link
      href={post.href}
      className={`block rounded-xl bg-white border border-black/10 overflow-hidden transition-colors hover:border-black/20 ${
        post.trustBadge === "archived" ? "opacity-60" : ""
      }`}
    >
      <div className="relative">
        <MediaAsset
          media={post.heroMedia}
          aspectRatio="16/10"
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
        {post.featured && (
          <span className="absolute top-3 left-3 inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-gold text-ordift-navy-950">
            Featured
          </span>
        )}
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
          {post.isVideo && (
            <span className="inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-navy-950/70 text-white">
              Video
            </span>
          )}
          <span
            className={`inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] ${TRUST_BADGE_CLASS[post.trustBadge]}`}
          >
            {TRUST_BADGE_LABEL[post.trustBadge]}
          </span>
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <p className="font-sans font-semibold uppercase tracking-[0.15em] text-eyebrow text-ordift-gold-pressed mb-2">
          {categories.map((c) => c.name).join(" · ")}
        </p>
        <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink mb-2 leading-snug">
          {post.title}
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted">
          {[author?.name, formatDate(post.publishedAt), `${post.readingTimeMinutes} min read`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </Link>
  );
}
