import Link from "next/link";
import MediaPlaceholder from "@/components/media/MediaPlaceholder";

type DepartmentCardProps = {
  name: string;
  description: string;
  href: string;
};

export default function DepartmentCard({
  name,
  description,
  href,
}: DepartmentCardProps) {
  return (
    <Link
      href={href}
      className="block rounded-xl border border-black/10 bg-white p-5 sm:p-6 shadow-sm transition-all hover:border-black/20 hover:shadow-md hover:-translate-y-0.5"
    >
      <MediaPlaceholder aspectRatio="4/3" tone="light" className="rounded-lg mb-4" />
      <p className="font-serif font-medium text-card-title lg:text-card-title-desktop text-ordift-ink mb-1">
        {name}
      </p>
      <p className="font-sans text-body-small text-ordift-ink-muted mb-3">
        {description}
      </p>
      <span className="font-sans text-body-small text-ordift-gold-pressed">
        Discover more →
      </span>
    </Link>
  );
}
