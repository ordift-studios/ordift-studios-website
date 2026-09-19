"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { workspaceTabsForKind } from "@/lib/portal/workspaceTabs";
import type { ProjectKind } from "@/lib/portal/workspace";

export default function TabNav({ basePath, kind }: { basePath: string; kind: ProjectKind }) {
  const pathname = usePathname();
  const tabs = workspaceTabsForKind(kind);

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-black/10 mb-8">
      {tabs.map((tab) => {
        const href = tab.slug ? `${basePath}/${tab.slug}` : basePath;
        const isActive = pathname === href;
        return (
          <Link
            key={tab.slug || "overview"}
            href={href}
            className={`px-4 py-3 font-sans text-body-small whitespace-nowrap border-b-2 -mb-px transition-colors ${
              isActive
                ? "border-ordift-gold-pressed text-ordift-ink font-medium"
                : "border-transparent text-ordift-ink-muted hover:text-ordift-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
