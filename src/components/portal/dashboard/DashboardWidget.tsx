import Link from "next/link";
import type { ReactNode } from "react";

// The shared shell every dashboard widget renders inside — a client
// workspace built as an extensible grid of independent widgets, not a
// fixed layout. Adding a future widget (Payments, Messages, a Vendor/
// Model Portal card, Analytics, a future business module) means adding
// another <DashboardWidget> to the grid in the page, never redesigning
// this shell or the widgets around it.
type DashboardWidgetProps = {
  title: string;
  action?: { label: string; href: string };
  children: ReactNode;
  className?: string;
  id?: string;
};

export default function DashboardWidget({
  title,
  action,
  children,
  className = "",
  id,
}: DashboardWidgetProps) {
  return (
    <section
      id={id}
      className={`bg-white border border-black/10 rounded-2xl p-6 flex flex-col ${className}`}
    >
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="font-serif text-body font-medium text-ordift-ink">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="font-sans text-caption text-ordift-gold-pressed underline underline-offset-4 whitespace-nowrap"
          >
            {action.label}
          </Link>
        )}
      </div>
      <div className="flex-1 flex flex-col">{children}</div>
    </section>
  );
}
