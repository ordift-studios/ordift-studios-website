"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The homepage's Who We Are, Departments and Process sections now live on their own pages. If a visitor arrives at an old section address
// (for example /#departments), send them to the page that now holds that content instead of leaving them on a page with no such section.
const MOVED: Record<string, string> = {
  about: "/about", "who-we-are": "/about", mission: "/about", vision: "/about", values: "/about",
  departments: "/services", services: "/services", process: "/process", team: "/team",
};

export default function LegacyHomeAnchors() {
  const router = useRouter();
  useEffect(() => {
    const target = MOVED[window.location.hash.replace(/^#/, "").toLowerCase()];
    if (target) router.replace(target);
  }, [router]);
  return null;
}
