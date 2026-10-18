import Link from "next/link";

const SECTIONS = [
  { key: "directory", label: "Directory", href: "/admin/organisations" },
  { key: "contacts", label: "Contacts", href: "/admin/organisations/contacts" },
  { key: "applications", label: "Supplier applications", href: "/admin/organisations/applications" },
  { key: "link-enquiries", label: "Link enquiries", href: "/admin/organisations/link-enquiries" },
] as const;

export default function OrganisationsSubNav({ active }: { active: (typeof SECTIONS)[number]["key"] }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:flex-wrap sm:overflow-visible">
      {SECTIONS.map((s) => (
        <Link
          key={s.key}
          href={s.href}
          className={`shrink-0 rounded-lg px-4 py-2 font-sans text-body-small whitespace-nowrap ${active === s.key ? "bg-ordift-ink text-white" : "text-ordift-ink-muted hover:bg-black/5"}`}
        >
          {s.label}
        </Link>
      ))}
    </div>
  );
}
