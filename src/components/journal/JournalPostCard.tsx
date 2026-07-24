import Link from "next/link";
import type { Author, Category, JournalPost } from "@/lib/content/types";
import { estimateReadingTime, formatDate } from "@/lib/content/journalHelpers";

export default function JournalPostCard({
  post,
  categories,
  author,
}: {
  post: JournalPost;
  categories: Category[];
  author: Author | null;
}) {
  return (
    <Link
      href={`/journal/${post.slug}`}
      className="block rounded-xl bg-white border border-black/10 overflow-hidden transition-colors hover:border-black/20"
    >
      <div className="aspect-[16/10] bg-ordift-navy-900/10 relative">
        {post.featured && (
          <span className="absolute top-3 left-3 inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-gold text-ordift-navy-950">
            Featured
          </span>
        )}
        {post.format === "video" && (
          <span className="absolute top-3 right-3 inline-block rounded-full px-3 py-1 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-navy-950/70 text-white">
            Video
          </span>
        )}
      </div>
      <div className="p-4 sm:p-5">
        <p className="font-sans font-semibold uppercase tracking-[0.15em] text-eyebrow text-ordift-gold-pressed mb-2">
          {categories.map((c) => c.name).join(" · ")}
        </p>
        <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink mb-2 leading-snug">
          {post.title}
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted">
          {[author?.name, formatDate(post.publishedAt), `${estimateReadingTime(post.body)} min read`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </Link>
  );
}
