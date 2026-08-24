import Link from "next/link";
import Image from "next/image";
import type { StoriesFeedItem } from "@/lib/content/storiesFeed";
import { TRUST_BADGE_LABEL } from "@/lib/content/storiesFeed";

// Journal Hero / Lead Story (Phase E, 2026-08-24) — one admin-picked
// item (see journalSettings.leadStory, never auto-computed), rendered
// full-bleed with minimal chrome, matching the approved "large
// photography, negative space" direction. Renders nothing when unset.
export default function LeadStorySection({ item }: { item: StoriesFeedItem | null }) {
  if (!item) return null;

  return (
    <Link href={item.href} className="group relative block w-full h-[75vh] sm:h-[85vh] overflow-hidden">
      {item.heroMedia.url && (
        <Image
          src={item.heroMedia.url}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
      <div className="relative h-full flex flex-col items-start justify-end px-4 sm:px-8 pb-12 sm:pb-16 max-w-6xl mx-auto">
        <span className="inline-block rounded-full px-3 py-1 mb-4 font-sans text-caption font-semibold uppercase tracking-[0.1em] bg-ordift-gold text-ordift-navy-950">
          {TRUST_BADGE_LABEL[item.trustBadge]}
        </span>
        <h1 className="font-serif font-medium text-page-title sm:text-page-title-tablet lg:text-page-title-desktop text-white max-w-3xl leading-tight">
          {item.title}
        </h1>
      </div>
    </Link>
  );
}
