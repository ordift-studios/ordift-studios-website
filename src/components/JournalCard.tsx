import Link from "next/link";

type JournalCardProps = {
  title: string;
  category: string;
  date: string;
  href: string;
};

export default function JournalCard({
  title,
  category,
  date,
  href,
}: JournalCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-xl bg-white border border-black/10 overflow-hidden transition-colors hover:border-black/20"
    >
      <div className="aspect-[16/10] bg-ordift-navy-900/10" />
      <div className="p-4 sm:p-5">
        <p className="font-sans font-semibold uppercase tracking-[0.15em] text-eyebrow text-ordift-gold-pressed mb-2">
          {category}
        </p>
        <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink mb-2 leading-snug">
          {title}
        </p>
        <p className="font-sans text-caption text-ordift-ink-muted">{date}</p>
      </div>
    </Link>
  );
}
