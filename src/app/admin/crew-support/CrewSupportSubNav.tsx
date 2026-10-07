import Link from "next/link";

// Persistent in-section navigation so Capabilities is always one click
// from Requests (and back), instead of a text link buried in a page body.
export default function CrewSupportSubNav({ active }: { active: "requests" | "capabilities" }) {
  const tab = (key: "requests" | "capabilities", href: string, label: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`rounded-full border px-4 py-1.5 font-sans text-body-small ${active === key ? "border-ordift-ink bg-ordift-ink text-white" : "border-black/15 text-ordift-ink-muted hover:text-ordift-ink"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Crew Support sections" className="flex flex-wrap gap-2">
      {tab("requests", "/admin/crew-support", "Requests")}
      {tab("capabilities", "/admin/crew-support/capabilities", "Crew capabilities")}
    </nav>
  );
}
