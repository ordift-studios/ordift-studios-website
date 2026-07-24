import Link from "next/link";

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
      className="block rounded-xl border border-black/10 bg-ordift-offwhite p-5 sm:p-6 transition-colors hover:border-black/20"
    >
      <div className="aspect-[4/3] rounded-lg bg-ordift-navy-900/10 mb-4" />
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
