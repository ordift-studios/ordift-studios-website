"use client";

import { NextStudio } from "next-sanity/studio";
import config from "../../../../sanity.config";

// "use client" is required here, not optional: Sanity's Studio bundle
// pulls in browser-only UI dependencies (e.g. swr) that don't resolve
// under the "react-server" export condition Turbopack applies to Server
// Components. Importing sanity.config.ts (which pulls in structureTool's
// full UI bundle) from a Server Component crashes the route — confirmed
// while wiring this up (2026-07-23). Keeping this import inside a
// dedicated client-boundary file, separate from page.tsx, is what lets
// page.tsx stay a Server Component (needed for the `dynamic` route
// config export below/in page.tsx — that export is invalid inside a
// "use client" file).
export default function Studio() {
  return <NextStudio config={config} />;
}
