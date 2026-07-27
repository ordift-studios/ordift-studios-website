import { notFound } from "next/navigation";
import { isStaging } from "@/lib/shared/env";

// Internal design/dev showcase — never reachable in a real production
// deployment, regardless of who finds or guesses the URL. `robots.ts`
// already excludes it from crawling, but that's a request search
// engines can ignore, not access control; this is the actual gate.
// Applies to every route under /style-preview via this shared layout,
// so a new page added here later is covered automatically.
export default function StylePreviewLayout({ children }: { children: React.ReactNode }) {
  if (!isStaging()) notFound();
  return children;
}
